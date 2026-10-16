import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const emailAccounts = sqliteTable("email_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  mailEnabled: integer("mail_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  mailEnabledAt: text("mail_enabled_at").notNull(),
  createdAt: text("created_at").notNull(),
});
export const emailChallenges = sqliteTable(
  "email_challenges",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    clientHash: text("client_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    ready: integer("ready").notNull().default(0),
    consumed: integer("consumed").notNull().default(0),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("email_challenges_email_time").on(table.email, table.createdAt),
    index("email_challenges_client_time").on(table.clientHash, table.createdAt),
  ],
);
export const emailSessions = sqliteTable(
  "email_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => emailAccounts.id),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [index("email_sessions_account").on(table.accountId)],
);
export const emailMembers = sqliteTable(
  "email_members",
  {
    accountId: integer("account_id")
      .notNull()
      .references(() => emailAccounts.id),
    userId: integer("user_id")
      .notNull()
      .unique()
      .references(() => users.id),
    dormId: integer("dorm_id")
      .notNull()
      .references(() => dormitories.id),
    creatorVerified: integer("creator_verified").notNull().default(0),
    boundAt: text("bound_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.dormId] })],
);
export const emailGrants = sqliteTable("email_grants", {
  tokenHash: text("token_hash").primaryKey(),
  emailSessionHash: text("email_session_hash")
    .notNull()
    .references(() => emailSessions.tokenHash, { onDelete: "cascade" }),
  fullSession: integer("full_session").notNull(),
});
export const emailJobs = sqliteTable(
  "email_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => emailAccounts.id),
    reminderId: integer("reminder_id").references(() => choreReminders.id),
    kind: text("kind").notNull().default("reminder"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at").notNull(),
    leaseUntil: text("lease_until"),
    acceptedAt: text("accepted_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("email_jobs_account_reminder").on(
      table.accountId,
      table.reminderId,
    ),
    index("email_jobs_due").on(table.status, table.nextAttemptAt),
  ],
);

const created = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

export const creatorRecovery = sqliteTable(
  "creator_recovery",
  {
    dormId: integer("dorm_id")
      .primaryKey()
      .references(() => dormitories.id),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id),
    codeHash: text("code_hash").notNull(),
    revision: integer("revision").notNull().default(1),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("creator_recovery_hash_unique").on(table.codeHash)],
);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  nickname: text("nickname").notNull(),
  currentDormId: integer("current_dorm_id").references(
    (): AnySQLiteColumn => dormitories.id,
  ),
  pushEnabled: integer("push_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  mutationKey: text("mutation_key").notNull().default(""),
  createdAt: created(),
});

export const dormitories = sqliteTable("dormitories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  adminUserId: integer("admin_user_id")
    .notNull()
    .references((): AnySQLiteColumn => users.id),
  rotationOrder: text("rotation_order").notNull().default("[]"),
  rotationStartDate: text("rotation_start_date").notNull(),
  deadlineTime: text("deadline_time").notNull().default("22:00"),
  taskText: text("task_text").notNull().default("扫地、拖地、倒垃圾"),
  scheduleRules: text("schedule_rules").notNull().default("{}"),
  scheduleVersion: integer("schedule_version").notNull().default(1),
  mutationKey: text("mutation_key").notNull().default(""),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
});

export const dormMembers = sqliteTable(
  "dorm_members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dormId: integer("dorm_id")
      .notNull()
      .references(() => dormitories.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull().default("member"),
    sortOrder: integer("sort_order").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    joinedAt: text("joined_at").notNull(),
    leftAt: text("left_at"),
  },
  (table) => [
    uniqueIndex("dorm_member_unique").on(table.dormId, table.userId),
    index("dorm_members_dorm_idx").on(table.dormId),
    check("member_role_check", sql`${table.role} IN ('admin','member')`),
  ],
);

