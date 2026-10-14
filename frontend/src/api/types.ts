export interface User {
  id: number;
  username: string;
  nickname: string;
  current_dorm_id: number | null;
  push_enabled: boolean;
}
export interface Member {
  user_id: number;
  nickname: string;
  role: "admin" | "member";
}
export interface ScheduleRules {
  weekdays: number[];
  rotation_days: number;
  horizon_days: number;
  skip_dates: string[];
  weekly_tasks: Record<
    string,
    { task_text?: string | null; deadline_time?: string | null }
  >;
}
export interface PreviewDay {
  duty_date: string;
  task: {
    assignee_id: number;
    assignee_name: string;
    task_text: string;
    deadline_at: string;
  } | null;
}
export interface Dorm {
  id: number;
  name: string;
  invite_code: string;
  admin_user_id: number;
  is_admin: boolean;
  members: Member[];
  rotation_order: number[];
  rotation_start_date: string;
  deadline_time: string;
  task_text: string;
  schedule_rules: ScheduleRules;
  schedule_version: number;
}
export interface Duty {
  id: number;
  duty_date: string;
  assignee_id: number;
  assignee_name_snapshot: string;
  task_text: string;
  deadline_at: string;
  status: "pending" | "completed";
  completed_at: string | null;
  is_override: boolean;
  display_status: string;
  is_late: boolean;
  can_complete: boolean;
}
export interface Today {
  today: string;
  server_time: string;
  task: Duty | null;
  recent: Duty[];
}
export interface Note {
  id: number;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
