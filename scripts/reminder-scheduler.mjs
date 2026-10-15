import { createHash } from "node:crypto";
import { maintainChores } from "../site/worker/chores.mjs";
import {
  notifyUser,
  dailyReminderTasksSql,
  SCHEDULE_CATCH_UP_MS,
} from "../site/shared/notifications.mjs";

const DAY = 86400000;
function dueSlots(preference, now) {
  let times;
  try {
    times = JSON.parse(preference.times);
  } catch {
    return [];
  }
  if (!Array.isArray(times) || times.length > 3) return [];
  const slots = [];
  for (const offset of [-DAY, 0]) {
    const day = new Date(now.getTime() + 8 * 3600000 + offset)
      .toISOString()
      .slice(0, 10);
    for (const time of new Set(times)) {
      if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        continue;
      const date = new Date(`${day}T${time}:00+08:00`);
      if (
        date.getTime() <= now.getTime() &&
        now.getTime() - date.getTime() < SCHEDULE_CATCH_UP_MS &&
        date.toISOString() >= preference.updated_at
      )
        slots.push({ day, time, at: date.toISOString() });
    }
  }
  return slots;
}

export function createReminderScheduler(
  db,
  { env, now = () => new Date(), intervalMs = 30000, autoStart = true } = {},
) {
  if (!env) throw new Error("提醒调度缺少运行配置");
  let stopped = false,
    running = null,
    cursor = 0,
    timer;
  const run = async () => {
    const time = now();
    const select = db.sqlite
      .prepare(`SELECT p.* FROM chore_reminder_preferences p
      JOIN dorm_members m ON m.dorm_id=p.dorm_id AND m.user_id=p.user_id AND m.is_active=1
      JOIN users u ON u.id=p.user_id AND u.current_dorm_id=p.dorm_id
      JOIN dormitories d ON d.id=p.dorm_id AND d.is_demo=0 WHERE p.enabled=1 AND p.id>? ORDER BY p.id LIMIT 128`);
    let preferences = select.all(cursor);
    if (!preferences.length && cursor) {
      cursor = 0;
      preferences = select.all(0);
    }
    const maintained = new Set();
    let reminders = 0;
    for (const preference of preferences) {
      if (stopped) break;
      cursor = preference.id;
      const slots = dueSlots(preference, time);
      if (!slots.length) continue;
      if (!maintained.has(preference.dorm_id)) {
        const room = db.sqlite
          .prepare("SELECT * FROM dormitories WHERE id=? AND is_demo=0")
          .get(preference.dorm_id);
        if (!room) continue;
        await maintainChores(db, room, time);
        maintained.add(preference.dorm_id);
      }
      for (const slot of slots) {
        const reminderKey = createHash("sha256")
          .update(
            `schedule:${preference.dorm_id}:${preference.user_id}:${slot.day}:${slot.time}`,
          )
          .digest("hex");
        if (
          db.sqlite
            .prepare("SELECT 1 FROM chore_reminders WHERE mutation_key=?")
            .get(reminderKey)
        )
          continue;
        const taskValues = [
          preference.dorm_id,
          preference.user_id,
          slot.day,
          slot.day,
        ];
        const guard = `EXISTS(SELECT 1 FROM chore_reminder_preferences p
          JOIN dorm_members m ON m.dorm_id=p.dorm_id AND m.user_id=p.user_id AND m.is_active=1
          JOIN users u ON u.id=p.user_id AND u.current_dorm_id=p.dorm_id
          JOIN dormitories d ON d.id=p.dorm_id AND d.is_demo=0
          WHERE p.id=? AND p.version=? AND p.enabled=1 AND p.updated_at<=?)`;
        const values = [preference.id, preference.version, slot.at];
        const result = await db.batch([
          db
            .prepare(
              `INSERT OR IGNORE INTO chore_reminders(dorm_id,sender_id,sender_name_snapshot,target_member_id,task_id,task_name_snapshot,task_content_snapshot,created_at,mutation_key,source)
            SELECT ?,?,'轮到',?,NULL,'值日',(SELECT group_concat(name,'、') || '还没完成，做完记得打卡。' FROM (${dailyReminderTasksSql})),?,?,'scheduled'
            WHERE ${guard} AND EXISTS(${dailyReminderTasksSql})`,
            )
            .bind(
              preference.dorm_id,
              preference.user_id,
              preference.user_id,
              ...taskValues,
              time.toISOString(),
              reminderKey,
              ...values,
              ...taskValues,
            ),
          db
            .prepare(
              `INSERT OR IGNORE INTO chore_scheduled_reminders(preference_id,preference_version,reminder_id,day,time,scheduled_at,task_ids)
            SELECT ?,?,r.id,?,?,?,(SELECT json_group_array(id) FROM (${dailyReminderTasksSql})) FROM chore_reminders r WHERE r.mutation_key=? AND r.source='scheduled' AND ${guard}`,
            )
            .bind(
              preference.id,
              preference.version,
              slot.day,
              slot.time,
              slot.at,
              ...taskValues,
              reminderKey,
              ...values,
            ),
          notifyUser(
            preference.user_id,
            {
              dormId: preference.dorm_id,
              reminderKey,
              createdAt: time.toISOString(),
            },
            { db, env, guard, values },
          ),
        ]);
        reminders += Number(result[0]?.meta?.changes || 0);
      }
    }
    if (reminders) env.PUSH_WAKE?.();
    return { reminders, scanned: preferences.length };
  };
  const drain = () => {
    if (stopped) return Promise.resolve({ reminders: 0, scanned: 0 });
    if (!running)
      running = run().finally(() => {
        running = null;
      });
    return running;
  };
  const kick = () => {
    void drain().catch(() =>
      console.error("定时提醒暂时处理失败，将在下轮重试"),
    );
  };
  if (autoStart) {
    timer = setInterval(kick, intervalMs);
    timer.unref();
    kick();
  }
  return {
    drain,
    close: async () => {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}
