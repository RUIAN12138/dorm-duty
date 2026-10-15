import { choreRequest } from "./chores";
export interface ReminderPlan {
  enabled: boolean;
  times: string[];
  version: number;
  timezone: "Asia/Shanghai";
  updated_at: string | null;
  last_reminder: null | {
    created_at: string;
    devices: number;
    pending: number;
    accepted: number;
    failed: number;
    cancelled: number;
  };
}
export function getReminderPlan(token: string, signal?: AbortSignal) {
  return choreRequest<ReminderPlan>("/chores/reminder-plan", token, { signal });
}
export function saveReminderPlan(
  token: string,
  plan: Pick<ReminderPlan, "enabled" | "times" | "version">,
  signal?: AbortSignal,
) {
  return choreRequest<ReminderPlan>("/chores/reminder-plan", token, {
    method: "PATCH",
    body: JSON.stringify(plan),
    signal,
  });
}
