import { query } from "./index";
import { requestJson } from "./transport";

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
  reminder_interval_days?: number;
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
  water_handoff?: WaterHandoff | null;
  task: ChoreTask;
  next_water: ChoreTask | null;
  version: number;
}
export interface WaterHandoff {
  steps?: { member_id: number; task_id: number; completed_at: string }[];
  id: number;
  sequence: number;
  from_member_id: number;
  completed_at: string;
}
export interface ChoreReminder {
  source?: "member" | "scheduled" | "note";
  id: number;
  title?: string;
  body?: string;
  sender_name?: string;
  sender_id?: number | null;
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
  water_advance_task_id?: number | null;
  overdue_categories?: { key: string; name: string; days: number }[];
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
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  return requestJson<T>(path, { ...options, headers });
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
    headers: { "X-Dorm-Email": "1" },
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
  last_completed?: { key: string; completed_at: string }[];
  recent_records: ChoreRecord[];
  recent_truncated: boolean;
}
