// Disposable databases and fake calendar credentials; never reads production data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import ICAL from "ical.js";
import { createHarness } from "./check-cloud-backend.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import pathModule from "node:path";
import { SQLiteD1 } from "../local/sqlite-d1.mjs";
import { openDatabase } from "../local/database.mjs";
import { handleApi, EMAIL_GATE_CAPABILITY } from "../worker/backend.mjs";
import { calendarFeed } from "../worker/calendar.mjs";
import { renderCalendar } from "../shared/ical.mjs";
const RealDate = Date;
let clock = new RealDate("2026-10-15T07:59:00+08:00").getTime(),
  assertions = 0;
const eq = (a, b, message) => {
  assertions++;
  if (message) assert.deepEqual(a, b, message);
  else assert.deepEqual(a, b);
};
const ok = (value, message) => {
  assertions++;
  assert(value, message);
};
globalThis.Date = class extends RealDate {
  constructor(...a) {
    super(...(a.length ? a : [clock]));
  }
  static now() {
    return clock;
  }
};
const advance = (ms = 11000) => {
  clock += ms;
};
const path = "/chores/calendar-subscription";
const results = [];
async function api(
  h,
  url,
  token,
  data,
  method = data ? "POST" : "GET",
  status = 200,
) {
  const response = await h.request(url, {
    token,
    method,
    ...(data ? { data } : {}),
  });
  eq(
    response.status,
    status,
    "HTTP " + url.replace(/[a-f0-9]{64}/g, "[credential]"),
  );
  return response;
}
const json = async (...a) => (await api(...a)).json();
async function fixture(h) {
  const room = await json(
    h,
    "/guest/create",
    null,
    { name: "日历隔离验收", nickname: "甲", members: ["乙"] },
    "POST",
    201,
  );
  const other = room.dorm.members.find((m) => m.user_id !== room.member_id);
  const claimed = await json(
    h,
    "/chores/claim",
    null,
    { invite_code: room.invite_code, member_id: other.user_id, nickname: other.nickname },
    "POST",
    201,
  );
  return {
    ...room,
    owner: { id: room.member_id, token: room.access_token },
    member: { id: other.user_id, token: claimed.access_token },
  };
}
const create = (h, who, version = 0, alarms = false, status = 200) =>
  json(h, path, who.token, { version, include_alarms: alarms }, "POST", status);
const update = (h, who, version, alarms, status = 200) =>
  json(
    h,
    path,
    who.token,
    { version, include_alarms: alarms },
    "PATCH",
    status,
  );
async function feed(h, subscription, status = 200) {
  const response = await api(h, subscription.path, null, null, "GET", status);
  return { response, text: await response.text() };
}
const events = (text) =>
  new ICAL.Component(ICAL.parse(text)).getAllSubcomponents("vevent");
const board = (h, r, who = r.owner) =>
  json(
    h,
    `/chores/board?invite_code=${r.invite_code}&member_id=${who.id}`,
    who.token,
  );
