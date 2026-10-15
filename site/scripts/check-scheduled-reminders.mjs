import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
import { createReminderScheduler } from "../../scripts/reminder-scheduler.mjs";
import { createPushDelivery } from "../../scripts/push-runtime.mjs";
import { createNativeSender } from "../../scripts/native-push-provider.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { SQLiteD1 } from "../local/sqlite-d1.mjs";
import { openDatabase } from "../local/database.mjs";
import { handleApi } from "../worker/backend.mjs";

const RealDate = Date;
let clock = new RealDate("2026-10-15T07:59:00+08:00").getTime(),
  assertions = 0;
const eq = (a, b, message) => {
  assertions++;
  assert.deepEqual(a, b, message);
};
const ok = (value, message) => {
  assertions++;
  assert(value, message);
};
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [clock]));
  }
  static now() {
    return clock;
  }
};
const at = (time) => {
  clock = new RealDate(time).getTime();
};
async function api(
  h,
  path,
  token,
  data,
  status = 200,
  method = data ? "PATCH" : "GET",
) {
  const r = await h.request(path, { token, method, ...(data ? { data } : {}) });
  eq(r.status, status, path.split("?")[0]);
  return r.json();
}
async function fixture(h, deviceCount = 1) {
  const room = await api(
    h,
    "/guest/create",
    null,
    { name: "定时提醒隔离验收", nickname: "甲", members: ["乙"] },
    201,
    "POST",
  );
  const member = room.dorm.members.find((p) => p.user_id !== room.member_id);
  const claim = await api(
    h,
    "/chores/claim",
    null,
    { invite_code: room.invite_code, member_id: member.user_id },
    201,
    "POST",
  );
  const result = {
    ...room,
    owner: { id: room.member_id, token: room.access_token },
    member: { id: member.user_id, token: claim.access_token },
  };
  h.env.NATIVE_PUSH_CONFIG = { android: true, harmony: true };
  for (let i = 0; i < deviceCount; i++)
    await api(
      h,
      "/chores/native/subscribe",
      result.owner.token,
      {
        platform: i % 2 ? "harmony" : "android",
        registration_id: `scheduled-reg-${room.dorm.id}-${i}`,
        device_id: String(room.dorm.id * 10 + i).padStart(64, "0"),
        device_secret: "d".repeat(64),
      },
      200,
      "POST",
    );
  return result;
}
const plan = (
  h,
  person,
  values = { enabled: true, times: ["08:00", "19:00"], version: 0 },
  status = 200,
) => api(h, "/chores/reminder-plan", person.token, values, status);
const board = (h, room, person = room.owner) =>
  api(
    h,
    `/chores/board?invite_code=${room.invite_code}&member_id=${person.id}`,
    person.token,
  );
const complete = (h, person, task) =>
  api(h, `/chores/tasks/${task.id}/complete`, person.token, {}, 200);
const records = (h) =>
  h.db.sqlite
    .prepare(
      "SELECT * FROM chore_reminders WHERE source='scheduled' ORDER BY id",
    )
    .all();
const jobs = (h) =>
  h.db.sqlite.prepare("SELECT * FROM chore_push_jobs ORDER BY id").all();
const scheduler = (h) =>
  createReminderScheduler(h.db, { env: h.env, autoStart: false });
const tests = [];
const test = (name, run) => tests.push({ name, run });

