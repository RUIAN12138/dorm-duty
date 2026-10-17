import assert from "node:assert/strict";
import { SQLiteD1 } from "../local/sqlite-d1.mjs";
import { MARK_IDS } from "../shared/member-marks.mjs";
export { SQLiteD1 } from "../local/sqlite-d1.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export async function createHarness() {
  const db = new SQLiteD1();
  const migrationRoot = path.join(siteRoot, "drizzle");
  const files = (await fs.readdir(migrationRoot))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert(
    files.length > 0,
    "Generate checked-in Drizzle SQL migrations before running backend verification",
  );
  for (const name of files)
    db.sqlite.exec(await fs.readFile(path.join(migrationRoot, name), "utf8"));
  const { handleApi, EMAIL_GATE_CAPABILITY } = await import("../worker/backend.mjs");
  const env = { DB: db, DEFAULT_DORM_INVITE_CODE: "", EMAIL_GATE_VERIFIED: EMAIL_GATE_CAPABILITY };
  const pending = [];
  const ctx = {
    waitUntil(promise) {
      pending.push(Promise.resolve(promise));
    },
  };
  return {
    db,
    env,
    async request(route, { token, method = "GET", data } = {}) {
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (data !== undefined) headers["Content-Type"] = "application/json";
      return handleApi(
        new Request("https://backend-test.example" + route, {
          method,
          headers,
          body: data === undefined ? undefined : JSON.stringify(data),
        }),
        env,
        ctx,
      );
    },
    async flush() {
      await Promise.all(pending.splice(0));
    },
    close() {
      db.close();
    },
  };
}