async function test(name, run) {
  const h = await createHarness();
  const start = assertions;
  try {
    await run(h);
    results.push({ name, status: "passed", assertions: assertions - start });
  } catch (e) {
    results.push({
      name,
      status: "failed",
      message: String(e.message)
        .replace(/[a-f0-9]{64}/g, "[credential]")
        .slice(0, 750),
    });
  } finally {
    h.close();
  }
}
try {
  await test("private capability is separate from login, scoped to one person and hashed at rest", async (h) => {
    const r = await fixture(h);
    eq(await json(h, path, r.owner.token), {
      enabled: false,
      include_alarms: false,
      version: 0,
      updated_at: null,
    });
    await api(h, path, null, null, "GET", 401);
    await api(
      h,
      path,
      r.member.token,
      { version: 0, include_alarms: true },
      "POST",
      422,
    );
    const sub = await create(h, r.owner);
    ok(/^\/chores\/calendar\/[a-f0-9]{64}\.ics$/.test(sub.path));
    const token = sub.path.split("/").pop().slice(0, -4);
    const row = h.db.sqlite
      .prepare("SELECT * FROM chore_calendar_subscriptions")
      .get();
    eq(row.token_hash, createHash("sha256").update(token).digest("hex"));
    ok(row.token_hash !== token);
    const read = await json(h, path, r.owner.token);
    eq(read.enabled, true);
    eq(read.path, undefined);
    eq(read.token_hash, undefined);
    await api(h, path, token, null, "GET", 401);
    const { response, text } = await feed(h, sub);
    eq(response.headers.get("content-type"), "text/calendar; charset=utf-8");
    ok(response.headers.get("cache-control").includes("no-store"));
    eq(response.headers.get("referrer-policy"), "no-referrer");
    const list = events(text);
    eq(list.length, 3);
    eq(
      list.map((event) => event.getFirstPropertyValue("summary")).sort(),
      ["地板 · 本轮待办", "厕所 · 本轮待办", "洗手池 · 本轮待办"].sort(),
    );
    ok(
      list.every((e) =>
        e.getFirstPropertyValue("uid").includes("-" + r.owner.id + "-"),
      ),
    );
    ok(!text.includes(r.owner.token));
    ok(!text.includes(r.invite_code));
    ok(!text.includes(token));
    ok(!text.includes("BEGIN:VALARM"));
    ok(!text.includes("抬水"));
    const otherSub = await create(h, r.member);
    const other = events((await feed(h, otherSub)).text);
    ok(
      other.every((e) =>
        e.getFirstPropertyValue("uid").includes("-" + r.member.id + "-"),
      ),
    );
    const unknown = { path: "/chores/calendar/" + "a".repeat(64) + ".ics" };
    await feed(h, unknown, 404);
    await api(h, sub.path, null, null, "POST", 404);
    await api(h, sub.path, null, null, "HEAD");
  });
  await test("alarm opt-in uses explicit Shanghai times, only future triggers, and follows plan disabling", async (h) => {
    const r = await fixture(h);
    await create(h, r.owner, 0, true, 422);
    await json(
      h,
      "/chores/reminder-plan",
      r.owner.token,
      { enabled: true, times: ["08:00", "19:00"], version: 0 },
      "PATCH",
    );
    const sub = await create(h, r.owner, 0, true);
    let list = events((await feed(h, sub)).text);
    eq(list.flatMap((e) => e.getAllSubcomponents("valarm")).length, 6);
    eq(
      list[0]
        .getAllSubcomponents("valarm")
        .map((a) => a.getFirstPropertyValue("trigger").toString()),
      ["2026-10-15T00:00:00Z", "2026-10-15T11:00:00Z"],
    );
    clock = new RealDate("2026-10-15T08:05:00+08:00").getTime();
    list = events((await feed(h, sub)).text);
    eq(list.flatMap((e) => e.getAllSubcomponents("valarm")).length, 3);
    await json(
      h,
      "/chores/reminder-plan",
      r.owner.token,
      { enabled: false, times: ["08:00", "19:00"], version: 1 },
      "PATCH",
    );
    advance();
    list = events((await feed(h, sub)).text);
    eq(list.flatMap((e) => e.getAllSubcomponents("valarm")).length, 0);
  });
  await test("alarm preferences update without rotating the private calendar URL", async (h) => {
    clock = new RealDate("2026-10-15T07:59:00+08:00").getTime();
    const r = await fixture(h),
      sub = await create(h, r.owner);
    await update(h, r.owner, 1, true, 422);
    await json(
      h,
      "/chores/reminder-plan",
      r.owner.token,
      { enabled: true, times: ["08:00", "19:00"], version: 0 },
      "PATCH",
    );
    const enabled = await update(h, r.owner, 1, true);
    eq(enabled.version, 2);
    eq(enabled.enabled, true);
    eq(enabled.include_alarms, true);
    eq(enabled.path, undefined);
    await update(h, r.owner, 1, false, 409);
    advance();
    let list = events((await feed(h, sub)).text);
    eq(list.flatMap((e) => e.getAllSubcomponents("valarm")).length, 6);
    const disabled = await update(h, r.owner, 2, false);
    eq(disabled.version, 3);
    advance();
    list = events((await feed(h, sub)).text);
    eq(list.flatMap((e) => e.getAllSubcomponents("valarm")).length, 0);
    await api(
      h,
      path,
      r.member.token,
      { version: 0, include_alarms: true },
      "PATCH",
      409,
    );
  });
  await test("completion removes original work, next-day free tasks keep stable UIDs, date projection does not create rounds", async (h) => {
    const r = await fixture(h),
      sub = await create(h, r.owner);
    const before = await board(h, r);
    const old = events((await feed(h, sub)).text),
      floor = before.today_tasks.find((t) => t.key === "floor");
    await api(
      h,
      `/chores/tasks/${floor.id}/complete`,
      r.owner.token,
      {},
      "PATCH",
    );
    advance();
    const list = events((await feed(h, sub)).text);
    eq(list.length, 2);
    eq(
      list.map((event) => event.getFirstPropertyValue("summary")).sort(),
      ["厕所 · 本轮待办", "洗手池 · 本轮待办"].sort(),
    );
    const previous = new Map(
      list.map((event) => [
        event.getFirstPropertyValue("uid"),
        event.getFirstPropertyValue("sequence"),
      ]),
    );
    const count = h.db.sqlite
      .prepare("SELECT count(*) AS n FROM chore_tasks")
      .get().n;
    advance(86400000);
    const next = events((await feed(h, sub)).text);
    eq(next.length, 2);
    for (const event of next) {
      const uid = event.getFirstPropertyValue("uid");
      ok(previous.has(uid));
      ok(event.getFirstPropertyValue("sequence") > previous.get(uid));
    }
    ok(next[0].getFirstPropertyValue("dtstart").isDate);
    eq(
      next[0].getFirstPropertyValue("dtstart").toString(),
      new Date(clock + 8 * 3600000).toISOString().slice(0, 10),
    );
    eq(
      h.db.sqlite.prepare("SELECT count(*) AS n FROM chore_tasks").get().n,
      count,
    );
    eq(
      h.db.sqlite
        .prepare("SELECT status FROM chore_tasks WHERE id=?")
        .get(floor.id).status,
      "completed",
    );
    ok(old.some((e) => !previous.has(e.getFirstPropertyValue("uid"))));
  });
  await test("scheduled export uses real assignees and dates, setting disable removes events, UTF-8 injection stays text", async (h) => {
    const r = await fixture(h),
      initial = await board(h, r);
    const content =
      "地板😀".repeat(80) + "\\,;\r\nBEGIN:VEVENT\nATTENDEE:bad@example.test";
    await json(
      h,
      "/chores/settings",
      r.owner.token,
      {
        version: initial.version,
        categories: [
          { key: "floor", mode: "scheduled", content, deadline_time: "22:15" },
        ],
      },
      "PATCH",
    );
    const sub = await create(h, r.owner);
    const { text } = await feed(h, sub);
    const list = events(text);
    const scheduled = list.filter(
      (e) => e.getFirstPropertyValue("summary") === "地板 · 值日",
    );
    ok(scheduled.length > 0);
    ok(list.length <= 64);
    for (const e of scheduled) {
      const taskId = Number(e.getFirstPropertyValue("uid").match(/-(\d+)@/)[1]);
      const task = h.db.sqlite
        .prepare("SELECT * FROM chore_tasks WHERE id=?")
        .get(taskId);
      eq(task.assignee_id, r.owner.id);
      eq(e.getFirstPropertyValue("dtstart").toString(), task.duty_date);
      ok(
        e
          .getFirstPropertyValue("description")
          .includes(content.replace(/\r\n/g, "\n")),
      );
      ok(e.getFirstPropertyValue("description").includes("北京时间 22:15"));
      eq(e.getFirstPropertyValue("attendee"), null);
    }
    for (const line of text.split("\r\n")) {
      ok(Buffer.byteLength(line) <= 75);
      ok(!line.includes("\ufffd"));
    }
    const current = await board(h, r);
    await json(
      h,
      "/chores/settings",
      r.owner.token,
      {
        version: current.version,
        categories: [{ key: "floor", enabled: false }],
      },
      "PATCH",
    );
    advance();
    eq(
      events((await feed(h, sub)).text).some((e) =>
        e.getFirstPropertyValue("summary").startsWith("地板"),
      ),
      false,
    );
  });
  await test("CAS, rotate cooldown, revoke and concurrent create never preserve an old capability", async (h) => {
    const r = await fixture(h);
    const requests = await Promise.all([
      h.request(path, {
        token: r.owner.token,
        method: "POST",
        data: { version: 0, include_alarms: false },
      }),
      h.request(path, {
        token: r.owner.token,
        method: "POST",
        data: { version: 0, include_alarms: false },
      }),
    ]);
    eq(requests.map((r) => r.status).sort(), [200, 409]);
    const sub = await requests.find((r) => r.status === 200).json();
    await create(h, r.owner, 0, false, 409);
    await create(h, r.owner, 1, false, 429);
    advance(61000);
    const rotated = await create(h, r.owner, 1);
    ok(rotated.path !== sub.path);
    await feed(h, sub, 404);
    await feed(h, rotated);
    await json(h, path, r.owner.token, { version: 1 }, "DELETE", 409);
    eq(
      (await json(h, path, r.owner.token, { version: 2 }, "DELETE")).enabled,
      false,
    );
    await feed(h, rotated, 404);
    const next = await create(h, r.owner, 3);
    await feed(h, next);
    await feed(h, rotated, 404);
  });
  await test("active membership, demo restrictions and room switches revoke credentials irreversibly", async (h) => {
    const r = await fixture(h),
      other = await fixture(h),
      sub = await create(h, r.member);
    const another = await create(h, other.owner);
    const content = (await feed(h, another)).text;
    ok(!content.includes(`duty-${r.dorm.id}-${r.member.id}-`));
    h.db.sqlite
      .prepare(
        "UPDATE dorm_members SET is_active=0,left_at=? WHERE dorm_id=? AND user_id=?",
      )
      .run(new Date().toISOString(), r.dorm.id, r.member.id);
    await feed(h, sub, 404);
    h.db.sqlite
      .prepare(
        "UPDATE dorm_members SET is_active=1 WHERE dorm_id=? AND user_id=?",
      )
      .run(r.dorm.id, r.member.id);
    await feed(h, sub, 404);
    const row = h.db.sqlite
      .prepare("SELECT * FROM chore_calendar_subscriptions WHERE user_id=?")
      .get(r.member.id);
    eq(row.token_hash, null);
    eq(row.enabled, 0);
    eq(row.version, 2);
    const ownerSub = await create(h, r.owner);
    h.db.sqlite
      .prepare("UPDATE users SET current_dorm_id=? WHERE id=?")
      .run(other.dorm.id, r.owner.id);
    await feed(h, ownerSub, 404);
    h.db.sqlite
      .prepare("UPDATE users SET current_dorm_id=? WHERE id=?")
      .run(r.dorm.id, r.owner.id);
    await feed(h, ownerSub, 404);
    h.db.sqlite
      .prepare("UPDATE dormitories SET is_demo=1 WHERE id=?")
      .run(r.dorm.id);
    await create(h, r.owner, 2, false, 403);
  });
  await test("feed throttling, invalid payloads and UTC midnight are deterministic", async (h) => {
    const r = await fixture(h);
    for (const data of [
      { version: -1, include_alarms: false },
      { version: 0, include_alarms: "yes" },
      { version: 0, include_alarms: false, user_id: r.member.id },
      [],
    ])
      await api(h, path, r.owner.token, data, "POST", 422);
    await api(
      h,
      path,
      r.owner.token,
      { version: 0, include_alarms: "yes" },
      "PATCH",
      422,
    );
    const sub = await create(h, r.owner);
    await feed(h, sub);
    const limited = await api(h, sub.path, null, null, "GET", 429);
    eq(limited.headers.get("retry-after"), "10");
    await api(h, sub.path, null, null, "HEAD");
    advance();
    await feed(h, sub);
    const text = renderCalendar({
      tasks: [
        {
          id: 99,
          dorm_id: 1,
          assignee_id: 1,
          mode: "self_round",
          name: "厕所",
          content: "测试",
        },
      ],
      today: "2026-12-31",
      now: new Date("2026-12-31T15:59:00Z"),
      version: 1,
      alarms: true,
      plan: { enabled: true, times: ["23:59", "00:00"] },
    });
    const e = events(text)[0];
    eq(e.getFirstPropertyValue("dtstart").toString(), "2026-12-31");
    eq(e.getFirstPropertyValue("dtend").toString(), "2027-01-01");
    eq(e.getAllSubcomponents("valarm").length, 0);
  });
  await test("migration from 0007 and file database restart preserve records and subscription credentials", async () => {
    const directory = await fs.mkdtemp(
      pathModule.join(os.tmpdir(), "dorm-calendar-migration-"),
    );
    const file = pathModule.join(directory, "prior.sqlite");
    let db = new SQLiteD1(file);
    try {
      db.sqlite.exec(
        "CREATE TABLE _local_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL,applied_at TEXT NOT NULL)",
      );
      for (const name of (
        await fs.readdir(new URL("../drizzle/", import.meta.url))
      )
        .filter((name) => name.endsWith(".sql") && name < "0008")
        .sort()) {
        const sql = await fs.readFile(
          new URL("../drizzle/" + name, import.meta.url),
          "utf8",
        );
        db.sqlite.exec(sql);
        db.sqlite
          .prepare("INSERT INTO _local_migrations VALUES (?,?,?)")
          .run(
            name,
            createHash("sha256").update(sql).digest("hex"),
            new Date().toISOString(),
          );
      }
      // Current auth queries require this additive column while constructing old-schema fixtures.
      db.sqlite.exec("ALTER TABLE sessions ADD COLUMN dorm_id INTEGER REFERENCES dormitories(id)");
      const env = { DB: db, DEFAULT_DORM_INVITE_CODE: "", EMAIL_GATE_VERIFIED: EMAIL_GATE_CAPABILITY };
      const h = {
        request(route, { token, method = "GET", data } = {}) {
          return handleApi(
            new Request("https://calendar-migration.example" + route, {
              method,
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              ...(data ? { body: JSON.stringify(data) } : {}),
            }),
            env,
            { waitUntil() {} },
          );
        },
      };
      // Seed the old schema through its task rows; the current board requires migration 0010.
      const r = await fixture(h),
        initial = {today_tasks:db.sqlite.prepare("SELECT * FROM chore_tasks WHERE assignee_id=? AND key='floor' AND status='pending' ORDER BY id LIMIT 1").all(r.member_id)};
      await api(
        h,
        `/chores/tasks/${initial.today_tasks[0].id}/complete`,
        r.owner.token,
        {},
        "PATCH",
      );
      await json(
        h,
        "/chores/reminder-plan",
        r.owner.token,
        { enabled: false, times: ["08:30"], version: 0 },
        "PATCH",
      );
      db.sqlite.exec("ALTER TABLE sessions DROP COLUMN dorm_id");
      const tables = [
        "users",
        "dormitories",
        "dorm_members",
        "sessions",
        "member_sessions",
        "chore_tasks",
        "chore_reminder_preferences",
      ];
      const before = Object.fromEntries(
        tables.map((name) => [
          name,
          db.sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all(),
        ]),
      );
      db.close();
      db = null;
      db = await openDatabase(file);
      env.DB = db;
      for (const name of tables)
        eq(
          db.sqlite.prepare(`SELECT ${Object.keys(before[name][0] || {}).join(",") || "*"} FROM ${name} ORDER BY rowid`).all(),
          before[name],
          name,
        );
      const sub = await create(h, r.owner);
      const first = events((await feed(h, sub)).text).map((e) =>
        e.getFirstPropertyValue("uid"),
      );
      db.close();
      db = null;
      db = await openDatabase(file);
      env.DB = db;
      advance();
      eq(
        events((await feed(h, sub)).text).map((e) =>
          e.getFirstPropertyValue("uid"),
        ),
        first,
      );
      eq((await json(h, path, r.owner.token)).enabled, true);
      eq(
        db.sqlite.prepare("PRAGMA integrity_check").get().integrity_check,
        "ok",
      );
      eq(db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
      eq(db.sqlite.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
    } finally {
      db?.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  await test("revocation during maintenance is rechecked before any calendar is returned", async (h) => {
    const r = await fixture(h),
      sub = await create(h, r.owner);
    const response = await calendarFeed(
      new Request("https://calendar-test.example" + sub.path),
      {
        db: h.db,
        now: new Date(),
        maintain: async () => {
          h.db.sqlite
            .prepare(
              "UPDATE chore_calendar_subscriptions SET enabled=0,token_hash=NULL WHERE user_id=?",
            )
            .run(r.owner.id);
          return { state: { version: 1 } };
        },
      },
    );
    eq(response.status, 404);
    ok(!(await response.text()).includes("VEVENT"));
  });
  const failed = results.filter((r) => r.status === "failed").length;
  process.stdout.write(
    JSON.stringify(
      {
        assertions,
        passed: results.length - failed,
        failed,
        results,
        excludes:
          "real calendar import, refresh scheduling, OS alarms or phone delivery",
      },
      null,
      2,
    ) + "\n",
  );
  if (failed) process.exitCode = 1;
} finally {
  globalThis.Date = RealDate;
}