test("personal authorization, default off, validation, version conflicts and scoped settings", async (h) => {
  const r = await fixture(h);
  await api(h, "/chores/reminder-plan", null, null, 401);
  const initial = await api(h, "/chores/reminder-plan", r.owner.token);
  eq(initial.enabled, false);
  eq(initial.version, 0);
  eq(initial.times, ["08:00", "19:00"]);
  eq(initial.last_reminder, null);
  for (const values of [
    { enabled: "yes", times: ["08:00"], version: 0 },
    { enabled: true, times: [], version: 0 },
    { enabled: true, times: ["25:00"], version: 0 },
    { enabled: true, times: ["08:00", "08:00"], version: 0 },
    { enabled: true, times: ["08:00", "09:00", "10:00", "11:00"], version: 0 },
    { enabled: true, times: ["08:00"], version: 0, user_id: r.member.id },
  ])
    await plan(h, r.owner, values, 422);
  const saved = await plan(h, r.member, {
    enabled: true,
    times: ["19:00", "08:00"],
    version: 0,
  });
  eq(saved.times, ["08:00", "19:00"]);
  eq(saved.version, 1);
  eq((await api(h, "/chores/reminder-plan", r.owner.token)).enabled, false);
  await plan(h, r.member, undefined, 409);
  eq(
    (await plan(h, r.member, { enabled: true, times: saved.times, version: 1 }))
      .version,
    1,
  );
});

test("one combined reminder per slot, two native devices, repeated and concurrent ticks deduplicate", async (h) => {
  const r = await fixture(h, 2);
  const a = scheduler(h),
    b = scheduler(h);
  eq((await a.drain()).reminders, 0);
  await plan(h, r.owner);
  at("2026-10-15T08:00:00+08:00");
  await Promise.all([a.drain(), b.drain(), a.drain()]);
  eq(records(h).length, 1);
  eq(jobs(h).length, 2);
  ok(records(h)[0].task_content_snapshot.includes("洗手池"));
  eq(records(h)[0].task_id, null);
  const view = await board(h, r);
  eq(view.reminders[0].source, "scheduled");
  eq(view.reminders[0].sender_id, null);
  eq(view.reminders[0].title, "轮到 · 值日提醒");
  await a.close();
  await b.close();
  const restart = scheduler(h);
  await restart.drain();
  eq(records(h).length, 1);
  eq(jobs(h).length, 2);
  await restart.close();
});

test("completed personal chores and water never trigger daily reminders", async (h) => {
  const r = await fixture(h);
  await plan(h, r.owner);
  for (const task of (await board(h, r)).today_tasks)
    await complete(h, r.owner, task);
  ok((await board(h, r)).water_task.can_complete);
  at("2026-10-15T08:00:00+08:00");
  const engine = scheduler(h);
  await engine.drain();
  eq(records(h).length, 0);
  eq(jobs(h).length, 0);
  await engine.close();
});

test("scheduled mode considers the due day only and can notify without a registered push device", async (h) => {
  const r = await fixture(h, 0);
  const b = await board(h, r);
  const categories = b.categories.map((category) =>
    category.key === "water"
      ? category
      : {
          ...category,
          mode: "scheduled",
          start_date: "2026-10-15",
          rotation_order: [r.owner.id, r.member.id],
        },
  );
  await api(h, "/chores/settings", r.owner.token, {
    version: b.version,
    categories,
  });
  await plan(h, r.owner);
  at("2026-10-15T08:00:00+08:00");
  let engine = scheduler(h);
  await engine.drain();
  await engine.close();
  eq(records(h).length, 1);
  eq(jobs(h).length, 0);
  const status = await api(h, "/chores/reminder-plan", r.owner.token);
  eq(status.last_reminder.devices, 0);
  eq(status.last_reminder.accepted, 0);
  at("2026-10-16T08:00:00+08:00");
  engine = scheduler(h);
  await engine.drain();
  await engine.close();
  eq(
    records(h).length,
    1,
    "Yesterday's unfinished work and later scheduled work must not become today's reminder",
  );
});