export const dutyTasks = sqliteTable(
  "duty_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dormId: integer("dorm_id")
      .notNull()
      .references(() => dormitories.id),
    dutyDate: text("duty_date").notNull(),
    assigneeId: integer("assignee_id")
      .notNull()
      .references(() => users.id),
    assigneeNameSnapshot: text("assignee_name_snapshot").notNull(),
    taskText: text("task_text").notNull(),
    deadlineAt: text("deadline_at").notNull(),
    status: text("status").notNull().default("pending"),
    completedAt: text("completed_at"),
    isOverride: integer("is_override", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    uniqueIndex("dorm_duty_day_unique").on(table.dormId, table.dutyDate),
    index("duty_tasks_dorm_date_idx").on(table.dormId, table.dutyDate),
    check("duty_status_check", sql`${table.status} IN ('pending','completed')`),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    dormId: integer("dorm_id").references(() => dormitories.id),
    taskId: integer("task_id").references(() => dutyTasks.id),
    reminderKind: text("reminder_kind").notNull(),
    scheduledAt: text("scheduled_at").notNull(),
    createdAt: created(),
    readAt: text("read_at"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    isCancelled: integer("is_cancelled", { mode: "boolean" })
      .notNull()
      .default(false),
    deliveryState: text("delivery_state").notNull().default("{}"),
  },
  (table) => [index("notifications_user_idx").on(table.userId)],
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: created(),
    updatedAt: text("updated_at").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [index("push_subscriptions_user_idx").on(table.userId)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: created(),
    expiresAt: text("expires_at").notNull(),
    kind: text("kind").notNull().default("account"),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    check("session_kind_check", sql`${table.kind} IN ('account','device')`),
  ],
);

// Password-free dorm identity is deliberately isolated from privileged account/device sessions.
export const memberSessions = sqliteTable(
  "member_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    dormId: integer("dorm_id")
      .notNull()
      .references(() => dormitories.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: created(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("member_sessions_dorm_user_idx").on(table.dormId, table.userId),
  ],
);

export const memberMarks = sqliteTable(
  "member_marks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dormId: integer("dorm_id")
      .notNull()
      .references(() => dormitories.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    markerId: text("marker_id").notNull(),
  },
  (table) => [
    uniqueIndex("member_marks_user_unique").on(table.dormId, table.userId),
    uniqueIndex("member_marks_marker_unique").on(table.dormId, table.markerId),
  ],
);

export const choreSettings = sqliteTable("chore_settings", {
  dormId: integer("dorm_id")
    .primaryKey()
    .references(() => dormitories.id),
  version: integer("version").notNull().default(1),
  mutationKey: text("mutation_key").notNull().default(""),
});

export const choreCategories = sqliteTable(
  "chore_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dormId: integer("dorm_id")
      .notNull()
      .references(() => dormitories.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    deadlineTime: text("deadline_time").notNull(),
    startDate: text("start_date").notNull(),
    weekdays: text("weekdays").notNull().default("[1,2,3,4,5,6,7]"),
    rotationDays: integer("rotation_days").notNull().default(1),
    reminderIntervalDays: integer("reminder_interval_days")
      .notNull()
      .default(3),
    rotationOrder: text("rotation_order").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    mode: text("mode").notNull().default("self_round"),
  },
  (table) => [
    uniqueIndex("chore_categories_dorm_key_unique").on(table.dormId, table.key),
    check(
      "chore_category_mode_check",
      sql`${table.mode} IN ('scheduled','self_round','completion')`,
    ),
    check(
      "chore_category_key_check",
      sql`${table.key} IN ('floor','toilet','sink','water')`,
    ),
    check(
      "chore_rotation_days_check",
      sql`${table.rotationDays} BETWEEN 1 AND 30`,
    ),
    check(
      "chore_reminder_interval_check",
      sql`${table.reminderIntervalDays} BETWEEN 1 AND 365`,
    ),
  ],
);

export const choreTasks = sqliteTable(
  "chore_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dormId: integer("dorm_id")
      .notNull()
      .references(() => dormitories.id),
    key: text("key").notNull(),
    taskKey: text("task_key").notNull(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    dutyDate: text("duty_date").notNull(),
    assigneeId: integer("assignee_id")
      .notNull()
      .references(() => users.id),
    assigneeNameSnapshot: text("assignee_name_snapshot").notNull(),
    markerIdSnapshot: text("marker_id_snapshot").notNull(),
    deadlineAt: text("deadline_at").notNull(),
    status: text("status").notNull().default("pending"),
    completedAt: text("completed_at"),
    sequence: integer("sequence"),
  },
  (table) => [
    uniqueIndex("chore_tasks_dorm_key_task_unique").on(
      table.dormId,
      table.key,
      table.taskKey,
    ),
    index("chore_tasks_dorm_date_idx").on(table.dormId, table.dutyDate),
    index("chore_tasks_completed_idx").on(table.dormId, table.completedAt),
    uniqueIndex("chore_water_pending_unique")
      .on(table.dormId)
      .where(sql`${table.key}='water' AND ${table.status}='pending'`),
    check(
      "chore_task_key_check",
      sql`${table.key} IN ('floor','toilet','sink','water')`,
    ),
    check(
      "chore_task_status_check",
      sql`${table.status} IN ('pending','completed','cancelled')`,
    ),
  ],
);

export const choreReminders = sqliteTable(
  "chore_reminders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dormId: integer("dorm_id")
      .notNull()
      .references(() => dormitories.id),
    senderId: integer("sender_id")
      .notNull()
      .references(() => users.id),
    senderNameSnapshot: text("sender_name_snapshot").notNull(),
    targetMemberId: integer("target_member_id")
      .notNull()
      .references(() => users.id),
    taskId: integer("task_id").references(() => choreTasks.id),
    taskNameSnapshot: text("task_name_snapshot").notNull(),
    taskContentSnapshot: text("task_content_snapshot").notNull(),
    createdAt: created(),
    readAt: text("read_at"),
    mutationKey: text("mutation_key").notNull().unique(),
    source: text("source").notNull().default("member"),
  },
  (table) => [
    index("chore_reminders_target_idx").on(
      table.dormId,
      table.targetMemberId,
      table.createdAt,
    ),
    index("chore_reminders_cooldown_idx").on(
      table.senderId,
      table.targetMemberId,
      table.taskId,
      table.createdAt,
    ),
  ],
);

export const choreCalendarSubscriptions = sqliteTable(
  "chore_calendar_subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dormId: integer("dorm_id")
      .notNull()
      .references(() => dormitories.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    includeAlarms: integer("include_alarms", { mode: "boolean" })
      .notNull()
      .default(false),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastFetchedAt: text("last_fetched_at"),
  },
  (table) => [
    uniqueIndex("chore_calendar_member_unique").on(table.dormId, table.userId),
    uniqueIndex("chore_calendar_token_unique").on(table.tokenHash),
  ],
);

export const choreReminderPreferences = sqliteTable(
  "chore_reminder_preferences",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dormId: integer("dorm_id")
      .notNull()
      .references(() => dormitories.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    times: text("times").notNull().default('["08:00","19:00"]'),
    version: integer("version").notNull().default(1),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("chore_reminder_preferences_member_unique").on(
      table.dormId,
      table.userId,
    ),
  ],
);

export const choreScheduledReminders = sqliteTable(
  "chore_scheduled_reminders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    preferenceId: integer("preference_id")
      .notNull()
      .references(() => choreReminderPreferences.id),
    preferenceVersion: integer("preference_version").notNull(),
    reminderId: integer("reminder_id")
      .notNull()
      .references(() => choreReminders.id),
    day: text("day").notNull(),
    time: text("time").notNull(),
    scheduledAt: text("scheduled_at").notNull(),
    taskIds: text("task_ids").notNull().default("[]"),
  },
  (table) => [
    uniqueIndex("chore_schedule_slot_unique").on(
      table.preferenceId,
      table.day,
      table.time,
    ),
    uniqueIndex("chore_schedule_reminder_unique").on(table.reminderId),
  ],
);

