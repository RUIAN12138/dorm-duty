import { reactive } from "vue";
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
  required: false,
  loaded: false,
  loggedIn: false,
  email: "",
  mailEnabled: false,
  rooms: [] as EmailRoom[],
});
export const emailPost = <T>(path: string, values: unknown = {}) =>
  choreRequest<T>(`/email/${path}`, "", {
    method: "POST",
    headers: { "X-Dorm-Email": "1" },
    body: JSON.stringify(values),
  });
export function enterEmailRoom(dormId: number) {
  const room = emailAccount.rooms.find((room) => room.id === dormId);
  const token = room ? savedChoreToken(room.invite_code, room.member_id) : "";
  return emailPost<EmailEntry>("enter", {
    dorm_id: dormId,
    ...(token ? { member_token: token } : {}),
  });
}
export async function refreshEmailAccount() {
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
  emailAccount.available = config.available;
  emailAccount.required = config.registration_required;
  emailAccount.loggedIn = account.logged_in;
  emailAccount.email = account.email || "";
  emailAccount.mailEnabled = !!account.mail_enabled;
  emailAccount.rooms = account.rooms || [];
  emailAccount.loaded = true;
}