test("delivery rechecks completion and does not transfer an old reminder into the next voluntary round", async (h) => {
  const r = await fixture(h);
  await plan(h, r.owner);
  at("2026-10-15T08:00:00+08:00");
  const engine = scheduler(h);
  await engine.drain();
  await engine.close();
  for (const person of [r.owner, r.member])
    for (const task of (await board(h, r, person)).today_tasks)
      await complete(h, person, task);
  const next = await board(h, r);
  ok(next.today_tasks.every((task) => task.status === "pending"));
  eq(
    next.rounds.map((round) => round.sequence),
    [2, 2, 2],
  );
  let sends = 0;
  const delivery = createPushDelivery(
    h.db,
    async () => {
      sends++;
    },
    { now: () => new Date() },
  );
  await delivery.drain();
  await delivery.close();
  eq(sends, 0);
  eq(jobs(h)[0].status, "cancelled");
});

test("partial completion updates push content and native TTL matches the remaining catch-up window", async (h) => {
  const r = await fixture(h, 2);
  await plan(h, r.owner);
  at("2026-10-15T08:00:00+08:00");
  const engine = scheduler(h);
  await engine.drain();
  await engine.close();
  await complete(
    h,
    r.owner,
    (await board(h, r)).today_tasks.find((task) => task.key === "floor"),
  );
  at("2026-10-15T08:05:00+08:00");
  const sent = [];
  const sender = createNativeSender(
    {
      android: { appKey: "1".repeat(24), masterSecret: "fake-server-secret" },
      harmony: { appKey: "2".repeat(24), masterSecret: "fake-server-secret" },
    },
    async (_, options) => {
      sent.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ msg_id: "test-accepted" }), {
        status: 200,
      });
    },
  );
  const delivery = createPushDelivery(h.db, sender, { now: () => new Date() });
  await delivery.drain();
  await delivery.close();
  eq(sent.length, 2);
  for (const request of sent) {
    const notification =
      request.notification.android || request.notification.hmos;
    ok(notification.alert.includes("厕所"));
    ok(!notification.alert.includes("地板"));
    eq(notification.title, "轮到 · 值日提醒");
    eq(request.options.time_to_live, 1500);
    eq(request.audience.registration_id.length, 1);
  }
  eq(
    jobs(h).map((job) => job.status),
    ["accepted", "accepted"],
  );
  const status = await api(h, "/chores/reminder-plan", r.owner.token);
  eq(status.last_reminder.accepted, 2);
  eq(status.last_reminder.pending, 0);
  ok(!JSON.stringify(status).includes("jpush:"));
});

test("preference changes cancel old jobs; re-enabling does not replay an earlier slot", async (h) => {
  const r = await fixture(h);
  await plan(h, r.owner);
  at("2026-10-15T08:00:00+08:00");
  const engine = scheduler(h);
  await engine.drain();
  eq(records(h).length, 1);
  at("2026-10-15T08:01:00+08:00");
  await plan(h, r.owner, {
    enabled: false,
    times: ["08:00", "19:00"],
    version: 1,
  });
  eq(jobs(h)[0].status, "cancelled");
  await plan(h, r.owner, {
    enabled: true,
    times: ["08:00", "19:00"],
    version: 2,
  });
  await engine.drain();
  eq(records(h).length, 1);
  at("2026-10-15T19:00:00+08:00");
  await engine.drain();
  eq(records(h).length, 2);
  await engine.close();
});

test("catch-up is bounded, never predates opt-in, and handles the previous day across Shanghai midnight", async (h) => {
  const r = await fixture(h);
  await plan(h, r.owner);
  at("2026-10-15T08:29:59+08:00");
  let engine = scheduler(h);
  await engine.drain();
  await engine.close();
  eq(records(h).length, 1);
  const later = await fixture(h);
  await plan(h, later.owner, { enabled: true, times: ["08:00"], version: 0 });
  at("2026-10-15T08:30:00+08:00");
  engine = scheduler(h);
  await engine.drain();
  await engine.close();
  eq(records(h).length, 1);
  at("2026-10-15T23:54:00+08:00");
  await plan(h, r.owner, { enabled: true, times: ["23:55"], version: 1 });
  at("2026-10-16T00:10:00+08:00");
  engine = scheduler(h);
  await engine.drain();
  await engine.close();
  eq(records(h).length, 2);
  const row = h.db.sqlite
    .prepare(
      "SELECT day,time,scheduled_at FROM chore_scheduled_reminders ORDER BY id DESC LIMIT 1",
    )
    .get();
  eq(row.day, "2026-10-15");
  eq(row.time, "23:55");
  eq(row.scheduled_at, "2026-10-15T15:55:00.000Z");
});

