import { ApiError, query } from "./index";
import { networkState } from "./network";
import { appPath } from "./path";

export interface ChoreMember {
  user_id: number;
  nickname: string;
  marker_id: string;
}
export interface ChoreCategory {
  key: "floor" | "toilet" | "sink" | "water";
  name: string;
  content: string;
  deadline_time: string;
  start_date: string;
  weekdays: number[];
  rotation_days: number;
  rotation_order: number[];
  enabled: boolean;
  mode: "scheduled" | "self_round" | "completion";
}
export interface ChoreTask {
  id: number;
  key: "floor" | "toilet" | "sink" | "water";
  name: string;
  content: string;
  duty_date: string;
  assignee_id: number;
  assignee_name: string;
  marker_id: string;
  deadline_at: string;
  status: "pending" | "completed";
  completed_at: string | null;
  can_complete: boolean;
  sequence?: number;
  mode: ChoreCategory["mode"];
}
export interface ChoreRecord {
  revision?: number;
  corrected?: boolean;
  id: number;
  key: string;
  name: string;
  assignee_id: number;
  assignee_name: string;
  marker_id: string;
  completed_at: string;
  completed_date: string;
}
export interface ChoreCompletion {
  task: ChoreTask;
  next_water: ChoreTask | null;
  version: number;
}
export interface WaterHandoff {
  id: number;
  sequence: number;
  from_member_id: number;
  completed_at: string;
}
export interface ChoreReminder {
  id: number;
  title?: string;
  body?: string;
  sender_name?: string;
  task_name?: string;
  created_at: string;
  read_at: string | null;
}
export interface ChoreBoardData {
  today: string;
  server_time: string;
  version: number;
  is_creator: boolean;
  member: ChoreMember;
  members: ChoreMember[];
  categories: ChoreCategory[];
  rounds: {
    key: "floor" | "toilet" | "sink";
    sequence: number;
    completed: number;
    total: number;
    members: (ChoreMember & { completed: boolean })[];
    completions: (ChoreMember & { id: number; completed_at: string })[];
  }[];
  today_tasks: ChoreTask[];
  next_tasks: ChoreTask[];
  water_task: ChoreTask | null;
  water_handoff?: WaterHandoff | null;
  undo_tasks: ChoreTask[];
  water_order: number[];
  calendar: ChoreRecord[];
  calendar_neighbors?: Record<string, ChoreRecord[]>;
  reminders: ChoreReminder[];
}
export interface ChoreClaim {
  access_token: string;
  member: ChoreMember;
  is_creator: boolean;
}

const tokenKey = (invite: string, memberId: number) =>
  `dorm-chore-device-v1:${invite}:${memberId}`;
export function savedChoreToken(invite: string, memberId: number) {
  try {
    return localStorage.getItem(tokenKey(invite, memberId)) || "";
  } catch {
    return "";
  }
}
export function saveChoreToken(
  invite: string,
  memberId: number,
  token: string,
) {
  try {
    if (token) localStorage.setItem(tokenKey(invite, memberId), token);
    else localStorage.removeItem(tokenKey(invite, memberId));
  } catch {
    /* The selected identity can still work for this visit. */
  }
}
export async function choreRequest<T>(
  path: string,
  token = "",
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const signal = options.signal;
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, 15000);
  try {
    const response = await fetch(appPath(path), {
      ...options,
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    networkState.unreachable = false;
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        response.status,
        data?.detail?.message || "操作失败，请稍后重试",
      );
    return data as T;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (error instanceof ApiError) throw error;
    networkState.unreachable = true;
    throw new Error(
      navigator.onLine ? "连接服务失败，请稍后重试" : "当前离线，请联网后重试",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
export function claimChoreIdentity(
  values: {
    invite_code: string;
    nickname: string;
    member_id?: number;
    marker_id?: string;
  },
  signal?: AbortSignal,
) {
  return choreRequest<ChoreClaim>("/chores/claim", "", {
    method: "POST",
    body: JSON.stringify(values),
    signal,
  });
}
export function getChoreBoard(
  invite: string,
  memberId: number,
  month: string,
  token: string,
  signal?: AbortSignal,
) {
  return choreRequest<ChoreBoardData>(
    `/chores/board?${query({ invite_code: invite, member_id: memberId, month })}`,
    token,
    { signal },
  );
}

export interface ChoreActivity {
  start: string;
  today: string;
  daily: { date: string; key: string; count: number }[];
  recent_records: ChoreRecord[];
  recent_truncated: boolean;
}