let assertions = 0;
const secrets = [];
function equal(actual, expected, message) {
  assertions++;
  assert.deepEqual(actual, expected, message);
}
function ok(condition, message) {
  assertions++;
  assert(condition, message);
}
function redacted(message) {
  let clean = String(message);
  for (const value of secrets)
    if (value) clean = clean.split(value).join("[redacted]");
  return clean
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .split("\n")[0]
    .slice(0, 600);
}
function addDays(day, amount) {
  const date = new Date(day + "T12:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function weekday(day) {
  return new Date(day + "T12:00Z").getUTCDay() || 7;
}

export async function runBackendChecks() {
  const results = [];
  const tests = [];
  const test = (name, run) => tests.push({ name, run });
  const OriginalDate = Date;
  let testNow = new OriginalDate("2026-10-12T00:00:00.000Z").getTime();
  // The process-local clock is controlled; no host date or deployed clock changes.
  globalThis.Date = class TestDate extends OriginalDate {
    constructor(...args) {
      super(...(args.length ? args : [testNow]));
    }
    static now() {
      return testNow;
    }
  };
  const day = "2026-10-12";
  const password = "VerificationOnlyPassword_2026!";
  secrets.push(password);
  async function api(h, route, { status = 200, ...options } = {}) {
    const response = await h.request(route, options);
    equal(
      response.status,
      status,
      `${route}: HTTP ${response.status}, expected ${status}`,
    );
    ok(
      /(?:^|,)\s*no-store\b/.test(response.headers.get("cache-control") || ""),
      `${route}: no-store missing`,
    );
    ok(
      /json/i.test(response.headers.get("content-type") || ""),
      `${route}: expected JSON`,
    );
    return response.json();
  }
  async function account(h, username, nickname = username) {
    await api(h, "/auth/register", {
      method: "POST",
      status: 201,
      data: { username, password, nickname },
    });
    const login = await api(h, "/auth/login", {
      method: "POST",
      data: { username, password },
    });
    ok(login.access_token, "login token missing");
    secrets.push(login.access_token);
    const user = await api(h, "/auth/me", {token: login.access_token});
    return { ...user, token: login.access_token };
  }
  const current = (h, a) => api(h, "/dorms/current", { token: a.token });
  async function room(h) {
    const a = await account(h, "alice", "张同学");
    const b = await account(h, "bob", "李同学");
    const created = await api(h, "/dorms", {
      token: a.token,
      method: "POST",
      status: 201,
      data: { name: "6-402" },
    });
    await api(h, "/dorms/join", {
      token: b.token,
      method: "POST",
      data: { invite_code: created.invite_code },
    });
    return { a, b, dorm: await current(h, a) };
  }
  async function generateToday(h, a) {
    const dorm = await current(h, a);
    await api(h, "/duties/generate", {
      token: a.token,
      method: "POST",
      data: {
        start_date: day,
        days: 30,
        expected_version: dorm.schedule_version,
      },
    });
    return (await api(h, "/duties/today", { token: a.token })).task;
  }
  async function assign(h, a, taskId, changes) {
    return api(h, `/duties/${taskId}`, {
      token: a.token,
      method: "PATCH",
      data: {
        expected_version: (await current(h, a)).schedule_version,
        ...changes,
      },
    });
  }
  async function configure(h, a, changes, status = 200) {
    return api(h, "/dorms/current", {
      token: a.token,
      method: "PATCH",
      status,
      data: {
        expected_version: (await current(h, a)).schedule_version,
        ...changes,
      },
    });
  }
  async function list(h, a, from = day, to = addDays(day, 29), extra = "") {
    return api(
      h,
      `/duties?start_date=${from}&end_date=${to}&page_size=100${extra}`,
      { token: a.token },
    );
  }

  test("D1 shim enforces real SQLite constraints and atomic rollback", async (h) => {
    equal(h.db.sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    h.db.sqlite.exec(
      "CREATE TABLE shim_probe(id INTEGER PRIMARY KEY, value TEXT NOT NULL UNIQUE)",
    );
    await assert.rejects(
      h.db.batch([
        h.db.prepare("INSERT INTO shim_probe(value) VALUES (?)").bind("one"),
        h.db.prepare("INSERT INTO shim_probe(value) VALUES (?)").bind("one"),
      ]),
    );
    assertions++;
    equal(
      h.db.sqlite.prepare("SELECT COUNT(*) AS count FROM shim_probe").get()
        .count,
      0,
      "batch must roll back first write after second fails",
    );
    await h.db
      .prepare("INSERT INTO shim_probe(value) VALUES (?)")
      .bind("ok")
      .run();
    equal(
      await h.db.prepare("SELECT value FROM shim_probe").first("value"),
      "ok",
    );
    equal(
      await h.db
        .prepare("SELECT id,value FROM shim_probe")
        .raw({ columnNames: true }),
      [
        ["id", "value"],
        [1, "ok"],
      ],
    );
  });

  test("Registration, password hashing, authentication, logout and session expiry", async (h) => {
    const a = await account(h, "alice", "张同学");
    await api(h, "/auth/me", { status: 401 });
    await api(h, "/auth/login", {
      method: "POST",
      status: 401,
      data: { username: "alice", password: "IncorrectPassword!" },
    });
    await api(h, "/auth/register", {
      method: "POST",
      status: 201,
      data: { username: "alice", password, nickname: "duplicate" },
    });
    await api(h, "/auth/register", {
      method: "POST",
      status: 422,
      data: { username: "x", password: "short", nickname: "x" },
    });
    equal((await api(h, "/auth/me", { token: a.token })).id, a.id);
    await api(h, "/auth/me", {
      token: a.token,
      method: "PATCH",
      status: 422,
      data: { password_hash: "override" },
    });
    await api(h, "/auth/me", {
      token: a.token,
      method: "PATCH",
      data: { nickname: "新昵称" },
    });
    equal((await api(h, "/auth/me", { token: a.token })).nickname, "新昵称");
    const b = await account(h, "bob");
    const hashes = h.db.sqlite
      .prepare("SELECT password_hash FROM users ORDER BY id")
      .all()
      .map((row) => row.password_hash);
    ok(
      hashes.every(
        (hash) => hash && hash !== password && !hash.includes(password),
      ),
    );
    ok(hashes[0] !== hashes[1], "equal passwords must use independent salts");
    const storedSessions = h.db.sqlite
      .prepare("SELECT token_hash FROM sessions")
      .all();
    ok(
      storedSessions.every(
        (row) => row.token_hash !== a.token && row.token_hash !== b.token,
      ),
      "only session hashes may persist",
    );
    h.db.sqlite
      .prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
      .run("2020-01-01T00:00:00.000Z", b.id);
    await api(h, "/auth/me", { token: b.token, status: 401 });
    await api(h, "/auth/logout", { token: a.token, method: "POST" });
    await api(h, "/auth/me", { token: a.token, status: 401 });
  });

  test("Dorm membership, administrator authorization and transfer are isolated", async (h) => {
    const { a, b, dorm } = await room(h);
    const c = await account(h, "carol");
    const other = await api(h, "/dorms", {
      token: c.token,
      method: "POST",
      status: 201,
      data: { name: "other" },
    });
    await api(h, "/dorms/join", {
      token: a.token,
      method: "POST",
      status: 409,
      data: { invite_code: other.invite_code },
    });
    await api(h, "/dorms/join", {
      token: b.token,
      method: "POST",
      data: { invite_code: dorm.invite_code.toLowerCase() },
    });
    equal((await current(h, a)).members.length, 2);
    await configure(h, b, { name: "unauthorized" }, 403);
    await api(h, "/dorms/current/leave", {
      token: a.token,
      method: "POST",
      status: 409,
    });
    await configure(h, a, { rotation_order: [a.id, a.id] }, 422);
    equal(
      (await current(h, a)).schedule_version,
      dorm.schedule_version,
      "invalid order must not partially mutate version",
    );
    await api(h, "/dorms/current/transfer-admin", {
      token: a.token,
      method: "POST",
      data: { user_id: b.id, expected_version: dorm.schedule_version },
    });
    ok((await current(h, b)).is_admin);
    await configure(h, a, { name: "no longer admin" }, 403);
    await api(h, "/dorms/current/leave", { token: a.token, method: "POST" });
    await api(h, "/duties/today", { token: a.token, status: 403 });
    equal(
      h.db.sqlite
        .prepare("SELECT is_active FROM dorm_members WHERE user_id=?")
        .get(a.id).is_active,
      0,
    );
  });

  test("Generated schedules are idempotent, versioned and range constrained", async (h) => {
    const { a, b, dorm } = await room(h);
    const body = {
      start_date: day,
      days: 30,
      expected_version: dorm.schedule_version,
    };
    const first = await api(h, "/duties/generate", {
      token: a.token,
      method: "POST",
      data: body,
    });
    const second = await api(h, "/duties/generate", {
      token: a.token,
      method: "POST",
      data: { ...body, expected_version: first.schedule_version },
    });
    equal(second.added, 0);
    equal((await list(h, a)).items.length, 30);
    await api(h, "/duties/generate", {
      token: a.token,
      method: "POST",
      status: 409,
      data: { ...body, expected_version: 1 },
    });
    await api(h, "/duties/generate", {
      token: b.token,
      method: "POST",
      status: 403,
      data: body,
    });
    for (const invalid of [
      { start_date: addDays(day, -1), days: 30 },
      { start_date: addDays(day, 89), days: 2 },
      { start_date: day, days: 91 },
    ]) {
      await api(h, "/duties/generate", {
        token: a.token,
        method: "POST",
        status: 422,
        data: {
          ...invalid,
          expected_version: (await current(h, a)).schedule_version,
        },
      });
    }
    await api(h, `/duties?start_date=${day}&end_date=${addDays(day, 90)}`, {
      token: a.token,
      status: 422,
    });
  });

  test("Custom weekdays, rotation intervals, skip dates and weekday task templates persist", async (h) => {
    const { a, b } = await room(h);
    const start = addDays(day, 1);
    const skip = addDays(start, 2);
    const rules = {
      weekdays: [1, 2, 3, 4, 5],
      rotation_days: 2,
      horizon_days: 60,
      skip_dates: [skip],
      weekly_tasks: {
        [weekday(start)]: {
          task_text: "洗手台\n公共桌面",
          deadline_time: "20:15",
        },
      },
    };
    const draft = {
      rotation_order: [b.id, a.id],
      rotation_start_date: start,
      task_text: "扫地\n倒垃圾",
      deadline_time: "21:30",
      schedule_rules: rules,
    };
    const preview = await api(h, "/duties/preview", {
      token: a.token,
      method: "POST",
      data: { ...draft, start_date: start, days: 14 },
    });
    await api(h, "/duties/preview", {
      token: b.token,
      method: "POST",
      status: 403,
      data: { ...draft, start_date: start, days: 14 },
    });
    await configure(h, a, draft);
    equal((await current(h, b)).schedule_rules, rules);
    const stored = (await list(h, a, start, addDays(start, 13))).items;
    const expectedDates = [];
    let slot = 0;
    for (let offset = 0; offset < 14; offset++) {
      const date = addDays(start, offset);
      if (weekday(date) > 5 || date === skip) continue;
      expectedDates.push(date);
      const task = stored.find((row) => row.duty_date === date);
      ok(task, `eligible day ${date} must have a task`);
      equal(task.assignee_id, Math.floor(slot / 2) % 2 === 0 ? b.id : a.id);
      equal(
        task.task_text,
        weekday(date) === weekday(start) ? "洗手台\n公共桌面" : "扫地\n倒垃圾",
      );
      equal(
        task.deadline_at.slice(11, 16),
        weekday(date) === weekday(start) ? "12:15" : "13:30",
      );
      slot++;
    }
    equal(stored.map((task) => task.duty_date).sort(), expectedDates);
    equal(
      preview.items.filter((row) => row.task).map((row) => row.duty_date),
      expectedDates,
    );
    const count = h.db.sqlite
      .prepare(
        "SELECT COUNT(*) AS count FROM duty_tasks WHERE dorm_id=? AND duty_date>? AND duty_date<=?",
      )
      .get((await current(h, a)).id, day, addDays(day, 60)).count;
    ok(
      count > 30,
      "60-day horizon must persist more than the default 30-day set",
    );
  });

  test("Invalid customization is rejected without partial writes", async (h) => {
    const { a, b, dorm } = await room(h);
    for (const schedule_rules of [
      { weekdays: [] },
      { weekdays: [1, 1] },
      { weekdays: [8] },
      { rotation_days: 0 },
      { horizon_days: 91 },
      { weekly_tasks: { 8: { task_text: "x" } } },
      { weekly_tasks: { 1: { deadline_time: "25:00" } } },
    ]) {
      await configure(h, a, { schedule_rules }, 422);
    }
    await configure(h, a, { deadline_time: "25:00" }, 422);
    equal((await current(h, a)).schedule_version, dorm.schedule_version);
    await configure(h, b, { schedule_rules: { rotation_days: 2 } }, 403);
  });

  test("Manual duties on rest days preserve content and reject duplicate/non-admin writes", async (h) => {
    const { a, b } = await room(h);
    await configure(h, a, { schedule_rules: { weekdays: [1, 2, 3, 4, 5] } });
    let rest = addDays(day, 1);
    while (weekday(rest) !== 7) rest = addDays(rest, 1);
    const body = {
      expected_version: (await current(h, a)).schedule_version,
      duty_date: rest,
      assignee_id: b.id,
      task_text: "手工周末安排\n检查公共水电",
      deadline_time: "20:30",
    };
    await api(h, "/duties/custom", {
      token: b.token,
      method: "POST",
      status: 403,
      data: body,
    });
    const created = await api(h, "/duties/custom", {
      token: a.token,
      method: "POST",
      status: 201,
      data: body,
    });
    ok(created.task.is_override);
    equal(created.task.duty_date, rest);
    equal(created.task.assignee_id, b.id);
    equal(created.task.deadline_at.slice(11, 16), "12:30");
    await api(h, "/duties/custom", {
      token: a.token,
      method: "POST",
      status: 409,
      data: {
        ...body,
        expected_version: (await current(h, a)).schedule_version,
      },
    });
    await api(h, "/duties/generate", {
      token: a.token,
      method: "POST",
      data: {
        start_date: day,
        days: 30,
        expected_version: (await current(h, a)).schedule_version,
      },
    });
    const stored = (await list(h, a)).items.find(
      (task) => task.duty_date === rest,
    );
    equal(stored.id, created.task.id);
    equal(stored.task_text, body.task_text);
    ok(stored.is_override);
    await api(h, "/duties/custom", {
      token: a.token,
      method: "POST",
      status: 422,
      data: {
        ...body,
        duty_date: addDays(day, -1),
        expected_version: (await current(h, a)).schedule_version,
      },
    });
  });

  test("Only the assignee completes, duplicates conflict, history and names remain immutable", async (h) => {
    const { a, b } = await room(h);
    const todayTask = await generateToday(h, a);
    await assign(h, a, todayTask.id, { assignee_id: a.id });
    const c = await account(h, "carol");
    await api(h, "/dorms", {
      token: c.token,
      method: "POST",
      status: 201,
      data: { name: "other" },
    });
    await api(h, `/duties/${todayTask.id}/complete`, {
      token: b.token,
      method: "PATCH",
      status: 403,
    });
    await api(h, `/duties/${todayTask.id}/complete`, {
      token: c.token,
      method: "PATCH",
      status: 404,
    });
    await api(h, `/duties/${todayTask.id}/complete`, {
      method: "PATCH",
      status: 401,
    });
    const completed = await api(h, `/duties/${todayTask.id}/complete`, {
      token: a.token,
      method: "PATCH",
    });
    equal(completed.status, "completed");
    ok(completed.completed_at);
    await api(h, `/duties/${todayTask.id}/complete`, {
      token: a.token,
      method: "PATCH",
      status: 409,
    });
    await api(h, "/auth/me", {
      token: a.token,
      method: "PATCH",
      data: { nickname: "新昵称" },
    });
    await api(h, `/duties/${todayTask.id}`, {
      token: a.token,
      method: "PATCH",
      status: 409,
      data: {
        expected_version: (await current(h, a)).schedule_version,
        assignee_id: b.id,
      },
    });
    await api(h, "/duties/regenerate", {
      token: a.token,
      method: "POST",
      data: {
        start_date: addDays(day, 1),
        days: 30,
        expected_version: (await current(h, a)).schedule_version,
      },
    });
    const kept = (await api(h, "/duties/today", { token: a.token })).task;
    equal(kept.completed_at, completed.completed_at);
    equal(kept.assignee_name_snapshot, "张同学");
    const future = (await list(h, a)).items.find(
      (task) => task.duty_date > day && task.assignee_id === a.id,
    );
    await api(h, `/duties/${future.id}/complete`, {
      token: a.token,
      method: "PATCH",
      status: 409,
    });
  });

  test("Concurrent completion and concurrent joining each produce one winner", async (h) => {
    const { a, b } = await room(h);
    const task = await generateToday(h, a);
    await assign(h, a, task.id, { assignee_id: a.id });
    const completions = await Promise.all([
      h.request(`/duties/${task.id}/complete`, {
        token: a.token,
        method: "PATCH",
      }),
      h.request(`/duties/${task.id}/complete`, {
        token: a.token,
        method: "PATCH",
      }),
    ]);
    equal(completions.map((response) => response.status).sort(), [200, 409]);
    const c = await account(h, "carol");
    const d = await account(h, "david");
    const other = await api(h, "/dorms", {
      token: c.token,
      method: "POST",
      status: 201,
      data: { name: "other" },
    });
    const primary = await current(h, b);
    const joined = await Promise.all([
      h.request("/dorms/join", {
        token: d.token,
        method: "POST",
        data: { invite_code: other.invite_code },
      }),
      h.request("/dorms/join", {
        token: d.token,
        method: "POST",
        data: { invite_code: primary.invite_code },
      }),
    ]);
    equal(joined.map((response) => response.status).sort(), [200, 409]);
    equal(
      h.db.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM dorm_members WHERE user_id=? AND is_active=1",
        )
        .get(d.id).count,
      1,
    );
  });

  test("Overrides, stale versions, member removal and history preservation", async (h) => {
    const { a, b } = await room(h);
    const task = await generateToday(h, a);
    await assign(h, a, task.id, { assignee_id: b.id });
    await api(h, "/dorms/current/leave", {
      token: b.token,
      method: "POST",
      status: 409,
    });
    await api(h, `/duties/${task.id}/complete`, {
      token: b.token,
      method: "PATCH",
    });
    const future = (await list(h, a)).items.find((row) => row.duty_date > day);
    const version = (await current(h, a)).schedule_version;
    const override = await api(h, `/duties/${future.id}`, {
      token: a.token,
      method: "PATCH",
      data: {
        expected_version: version,
        assignee_id: b.id,
        task_text: "整理阳台\n擦玻璃",
        deadline_time: "20:45",
      },
    });
    ok(override.task.is_override);
    equal(override.task.task_text, "整理阳台\n擦玻璃");
    equal(override.task.deadline_at.slice(11, 16), "12:45");
    await api(h, `/duties/${future.id}`, {
      token: a.token,
      method: "PATCH",
      status: 409,
      data: { expected_version: version, task_text: "stale must not win" },
    });
    await api(h, "/duties/generate", {
      token: a.token,
      method: "POST",
      data: {
        start_date: day,
        days: 30,
        expected_version: (await current(h, a)).schedule_version,
      },
    });
    equal(
      (await list(h, a)).items.find((row) => row.id === future.id).task_text,
      "整理阳台\n擦玻璃",
    );
    await api(h, "/dorms/current/leave", { token: b.token, method: "POST" });
    const futureRows = (await list(h, a)).items.filter(
      (row) => row.duty_date > day,
    );
    ok(futureRows.every((row) => row.assignee_id === a.id));
    const kept = (await api(h, "/duties/today", { token: a.token })).task;
    equal(kept.assignee_name_snapshot, "李同学");
    equal(kept.status, "completed");
  });

  test("Guest viewing is scoped, read-only, default-explicit and rejects removed members", async (h) => {
    const { a, b, dorm } = await room(h);
    const task = await generateToday(h, a);
    await assign(h, a, task.id, { assignee_id: a.id });
    const missing = await api(h, "/guest/dorm", { status: 400 });
    equal(missing.detail.code, "invite_required");
    h.env.DEFAULT_DORM_INVITE_CODE = dorm.invite_code;
    equal(
      (await api(h, "/guest/dorm", { status: 400 })).detail.code,
      "invite_required",
    );
    const viewed = await api(
      h,
      `/guest/dorm?invite_code=${dorm.invite_code.toLowerCase()}`,
    );
    equal(Object.keys(viewed).sort(), ["id", "is_demo", "members", "name"]);
    equal(viewed.is_demo, false);
    equal(viewed.members, [], "invite alone does not reveal names");
    const authorized = await api(h, `/guest/dorm?invite_code=${dorm.invite_code}`, {token:a.token});
    equal(
      authorized.members.map(({ user_id, nickname }) => ({ user_id, nickname })),
      [
        { user_id: a.id, nickname: "张同学" },
        { user_id: b.id, nickname: "李同学" },
      ],
    );
    for (const member of authorized.members) {
      equal(Object.keys(member).sort(), ["marker_id", "nickname", "user_id"]);
      ok(
        MARK_IDS.includes(member.marker_id),
        "guest exposes a supported pixel mark only",
      );
    }
    equal(
      new Set(authorized.members.map((member) => member.marker_id)).size,
      authorized.members.length,
    );
    const personal = await api(
      h,
      `/guest/tasks?invite_code=${dorm.invite_code}&member_id=${a.id}`,
      {token:a.token},
    );
    equal(personal.today, day);
    equal(personal.today_task.assignee_id, a.id);
    equal(personal.today_task.can_complete, false);
    ok(personal.next_task && !personal.next_task.can_complete);
    const c = await account(h, "carol");
    const other = await api(h, "/dorms", {
      token: c.token,
      method: "POST",
      status: 201,
      data: { name: "other" },
    });
    await api(
      h,
      `/guest/tasks?invite_code=${other.invite_code}&member_id=${a.id}`,
      { token:c.token, status: 404 },
    );
    await api(h, "/guest/dorm?invite_code=NOTREAL1", { status: 404 });
    await api(h, `/guest/tasks?invite_code=${dorm.invite_code}&member_id=0`, {
      token:a.token, status: 422,
    });
    await api(h, "/dorms/current", { status: 401 });
    await api(h, "/dorms/current", {
      method: "PATCH",
      data: {
        expected_version: dorm.schedule_version,
        name: "anonymous write",
      },
      status: 401,
    });
    await api(h, "/dorms/current/leave", { token: b.token, method: "POST" });
    await api(
      h,
      `/guest/tasks?invite_code=${dorm.invite_code}&member_id=${b.id}`,
      { token:a.token, status: 404 },
    );
    equal(
      (await api(h, `/guest/dorm?invite_code=${dorm.invite_code}`, {token:a.token})).members
        .length,
      1,
    );
    const rotated = await api(h, "/dorms/current/invite-code/rotate", {
      token: a.token,
      method: "POST",
    });
    await api(h, `/guest/dorm?invite_code=${dorm.invite_code}`, {
      status: 404,
    });
    equal(
      (await api(h, `/guest/dorm?invite_code=${rotated.invite_code}`)).id,
      dorm.id,
    );
  });

  test("Empty invites never expose a configured real dorm and demo lookup stays separate", async (h) => {
    const { a, dorm } = await room(h);
    h.env.DEFAULT_DORM_INVITE_CODE = dorm.invite_code;
    await api(h, "/guest/dorm", { status: 400 });
    await api(h, `/guest/tasks?member_id=${a.id}`, { status: 400 });
    await api(h, `/chores/board?member_id=${a.id}`, { status: 400 });
    for (const invite of ["", "   ", "NOTREAL1"]) {
      await api(h, `/guest/dorm?invite_code=${encodeURIComponent(invite)}`, {
        status: invite.trim() ? 404 : 422,
      });
      await api(h, "/chores/claim", {
        method: "POST",
        data: { invite_code: invite, member_id: a.id },
        status: invite.trim() ? 404 : invite ? 422 : 400,
      });
    }
    const { ensureLocalDemo } = await import("../local/database.mjs");
    const demoInvite = ensureLocalDemo(h.db);
    const demo = await api(h, "/guest/dorm");
    equal(demo.is_demo, true);
    ok(demo.id !== dorm.id);
    ok(!demo.members.some((m) => m.user_id === a.id));
    const explicitDemo = await api(h, `/guest/dorm?invite_code=${demoInvite}`);
    equal(explicitDemo.id, demo.id);
    equal(explicitDemo.is_demo, true);
    await api(h, `/chores/board?member_id=${a.id}`, { status: 404 });
    await api(h, "/chores/claim", {
      method: "POST",
      data: { invite_code: "", member_id: a.id },
      status: 403,
    });
    const formal = await api(h, `/guest/dorm?invite_code=${dorm.invite_code}`);
    equal(formal.id, dorm.id);
    equal(formal.is_demo, false);
    h.env.DEFAULT_DORM_INVITE_CODE = demoInvite;
    equal((await api(h, "/guest/dorm")).id, demo.id);
  });

  test("Anonymous creation grants a real owner session while invited members stay read-only", async (h) => {
    const created = await api(h, "/guest/create", {
      method: "POST",
      status: 201,
      data: {
        name: "免账号创建",
        nickname: "创建人",
        members: ["室友甲", "室友乙"],
      },
    });
    ok(created.access_token);
    secrets.push(created.access_token);
    ok(created.invite_code && created.member_id && created.dorm.id);
    equal(created.dorm.members.length, 3);
    const owner = await api(h, "/auth/me", { token: created.access_token });
    equal(owner.id, created.member_id);
    const ownerRoom = await api(h, "/dorms/current", {
      token: created.access_token,
    });
    ok(ownerRoom.is_admin);
    await api(h, "/dorms/current", {
      token: created.access_token,
      method: "PATCH",
      data: {
        expected_version: ownerRoom.schedule_version,
        task_text: "免账号管理员自定义内容",
        deadline_time: "21:15",
      },
    });
    const guest = await api(
      h,
      `/guest/dorm?invite_code=${created.invite_code}`,
      {token:created.access_token},
    );
    equal(guest.members.length, 3);
    const other = guest.members.find((member) => member.user_id !== owner.id);
    const tasks = await api(
      h,
      `/guest/tasks?invite_code=${created.invite_code}&member_id=${other.user_id}`,
      {token:created.access_token},
    );
    ok(tasks.next_task && !tasks.next_task.can_complete);
    await api(h, "/dorms/current", {
      method: "PATCH",
      status: 401,
      data: {
        expected_version: ownerRoom.schedule_version,
        name: "guest takeover",
      },
    });
    await api(h, "/guest/create", {
      method: "POST",
      status: 422,
      data: { name: "", nickname: "x", members: [] },
    });
  });

  test("Guest visits extend established schedules beyond day 30 while preserving history and empty rooms", async (h) => {
    const created = await api(h, "/guest/create", {
      method: "POST",
      status: 201,
      data: { name: "长期排班", nickname: "创建人", members: ["室友"] },
    });
    secrets.push(created.access_token);
    const recovery = await api(h, "/dorms/recovery", {token:created.access_token, method:"POST", data:{expected_version:0}});
    const history = h.db.sqlite
      .prepare("SELECT * FROM duty_tasks WHERE dorm_id=? ORDER BY duty_date")
      .all(created.dorm.id);
    equal(history.length, 30);
    const emptyOwner = await account(h, "empty_owner");
    const empty = await api(h, "/dorms", {
      token: emptyOwner.token,
      method: "POST",
      status: 201,
      data: { name: "未设置排班" },
    });
    testNow += 31 * 86_400_000;
    // Schedule extension is independent of credential lifetime: renew explicitly.
    const refreshed = await api(h, "/guest/recover", {method:"POST", data:{invite_code:created.invite_code, recovery_code:recovery.recovery_code}});
    created.access_token = refreshed.access_token;
    secrets.push(refreshed.access_token);
    const route = `/guest/tasks?invite_code=${created.invite_code}&member_id=${created.member_id}`;
    const viewed = await api(h, route, {token:created.access_token});
    equal(viewed.today, addDays(day, 31));
    ok(viewed.next_task && viewed.next_task.duty_date > viewed.today);
    equal(viewed.next_task.can_complete, false);
    equal(
      h.db.sqlite
        .prepare(
          "SELECT * FROM duty_tasks WHERE dorm_id=? AND duty_date<? ORDER BY duty_date",
        )
        .all(created.dorm.id, viewed.today),
      history,
    );
    const count = h.db.sqlite
      .prepare("SELECT COUNT(*) AS count FROM duty_tasks WHERE dorm_id=?")
      .get(created.dorm.id).count;
    await api(h, route, {token:created.access_token});
    equal(
      h.db.sqlite
        .prepare("SELECT COUNT(*) AS count FROM duty_tasks WHERE dorm_id=?")
        .get(created.dorm.id).count,
      count,
    );
    const renewed = await api(h, "/auth/login", {method:"POST", data:{username:"empty_owner", password}});
    const untouched = await api(
      h,
      `/guest/tasks?invite_code=${empty.invite_code}&member_id=${emptyOwner.id}`,
      {token:renewed.access_token},
    );
    equal(untouched.today_task, null);
    equal(untouched.next_task, null);
  });

  test("Notifications respect recipient ownership and mark-read is idempotent; push reports disabled", async (h) => {
    const { a, b } = await room(h);
    const task = await generateToday(h, a);
    await assign(h, a, task.id, { assignee_id: a.id });
    const notes = await api(h, "/notifications", { token: a.token });
    equal(
      notes.unread_count,
      notes.items.filter((item) => !item.read_at).length,
    );
    // If reminders are produced lazily, the fixed clock is 08:00 Shanghai and
    // the morning reminder must exist; otherwise the DB insertion uses the
    // same schema as production and tests ownership rather than scheduling.
    if (!notes.items.length)
      throw new Error(
        "08:00 Shanghai request did not produce the expected in-app morning reminder",
      );
    const id = notes.items[0].id;
    await api(h, `/notifications/${id}/read`, {
      token: b.token,
      method: "PATCH",
      status: 404,
    });
    await api(h, `/notifications/${id}/read`, {
      token: a.token,
      method: "PATCH",
    });
    await api(h, `/notifications/${id}/read`, {
      token: a.token,
      method: "PATCH",
    });
    const marked = await api(h, "/notifications", { token: a.token });
    equal(marked.unread_count, notes.unread_count - 1);
    const push = await api(h, "/push/public-key", { token: a.token });
    equal(push.available, false);
    await api(h, "/push/subscribe", {
      token: a.token,
      method: "POST",
      status: 503,
      data: {
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
      },
    });
  });

  test("In-app reminders dedupe, reflect edits and cancel deleted future duty links", async (h) => {
    const { a, b } = await room(h);
    const task = await generateToday(h, a);
    await assign(h, a, task.id, { assignee_id: a.id });
    const first = await api(h, "/notifications", { token: a.token });
    const repeated = await api(h, "/notifications", { token: a.token });
    equal(
      repeated.total,
      first.total,
      "lazy scans must not create duplicate reminders",
    );
    await assign(h, a, task.id, {
      task_text: "今天更改后的清洁内容",
      deadline_time: "20:10",
    });
    const edited = await api(h, "/notifications", { token: a.token });
    ok(
      edited.items.some(
        (note) =>
          note.body.includes("今天更改后的清洁内容") &&
          note.body.includes("20:10"),
      ),
      "pending reminder must follow edited task",
    );
    testNow = new OriginalDate("2026-10-12T13:00:00.000Z").getTime();
    const tomorrow = (await list(h, a)).items.find(
      (row) => row.duty_date === addDays(day, 1),
    );
    const target = tomorrow.assignee_id === a.id ? a : b;
    await api(h, "/notifications", { token: target.token });
    const existing = h.db.sqlite
      .prepare(
        "SELECT id FROM notifications WHERE task_id=? AND reminder_kind='previous'",
      )
      .get(tomorrow.id);
    ok(existing, "21:00 previous-day reminder must be generated");
    await configure(h, a, {
      schedule_rules: { skip_dates: [addDays(day, 1)] },
    });
    equal(
      h.db.sqlite
        .prepare("SELECT COUNT(*) AS count FROM duty_tasks WHERE id=?")
        .get(tomorrow.id).count,
      0,
    );
    const cancelled = h.db.sqlite
      .prepare("SELECT task_id,is_cancelled FROM notifications WHERE id=?")
      .get(existing.id);
    equal(
      cancelled.task_id,
      null,
      "historical reminder must detach before duty deletion",
    );
    equal(cancelled.is_cancelled, 1);
  });

  test("Shanghai day boundary, overdue and late completion use server time", async (h) => {
    const { a } = await room(h);
    const task = await generateToday(h, a);
    await assign(h, a, task.id, { assignee_id: a.id, deadline_time: "08:00" });
    testNow = new OriginalDate("2026-10-12T00:00:01.000Z").getTime();
    const late = await api(h, `/duties/${task.id}/complete`, {
      token: a.token,
      method: "PATCH",
    });
    equal(late.display_status, "completed_late");
    ok(late.is_late);
    testNow = new OriginalDate("2026-10-12T15:59:59.000Z").getTime();
    equal(
      (await api(h, "/duties/today", { token: a.token })).today,
      "2026-10-12",
    );
    testNow += 1000;
    equal(
      (await api(h, "/duties/today", { token: a.token })).today,
      "2026-10-13",
    );
  });

  try {
    for (const entry of tests) {
      if (
        process.env.TEST_MATCH &&
        !entry.name.toLowerCase().includes(process.env.TEST_MATCH.toLowerCase())
      )
        continue;
      testNow = new OriginalDate("2026-10-12T00:00:00.000Z").getTime();
      let h;
      const before = assertions;
      try {
        h = await createHarness();
        await entry.run(h);
        await h.flush();
        results.push({
          name: entry.name,
          status: "passed",
          assertions: assertions - before,
        });
      } catch (error) {
        results.push({
          name: entry.name,
          status: "failed",
          assertions: assertions - before,
          reason: redacted(error.message || error),
        });
      } finally {
        h?.close();
      }
    }
  } finally {
    globalThis.Date = OriginalDate;
  }
  const result = {
    date: new OriginalDate().toISOString(),
    runtime: process.version,
    storage: "in-memory SQLite with atomic D1 API shim",
    deployedD1: "not exercised by this script",
    assertions,
    passed: results.filter((entry) => entry.status === "passed").length,
    failed: results.filter((entry) => entry.status === "failed").length,
    tests: results,
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.failed) process.exitCode = 1;
  return result;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await runBackendChecks();
