import { persistentSessionKey } from "../interaction/persistentSession";
import { choreRequest } from "./chores";
import { showToast } from "../interaction/notice";

const pendingKey = "dorm-pending-logout-v1";
export const logoutEvent = "dorm-signed-out";
let running: Promise<void> | null = null;
export function pendingLogout() {
  return !!localStorage.getItem(pendingKey);
}
function credentials() {
  const values = [
    sessionStorage.getItem("dorm-token"),
    localStorage.getItem("dorm-email-admin-grant"),
    localStorage.getItem(persistentSessionKey),
  ];
  for (const key of Object.keys(localStorage))
    if (key.startsWith("dorm-chore-device-v1:"))
      values.push(localStorage.getItem(key));
  try {
    values.push(...JSON.parse(localStorage.getItem(pendingKey) || "[]"));
  } catch {
    /* Recover valid local credentials. */
  }
  return [
    ...new Set(
      values.filter(
        (v): v is string => typeof v === "string" && /^[a-f0-9]{64}$/i.test(v),
      ),
    ),
  ];
}
function clearLocal() {
  sessionStorage.removeItem("dorm-token");
  for (const key of Object.keys(localStorage))
    if (
      key.startsWith("dorm-chore-device-v1:") ||
      [
        "dorm-email-admin-grant",
        persistentSessionKey,
        "dorm-owner-token",
        "dorm-guest-view-v1",
        "dorm-joined-rooms-v1",
      ].includes(key)
    )
      localStorage.removeItem(key);
  window.dispatchEvent(new Event(logoutEvent));
}
export function logoutAll(): Promise<void> {
  if (running) return running;
  const tokens = credentials();
  // Remember incomplete revocations so an HttpOnly cookie cannot silently re-enter.
  localStorage.setItem(pendingKey, JSON.stringify(tokens));
  clearLocal();
  running = (async () => {
    const results = await Promise.allSettled([
      ...(tokens.length ? tokens : [""]).map((token) =>
        choreRequest("/auth/logout", token, { method: "POST", body: "{}" }),
      ),
      choreRequest("/email/logout", "", {
        method: "POST",
        headers: { "X-Dorm-Email": "1" },
        body: "{}",
      }),
    ]);
    if (results.some((result) => result.status === "rejected")) {
      showToast("服务端会话未撤销，请联网后重试退出");
      throw new Error("已退出本机，服务端会话未撤销；请联网后重试退出。");
    }
    localStorage.removeItem(pendingKey);
  })().finally(() => {
    running = null;
  });
  return running;
}
