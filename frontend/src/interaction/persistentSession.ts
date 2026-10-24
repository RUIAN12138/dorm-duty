// Same server-issued token, no new lifetime and no native/logging copies.
export const persistentSessionKey = "dorm-auth-token-v1";
export function restoreSessionToken() {
  let token = sessionStorage.getItem("dorm-token");
  if (!token) {
    try {
      token =
        localStorage.getItem("dorm-email-admin-grant") ||
        localStorage.getItem(persistentSessionKey);
      if (token) sessionStorage.setItem("dorm-token", token);
    } catch {
      /* Storage may be unavailable; server verification remains required. */
    }
  }
  return token;
}
export function persistSessionToken(token: string) {
  sessionStorage.setItem("dorm-token", token);
  try {
    localStorage.setItem(persistentSessionKey, token);
  } catch {
    /* Session-only fallback. */
  }
}
export function forgetSessionToken() {
  sessionStorage.removeItem("dorm-token");
  try {
    localStorage.removeItem(persistentSessionKey);
  } catch {
    /* Optional persistence. */
  }
}
