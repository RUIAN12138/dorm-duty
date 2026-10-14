import { ApiError, query } from "./index";
import { networkState } from "./network";
import { appPath } from "./path";
import type { Duty } from "./types";

export interface GuestMember {
  user_id: number;
  nickname: string;
  marker_id?: string;
}
export interface GuestDorm {
  id: number;
  name: string;
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

// The viewing identity is separate from the authenticated management session.
// A guest request never carries a stored account token or changes that session.
export async function guestApi<T>(
  path: "/guest/dorm" | "/guest/tasks",
  params: { invite_code?: string; member_id?: number },
  signal: AbortSignal,
): Promise<T> {
  return guestRequest<T>(path, params, signal);
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}
async function guestRequest<T>(
  path: "/guest/dorm" | "/guest/tasks" | "/guest/create",
  params: { invite_code?: string; member_id?: number },
  signal: AbortSignal,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const suffix = query(params);
    const response = await fetch(
      `${appPath(path)}${suffix ? `?${suffix}` : ""}`,
      {
        ...options,
        signal: controller.signal,
        headers: { Accept: "application/json", ...options.headers },
        credentials: "same-origin",
        cache: "no-store",
      },
    );
    networkState.unreachable = false;
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        response.status,
        data?.detail?.message || "无法查看任务，请稍后重试",
      );
    return data as T;
  } catch (error) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (error instanceof ApiError) throw error;
    networkState.unreachable = true;
    throw new Error(
      navigator.onLine ? "连接服务失败，请稍后重试" : "当前离线，请联网后重试",
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}
