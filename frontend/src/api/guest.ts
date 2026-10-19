import { query } from "./index";
import { requestJson } from "./transport";
import type { Duty } from "./types";

export interface GuestMember {
  user_id: number;
  nickname: string;
  marker_id?: string;
}
export interface GuestDorm {
  id: number;
  name: string;
  is_demo: boolean;
  members: GuestMember[];
}
export interface GuestTasks {
  today: string;
  server_time: string;
  member: GuestMember;
  today_task: Duty | null;
  next_task: Duty | null;
}
export interface GuestCreation {
  access_token: string;
  invite_code: string;
  member_id: number;
  dorm: GuestDorm;
}

// Public lookup exposes only a room summary. Restore may carry the explicitly
// selected room's member/owner token; it never changes the management session.
export async function guestApi<T>(
  path: "/guest/dorm" | "/guest/tasks",
  params: { invite_code?: string; member_id?: number },
  signal: AbortSignal,
  token = "",
): Promise<T> {
  return guestRequest<T>(path, params, signal, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
export function createGuestDorm(
  values: {
    name: string;
    nickname: string;
    members: string[];
    marker_id?: string;
  },
  signal: AbortSignal,
) {
  return guestRequest<GuestCreation>("/guest/create", {}, signal, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Dorm-Email": "1" },
    body: JSON.stringify(values),
  });
}
async function guestRequest<T>(
  path: "/guest/dorm" | "/guest/tasks" | "/guest/create",
  params: { invite_code?: string; member_id?: number },
  signal: AbortSignal,
  options: RequestInit = {},
): Promise<T> {
  const suffix = query(params);
  return requestJson<T>(
    `${path}${suffix ? `?${suffix}` : ""}`,
    { ...options, signal },
    "无法查看任务，请稍后重试",
  );
}
