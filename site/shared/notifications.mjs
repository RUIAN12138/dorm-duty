// One transactional outbox entry point for manual and scheduled reminders.
// It returns a prepared statement: commit it with the reminder, never send before commit.
export function notifyUser(
  userId,
  message,
  { db, env, guard = "1=1", values = [] },
) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO chore_push_jobs(dorm_id,user_id,subscription_id,subscription_revision,reminder_id,next_attempt_at,created_at)
    SELECT s.dorm_id,s.user_id,s.id,s.revision,r.id,?,? FROM chore_push_subscriptions s JOIN chore_reminders r ON r.mutation_key=? AND r.dorm_id=s.dorm_id AND r.target_member_id=s.user_id
    JOIN dorm_members m ON m.dorm_id=s.dorm_id AND m.user_id=s.user_id AND m.is_active=1
    JOIN users u ON u.id=s.user_id AND u.current_dorm_id=s.dorm_id
    JOIN dormitories d ON d.id=s.dorm_id AND d.is_demo=0
    WHERE s.dorm_id=? AND s.user_id=? AND s.is_active=1
    AND ((s.provider='web' AND ?=1) OR (s.provider='jpush' AND ((s.platform='android' AND ?=1) OR (s.platform='harmony' AND ?=1)))) AND (${guard})`,
    )
    .bind(
      message.createdAt,
      message.createdAt,
      message.reminderKey,
      message.dormId,
      userId,
      Number(Boolean(env.PUSH_CONFIG?.available)),
      Number(Boolean(env.NATIVE_PUSH_CONFIG?.android)),
      Number(Boolean(env.NATIVE_PUSH_CONFIG?.harmony)),
      ...values,
    );
}

// Water has no calendar deadline. Current unfinished chores participate.
export const dailyReminderTasksSql = `SELECT t.id,t.name,t.content,t.key FROM chore_tasks t
  JOIN chore_categories c ON c.dorm_id=t.dorm_id AND c.key=t.key
  WHERE t.dorm_id=? AND t.assignee_id=? AND t.key IN ('floor','toilet','sink') AND t.status='pending' AND c.enabled=1
  AND ((c.mode='scheduled' AND t.duty_date=?) OR (c.mode='self_round' AND t.duty_date<=? AND t.sequence=(SELECT MAX(x.sequence) FROM chore_tasks x WHERE x.dorm_id=t.dorm_id AND x.key=t.key))) ORDER BY t.key`;
export const SCHEDULE_CATCH_UP_MS = 30 * 60 * 1000;