export const chorePushSubscriptions = sqliteTable(
  "chore_push_subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dormId: integer("dorm_id")
      .notNull()
      .references(() => dormitories.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull().default("web"),
    platform: text("platform").notNull().default("web"),
    deviceId: text("device_id"),
    deviceSecretHash: text("device_secret_hash"),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    revision: integer("revision").notNull().default(1),
    createdAt: created(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("chore_push_endpoint_unique").on(table.endpoint),
    uniqueIndex("chore_native_device_idx")
      .on(table.provider, table.platform, table.deviceId)
      .where(sql`${table.deviceId} IS NOT NULL`),
    check(
      "chore_native_provider_check",
      sql`${table.provider} IN ('web','jpush')`,
    ),
    check(
      "chore_native_platform_check",
      sql`${table.platform} IN ('web','android','harmony')`,
    ),
    index("chore_push_member_idx").on(
      table.dormId,
      table.userId,
      table.isActive,
    ),
  ],
);

export const chorePushJobs = sqliteTable(
  "chore_push_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dormId: integer("dorm_id")
      .notNull()
      .references(() => dormitories.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => chorePushSubscriptions.id),
    subscriptionRevision: integer("subscription_revision").notNull(),
    reminderId: integer("reminder_id").references(() => choreReminders.id),
    kind: text("kind").notNull().default("reminder"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at").notNull(),
    lease: text("lease"),
    leaseUntil: text("lease_until"),
    acceptedAt: text("accepted_at"),
    lastStatus: integer("last_status"),
    createdAt: created(),
  },
  (table) => [
    uniqueIndex("chore_push_reminder_device_unique").on(
      table.reminderId,
      table.subscriptionId,
    ),
    index("chore_push_queue_idx").on(table.status, table.nextAttemptAt),
    check("chore_push_kind_check", sql`${table.kind} IN ('reminder','test')`),
    check(
      "chore_push_status_check",
      sql`${table.status} IN ('pending','sending','accepted','failed','cancelled')`,
    ),
  ],
);