test("read, disabled categories, expired schedules and departed members cancel before delivery", async (h) => {
  for (const condition of [
    "read",
    "disabled",
    "expired",
    "left",
    "changed-dorm",
    "device",
  ]) {
    at("2026-10-15T07:59:00+08:00");
    const r = await fixture(h);
    await plan(h, r.owner);
    at("2026-10-15T08:00:00+08:00");
    const engine = scheduler(h);
    await engine.drain();
    await engine.close();
    const reminder = records(h).at(-1),
      job = jobs(h).at(-1);
    if (condition === "read")
      await api(h, `/chores/reminders/${reminder.id}/read`, r.owner.token, {});
    if (condition === "disabled")
      h.db.sqlite
        .prepare(
          "UPDATE chore_categories SET enabled=0 WHERE dorm_id=? AND key<>'water'",
        )
        .run(r.dorm.id);
    if (condition === "expired") at("2026-10-15T08:30:00+08:00");
    if (condition === "left")
      h.db.sqlite
        .prepare(
          "UPDATE dorm_members SET is_active=0 WHERE dorm_id=? AND user_id=?",
        )
        .run(r.dorm.id, r.owner.id);
    if (condition === "changed-dorm")
      h.db.sqlite
        .prepare("UPDATE users SET current_dorm_id=NULL WHERE id=?")
        .run(r.owner.id);
    if (condition === "device")
      h.db.sqlite
        .prepare("UPDATE chore_push_subscriptions SET is_active=0 WHERE id=?")
        .run(job.subscription_id);
    let sends = 0;
    const delivery = createPushDelivery(
      h.db,
      async () => {
        sends++;
      },
      { now: () => new Date() },
    );
    await delivery.drain();
    await delivery.close();
    eq(sends, 0, condition);
    eq(
      jobs(h).find((entry) => entry.id === job.id).status,
      "cancelled",
      condition,
    );
  }
});

