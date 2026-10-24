// Same server-issued token, no new lifetime and no native/logging copies.
export const persistentSessionKey = "dorm-auth-token-v1";
const sessionTokenKey = "dorm-token";
const emailGrantKey = "dorm-email-admin-grant";

type StorageArea = "local" | "session";

function getStorage(area: StorageArea): Storage | null {
  try {
    return area === "local" ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function read(area: StorageArea, key: string): string | null {
  try {
    return getStorage(area)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(area: StorageArea, key: string, value: string) {
  try {
    const storage = getStorage(area);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function remove(area: StorageArea, key: string) {
  try {
    getStorage(area)?.removeItem(key);
  } catch {
    /* Storage may be unavailable in an embedded or private browsing context. */
  }
}

export function restoreSessionToken() {
  // localStorage is the durable source of truth. A restored WebView page can
  // carry an older sessionStorage snapshot after another tab has logged in.
  // Keep the old keys as fallbacks for installations upgrading from v1.
  const token =
    read("local", persistentSessionKey) ||
    read("local", emailGrantKey) ||
    read("session", sessionTokenKey);
  if (token && read("session", sessionTokenKey) !== token)
    write("session", sessionTokenKey, token);
  return token;
}
export function persistSessionToken(token: string) {
  // Persist the canonical copy first; the session copy only serves legacy
  // callers and is refreshed from the canonical value on restore.
  write("local", persistentSessionKey, token);
  write("session", sessionTokenKey, token);
}
export function forgetSessionToken() {
  remove("session", sessionTokenKey);
  remove("local", persistentSessionKey);
  remove("local", emailGrantKey);
}

export function forgetSessionTokenIfCurrent(token: string) {
  if (!token || restoreSessionToken() !== token) return false;
  // All three keys alias one current identity. Once that identity is rejected,
  // an older fallback must not be restored on the next request or cold start.
  forgetSessionToken();
  return true;
}
