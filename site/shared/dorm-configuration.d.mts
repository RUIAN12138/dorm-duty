export function validateDormConfiguration(value: unknown): unknown;
export function configuredTaskMode(task: { key?: string; rotation?: string } | null | undefined): "scheduled" | "self_round" | "completion";
export function configuredTaskPolicy(task: { policy?: string; execution_time?: string } | undefined, configuration: { policy?: string } | null | undefined): { hard: boolean; executionTime: string };
export function canCompleteTaskWithRules(
  task: { status: string; duty_date: string; assignee_id: number } | null | undefined,
  category: { enabled: boolean; version2?: boolean; hardPolicy?: boolean; executionTime?: string } | null | undefined,
  who: { user_id: number; is_demo?: boolean } | null | undefined,
  today: string, nowIso: string,
): boolean;
