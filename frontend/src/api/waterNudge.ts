import { ApiError } from ".";
// One shared sender per device identity/task, including across tab-page remounts.
const flights = new Set<string>();
const sent = new Map<string, number>();
const receipts = new Map<string, string>();
const receiptKey = (key: string) => `dorm-water-nudge-receipt-v1:${key}`;
export function lastWaterNudge(key: string): string | null {
  let value = receipts.get(key);
  try {
    value = localStorage.getItem(receiptKey(key)) || value;
  } catch {
    /* In-memory receipt remains available. */
  }
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}
export function waterNudgeTime(value: string, now = new Date()): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60000));
  if (minutes < 1) return "刚刚已提醒";
  if (minutes < 60) return `${minutes}分钟前已提醒`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}小时前已提醒`;
  return `${Math.floor(minutes / 1440)}天前已提醒`;
}
export async function waterNudge(
  key: string,
  send: () => Promise<unknown>,
  now = Date.now,
): Promise<"sent" | "sending" | "recent"> {
  if (flights.has(key)) return "sending";
  let previous = sent.get(key) || 0;
  try {
    previous = Math.max(
      previous,
      Number(localStorage.getItem(`dorm-water-nudge-v1:${key}`)) || 0,
    );
  } catch {
    /* In-memory limit remains. */
  }
  const elapsed = now() - previous;
  if (previous && elapsed >= 0 && elapsed < 60000) return "recent";
  flights.add(key);
  try {
    let recent = false;
    try {
      const receipt = await send();
      const createdAt = (receipt as { created_at?: unknown } | null)
        ?.created_at;
      if (
        typeof createdAt === "string" &&
        Number.isFinite(Date.parse(createdAt))
      ) {
        receipts.set(key, createdAt);
        try {
          localStorage.setItem(receiptKey(key), createdAt);
        } catch {
          /* Storage is optional. */
        }
      }
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 429) throw error;
      recent = true;
    }
    const time = now();
    sent.set(key, time);
    try {
      localStorage.setItem(`dorm-water-nudge-v1:${key}`, String(time));
    } catch {
      /* Storage is optional. */
    }
    return recent ? "recent" : "sent";
  } finally {
    flights.delete(key);
  }
}
