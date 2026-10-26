import {
  flushNativeSessionCookies,
  persistentSessionKey,
} from "../interaction/persistentSession";
import { reactive } from "vue";
import { logoutAll, pendingLogout, logoutEvent } from "./logout";
import { choreRequest, savedChoreToken, saveChoreToken } from "./chores";
import { forgetDorm } from "./dormHistory";

export interface EmailRoom {
  id: number;
  name: string;
  invite_code: string;
  member_id: number;
  nickname: string;
  marker_id: string;
  is_creator: boolean | number;
}
export interface EmailEntry extends EmailRoom {
  access_token: string;
}
export const emailAccount = reactive({
  available: false,
  version: "",
  // Until config is known, never expose the legacy entry as a fallback.
  required: true,
  loaded: false,
  loggedIn: false,
  email: "",
  mailEnabled: false,
  rooms: [] as EmailRoom[],
});
export async function emailPost<T>(
  path: string,
  values: unknown = {},
): Promise<T> {
  // Finish an interrupted sign-out before allowing verification to create a new cookie.
  if (pendingLogout()) await logoutAll();
  const result = await choreRequest<T>(`/email/${path}`, "", {
    method: "POST",
    headers: { "X-Dorm-Email": "1" },
    body: JSON.stringify(values),
  });
  // The verification response has just set the HttpOnly session cookie. Ask
  // Android WebView to persist it before the verification flow proceeds.
  if (path === "verify") await flushNativeSessionCookies();
  if (["verify", "bind", "preferences", "unbind"].includes(path))
    invalidateAccountRead();
  return result;
}
export function enterEmailRoom(dormId: number) {
  const room = emailAccount.rooms.find((room) => room.id === dormId);
  const token = room ? savedChoreToken(room.invite_code, room.member_id) : "";
  return emailPost<EmailEntry>("enter", {
    dorm_id: dormId,
    ...(token ? { member_token: token } : {}),
  });
}
let accountEpoch = 0;
let accountRead: { epoch: number; promise: Promise<void> } | null = null;
function invalidateAccountRead() {
  accountEpoch++;
  accountRead = null;
}
export const identityUnboundEvent = "dorm-email-identity-unbound";
const unboundStorageKey = "dorm-email-unbound-v1";
function clearUnboundIdentity(room: EmailRoom) {
  invalidateAccountRead();
  emailAccount.rooms = emailAccount.rooms.filter((r) => r.id !== room.id);
  const token = savedChoreToken(room.invite_code, room.member_id);
  saveChoreToken(room.invite_code, room.member_id, "");
  for (const [storage, key] of [
    [localStorage, "dorm-email-admin-grant"],
    [localStorage, persistentSessionKey],
    [sessionStorage, "dorm-token"],
  ] as const)
    if (token && storage.getItem(key) === token) storage.removeItem(key);
  forgetDorm(room.invite_code);
  try {
    const choice = JSON.parse(
      localStorage.getItem("dorm-guest-view-v1") || "{}",
    );
    if (
      choice.invite_code === room.invite_code &&
      choice.member_id === room.member_id
    )
      localStorage.removeItem("dorm-guest-view-v1");
  } catch {
    /* No persisted selection. */
  }
  window.dispatchEvent(new CustomEvent(identityUnboundEvent, { detail: room }));
}
export async function unbindEmailIdentity(room: EmailRoom) {
  await emailPost("unbind", { dorm_id: room.id, member_id: room.member_id });
  clearUnboundIdentity(room);
  localStorage.setItem(
    unboundStorageKey,
    JSON.stringify({ room, at: Date.now() }),
  );
}
function resetAccount() {
  invalidateAccountRead();
  emailAccount.loggedIn = false;
  emailAccount.email = "";
  emailAccount.rooms = [];
  emailAccount.mailEnabled = false;
}
window.addEventListener(logoutEvent, resetAccount);
window.addEventListener("storage", (event) => {
  if (event.key === unboundStorageKey && event.newValue) {
    try {
      clearUnboundIdentity(JSON.parse(event.newValue).room);
    } catch {
      /* Ignore malformed storage. */
    }
  }
  if (event.key === "dorm-pending-logout-v1" && event.newValue !== null) {
    resetAccount();
    window.dispatchEvent(new Event(logoutEvent));
  }
});
export async function refreshEmailAccount() {
  if (pendingLogout()) {
    resetAccount();
    await logoutAll();
  }
  const epoch = accountEpoch;
  if (accountRead?.epoch === epoch) return accountRead.promise;
  const promise = (async () => {
    const [config, account] = await Promise.all([
      choreRequest<{
        available: boolean;
        registration_required: boolean;
        version?: string;
      }>("/email/config"),
      choreRequest<{
        logged_in: boolean;
        email?: string;
        mail_enabled?: boolean;
        rooms?: EmailRoom[];
      }>("/email/me"),
    ]);
    if (epoch !== accountEpoch || pendingLogout()) return;
    emailAccount.available = config.available;
    emailAccount.version = config.version || "";
    emailAccount.required = config.registration_required;
    emailAccount.loggedIn = account.logged_in;
    emailAccount.email = account.email || "";
    emailAccount.mailEnabled = !!account.mail_enabled;
    emailAccount.rooms = account.rooms || [];
    emailAccount.loaded = true;
  })()
    .catch((error) => {
      if (epoch === accountEpoch) throw error;
    })
    .finally(() => {
      if (accountRead?.promise === promise) accountRead = null;
    });
  accountRead = { epoch, promise };
  return promise;
}