test("atomic reminder, snapshot and jobs rollback; retry succeeds without altering completed history", async (h) => {
  const r = await fixture(h);
  const completed = (await board(h, r)).today_tasks.find(
    (task) => task.key === "floor",
  );
  await complete(h, r.owner, completed);
  const history = h.db.sqlite
    .prepare("SELECT * FROM chore_tasks WHERE status='completed'")
    .all();
  await plan(h, r.owner);
  at("2026-10-15T08:00:00+08:00");
  h.db.sqlite.exec(
    "CREATE TRIGGER reject_schedule_job BEFORE INSERT ON chore_push_jobs BEGIN SELECT RAISE(ABORT,'isolated_failure'); END",
  );
  let engine = scheduler(h);
  await assert.rejects(engine.drain());
  assertions++;
  await engine.close();
  eq(records(h).length, 0);
  eq(
    h.db.sqlite
      .prepare("SELECT count(*) AS n FROM chore_scheduled_reminders")
      .get().n,
    0,
  );
  h.db.sqlite.exec("DROP TRIGGER reject_schedule_job");
  engine = scheduler(h);
  await engine.drain();
  await engine.close();
  eq(records(h).length, 1);
  eq(jobs(h).length, 1);
  eq(
    h.db.sqlite
      .prepare("SELECT * FROM chore_tasks WHERE status='completed'")
      .all(),
    history,
  );
  eq(h.db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
});

test("migration from the previous release retains tasks, sessions, reminders and job history", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "dorm-reminder-upgrade-"),
  );
  const file = path.join(directory, "previous.sqlite");
  let old = new SQLiteD1(file),
    upgraded;
  try {
    old.sqlite.exec(
      "CREATE TABLE _local_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL,applied_at TEXT NOT NULL)",
    );
    const names = (await fs.readdir(new URL("../drizzle/", import.meta.url)))
      .filter((name) => name.endsWith(".sql") && name < "0006")
      .sort();
    for (const name of names) {
      const sql = await fs.readFile(
        new URL("../drizzle/" + name, import.meta.url),
        "utf8",
      );
      old.sqlite.exec(sql);
      old.sqlite
        .prepare("INSERT INTO _local_migrations VALUES (?,?,?)")
        .run(
          name,
          createHash("sha256").update(sql).digest("hex"),
          new Date().toISOString(),
        );
    }
    const env = { DB: old, DEFAULT_DORM_INVITE_CODE: "" };
    const h = {
      db: old,
      env,
      request: (route, { token, method = "GET", data } = {}) =>
        handleApi(
          new Request("https://migration-test.example" + route, {
            method,
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              "Content-Type": "application/json",
            },
            ...(data ? { body: JSON.stringify(data) } : {}),
          }),
          env,
          { waitUntil() {} },
        ),
    };
    const r = await fixture(h);
    const b = await board(h, r);
    await complete(h, r.owner, b.today_tasks[0]);
    await api(
      h,
      "/chores/remind",
      r.owner.token,
      {
        target_member_id: r.member.id,
        task_id: (await board(h, r, r.member)).today_tasks[0].id,
      },
      201,
      "POST",
    );
    const tables = [
      "users",
      "dormitories",
      "dorm_members",
      "sessions",
      "member_sessions",
      "chore_tasks",
      "chore_reminders",
      "chore_push_jobs",
    ];
    const before = Object.fromEntries(
      tables.map((name) => [
        name,
        old.sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all(),
      ]),
    );
    old.close();
    old = null;
    upgraded = await openDatabase(file);
    for (const name of tables) {
      const after = upgraded.sqlite
        .prepare(`SELECT * FROM ${name} ORDER BY rowid`)
        .all()
        .map((row) => {
          if (name === "chore_reminders") {
            eq(row.source, "member");
            const { source, ...legacy } = row;
            return legacy;
          }
          return { ...row };
        });
      eq(
        JSON.parse(JSON.stringify(after)),
        JSON.parse(JSON.stringify(before[name])),
        name,
      );
    }
    eq(
      upgraded.sqlite
        .prepare("SELECT count(*) AS n FROM chore_reminder_preferences")
        .get().n,
      0,
    );
    eq(upgraded.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
    eq(
      upgraded.sqlite.prepare("PRAGMA journal_mode").get().journal_mode,
      "wal",
    );
    eq(
      upgraded.sqlite.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
  } finally {
    old?.close();
    upgraded?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

const results = [];
try {
  for (const entry of tests) {
    at("2026-10-15T07:59:00+08:00");
    const h = await createHarness(),
      before = assertions;
    try {
      await entry.run(h);
      results.push({
        name: entry.name,
        status: "passed",
        assertions: assertions - before,
      });
    } catch (error) {
      results.push({
        name: entry.name,
        status: "failed",
        reason: String(error.message).replace(/[a-f0-9]{64}/gi, "[redacted]"),
        assertions: assertions - before,
      });
    } finally {
      h.close();
    }
  }
} finally {
  globalThis.Date = RealDate;
}
console.log(
  JSON.stringify(
    {
      assertions,
      passed: results.filter((x) => x.status === "passed").length,
      failed: results.filter((x) => x.status === "failed").length,
      tests: results,
      excludes: "real provider acceptance or device notification delivery",
    },
    null,
    2,
  ),
);
if (results.some((x) => x.status === "failed")) process.exitCode = 1;
