import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
import runtime from "../runtime/email-runtime.cjs";
const h = await createHarness();
let time = Date.now(),
  sent = 0,
  reject = false,
  checks = 0;
const eq = (a, b) => {
  checks++;
  assert.deepEqual(a, b);
};
const config = {
  host: "smtp.example.invalid",
  port: 465,
  user: "fixture@example.invalid",
  from: "fixture@example.invalid",
  password: "fixture-only",
  publicOrigin: "https://backend-test.example",
  otpSecret: "c".repeat(64),
};
const options = {
  config,
  now: () => new Date(time),
  autoStart: false,
  send: async () => {
    if (reject) throw new Error("injected failure");
    sent++;
  },
};
let delivery = runtime.createEmailRuntime(h.db, options);
try {
  const room = await h
    .request("/guest/create", {
      method: "POST",
      data: { name: "邮件生命周期隔离", nickname: "甲" },
    })
    .then((r) => r.json());
  const board = await h
    .request(
      `/chores/board?invite_code=${room.invite_code}&member_id=${room.member_id}`,
      { token: room.access_token },
    )
    .then((r) => r.json());
  const task = board.today_tasks[0],
    db = h.db.sqlite,
    at = () => new Date(time).toISOString();
  const account = Number(
    db
      .prepare(
        "INSERT INTO email_accounts(email,mail_enabled,mail_enabled_at,created_at) VALUES ('delivery@example.invalid',1,?,?)",
      )
      .run(at(), at()).lastInsertRowid,
  );
  db.prepare(
    "INSERT INTO email_members(account_id,user_id,dorm_id,creator_verified,bound_at) VALUES (?,?,?,1,?)",
  ).run(account, room.member_id, room.dorm.id, at());
  let serial = 0;
  function reminder(extra = {}) {
    time += 61000;
    const id = Number(
      db
        .prepare(
          "INSERT INTO chore_reminders(dorm_id,sender_id,sender_name_snapshot,target_member_id,task_id,task_name_snapshot,task_content_snapshot,created_at,mutation_key,source) VALUES (?,?,'测试',?,?,?,?,?,?,?)",
        )
        .run(
          room.dorm.id,
          room.member_id,
          room.member_id,
          extra.scheduled ? null : task.id,
          task.name,
          "隔离测试内容",
          at(),
          `mail-fixture-${++serial}`,
          extra.scheduled ? "scheduled" : "member",
        ).lastInsertRowid,
    );
    return id;
  }
  const status = (id) =>
    db.prepare("SELECT status FROM email_jobs WHERE reminder_id=?").get(id)
      ?.status;
  const read = reminder();
  db.prepare("UPDATE chore_reminders SET read_at=? WHERE id=?").run(at(), read);
  await delivery.drain();
  eq(status(read), "cancelled");
  eq(sent, 0);
  const complete = reminder();
  db.prepare(
    "UPDATE chore_tasks SET status='completed',completed_at=? WHERE id=?",
  ).run(at(), task.id);
  await delivery.drain();
  eq(status(complete), "cancelled");
  eq(sent, 0);
  db.prepare(
    "UPDATE chore_tasks SET status='pending',completed_at=NULL WHERE id=?",
  ).run(task.id);
  const paused = reminder();
  db.prepare(
    "UPDATE chore_categories SET enabled=0 WHERE dorm_id=? AND key=?",
  ).run(room.dorm.id, task.key);
  await delivery.drain();
  eq(status(paused), "cancelled");
  db.prepare(
    "UPDATE chore_categories SET enabled=1 WHERE dorm_id=? AND key=?",
  ).run(room.dorm.id, task.key);
  const departed = reminder();
  db.prepare(
    "UPDATE dorm_members SET is_active=0 WHERE dorm_id=? AND user_id=?",
  ).run(room.dorm.id, room.member_id);
  await delivery.drain();
  eq(status(departed), undefined); // not enqueued for departed member
  db.prepare(
    "UPDATE dorm_members SET is_active=1 WHERE dorm_id=? AND user_id=?",
  ).run(room.dorm.id, room.member_id);
  db.prepare("UPDATE chore_reminders SET read_at=? WHERE id=?").run(
    at(),
    departed,
  );
  const scheduled = reminder({ scheduled: true });
  const pref = Number(
    db
      .prepare(
        "INSERT INTO chore_reminder_preferences(dorm_id,user_id,enabled,version,updated_at) VALUES (?,?,1,1,?)",
      )
      .run(room.dorm.id, room.member_id, at()).lastInsertRowid,
  );
  db.prepare(
    "INSERT INTO chore_scheduled_reminders(preference_id,preference_version,reminder_id,day,time,scheduled_at,task_ids) VALUES (?,1,?,'2026-10-16','08:00',?,?)",
  ).run(pref, scheduled, at(), JSON.stringify([task.id]));
  db.prepare(
    "UPDATE chore_tasks SET status='completed',completed_at=? WHERE id=?",
  ).run(at(), task.id);
  await delivery.drain();
  eq(status(scheduled), "cancelled");
  eq(sent, 0);
  db.prepare(
    "UPDATE chore_tasks SET status='pending',completed_at=NULL WHERE id=?",
  ).run(task.id);
  const oldPlan = reminder({ scheduled: true });
  db.prepare(
    "INSERT INTO chore_scheduled_reminders(preference_id,preference_version,reminder_id,day,time,scheduled_at,task_ids) VALUES (?,1,?,'2026-10-16','19:00',?,?)",
  ).run(pref, oldPlan, at(), JSON.stringify([task.id]));
  db.prepare("UPDATE chore_reminder_preferences SET version=2 WHERE id=?").run(
    pref,
  );
  await delivery.drain();
  eq(status(oldPlan), "cancelled");
  const retry = reminder();
  reject = true;
  await delivery.drain();
  eq(status(retry), "pending");
  for (const delay of [61000, 301000, 901000]) {
    time += delay;
    await delivery.drain();
  }
  eq(status(retry), "failed");
  eq(
    db.prepare("SELECT attempts FROM email_jobs WHERE reminder_id=?").get(retry)
      .attempts,
    4,
  );
  reject = false;
  const recovering = reminder();
  db.prepare(
    "INSERT INTO email_jobs(account_id,reminder_id,status,attempts,next_attempt_at,lease_until,created_at) VALUES (?,?,'sending',1,?,?,?)",
  ).run(account, recovering, at(), new Date(time - 1).toISOString(), at());
  await delivery.close();
  delivery = runtime.createEmailRuntime(h.db, options);
  await delivery.drain();
  eq(status(recovering), "accepted");
  eq(sent, 1);
  await delivery.drain();
  eq(sent, 1);
  time -= 60000;
  const cooldown = reminder(); // another manual reminder inside the email cooldown
  await delivery.drain();
  eq(status(cooldown), "cancelled");
  eq(sent, 1);
  const old = reminder();
  time += 86400001;
  await delivery.drain();
  eq(status(old), undefined); // no historical backfill after a day offline
  const expired = reminder();
  db.prepare(
    "INSERT INTO email_jobs(account_id,reminder_id,next_attempt_at,created_at) VALUES (?,?,?,?)",
  ).run(account, expired, at(), new Date(time - 86400001).toISOString());
  await delivery.drain();
  eq(status(expired), "cancelled");
  eq(sent, 1);
  console.log(
    `邮件投递取消、重试、过期与重启检查通过 ${checks} 项（隔离传输）`,
  );
} finally {
  await delivery.close();
  h.close();
}
