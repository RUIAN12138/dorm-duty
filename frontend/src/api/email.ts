import { reactive } from "vue";
import { logoutAll, pendingLogout, logoutEvent } from "./logout";
import { choreRequest, savedChoreToken } from "./chores";

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
  return choreRequest<T>(`/email/${path}`, "", {
    method: "POST",
    headers: { "X-Dorm-Email": "1" },
    body: JSON.stringify(values),
  });
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
function resetAccount() {
  accountEpoch++;
  emailAccount.loggedIn = false;
  emailAccount.email = "";
  emailAccount.rooms = [];
  emailAccount.mailEnabled = false;
}
window.addEventListener(logoutEvent, resetAccount);
window.addEventListener("storage", (event) => {
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
  const [config, account] = await Promise.all([
    choreRequest<{ available: boolean; registration_required: boolean }>(
      "/email/config",
    ),
    choreRequest<{
      logged_in: boolean;
      email?: string;
      mail_enabled?: boolean;
      rooms?: EmailRoom[];
    }>("/email/me"),
  ]);
  if (epoch !== accountEpoch || pendingLogout()) return;
  emailAccount.available = config.available;
  emailAccount.required = config.registration_required;
  emailAccount.loggedIn = account.logged_in;
  emailAccount.email = account.email || "";
  emailAccount.mailEnabled = !!account.mail_enabled;
  emailAccount.rooms = account.rooms || [];
  emailAccount.loaded = true;
}
