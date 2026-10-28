// A draft fingerprint maps to a random key scoped to the authenticated account.
// Only hashes and random IDs are stored here, never the draft or a token.
const memory = new Map<string, Map<string, string>>();
const keyFor = (account: string) => `dorm-create-request-v1:${encodeURIComponent(account.trim().toLowerCase())}`;
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export async function creationRequestId(account: string, payload: unknown): Promise<string> {
  if (!account.trim() || !globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues)
    throw new Error('设备无法安全准备创建请求，请使用安全连接后重试。');
  const key = keyFor(account);
  const fingerprint = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)))));
  let records = memory.get(key);
  if (!records) {
    records = new Map();
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      const entries = Array.isArray(saved?.entries) ? saved.entries : saved?.fingerprint ? [[saved.fingerprint,saved.requestId]] : [];
      for (const entry of entries.slice(0,64))
        if (Array.isArray(entry) && /^[a-f0-9]{64}$/.test(entry[0]) && /^[a-f0-9]{32}$/.test(entry[1])) records.set(entry[0],entry[1]);
    } catch { /* In-memory retries still work when storage is unavailable. */ }
    memory.set(key,records);
  }
  let requestId = records.get(fingerprint);
  if (!requestId) {
    // Never silently evict an unresolved request: doing so could duplicate a
    // room whose successful response was lost.
    if (records.size >= 64) throw new Error('待确认的创建记录过多，请先在宿舍列表检查是否已创建。');
    requestId = hex(crypto.getRandomValues(new Uint8Array(16)));
    records.set(fingerprint,requestId);
  }
  try { localStorage.setItem(key,JSON.stringify({entries:[...records]})); } catch {}
  return requestId;
}
export function clearCreationRequest(account: string, requestId: string) {
  if (!account.trim() || !/^[a-f0-9]{32}$/.test(requestId)) return;
  const key = keyFor(account);
  const records = memory.get(key);
  if (!records) return;
  for (const [fingerprint, id] of records) {
    if (id === requestId) records.delete(fingerprint);
  }
  try {
    if (records.size) localStorage.setItem(key, JSON.stringify({entries:[...records]}));
    else localStorage.removeItem(key);
  } catch {}
}
