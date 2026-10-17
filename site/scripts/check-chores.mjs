import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness, SQLiteD1 } from "./check-cloud-backend.mjs";

// Every scenario runs against its own disposable database. No local user data,
// credentials, or production database is opened by this script.
const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const OriginalDate = Date;
let now = new OriginalDate("2026-10-12T00:00:00.000Z").getTime();
let assertions = 0;
const secrets = [];
function equal(actual, expected, message) {
  assertions++;
  assert.deepEqual(actual, expected, message);
}
function ok(value, message) {
  assertions++;
  assert(value, message);
}
function safe(error) {
  let text = String(error?.message || error);
  for (const secret of secrets) text = text.split(secret).join("[redacted]");
  return text.split("\n")[0].slice(0, 650);
}
async function api(h, route, { status = 200, ...options } = {}) {
  const response = await h.request(route, options);
  equal(
    response.status,
    status,
    `${route}: HTTP ${response.status}, expected ${status}`,
  );
  ok(/no-store/i.test(response.headers.get("cache-control") || ""));
  ok(/json/i.test(response.headers.get("content-type") || ""));
  return response.json();
}
async function room(h, label = "三项值日验收") {
  const created = await api(h, "/guest/create", {
    method: "POST",
    status: 201,
    data: { name: label, nickname: "创建者", members: ["室友甲", "室友乙"] },
  });
  secrets.push(created.access_token);
  const initial = await api(
    h,
    `/chores/board?invite_code=${created.invite_code}&member_id=${created.member_id}`,
    { token: created.access_token },
  );
  await api(h, "/chores/settings", {
    method: "PATCH",
    token: created.access_token,
    data: {
      version: initial.version,
      categories: [
        { key: "floor", mode: "scheduled" },
        { key: "toilet", mode: "scheduled" },
        { key: "sink", enabled: false },
      ],
    },
  });
  return {
    ...created,
    token: created.access_token,
    ids: created.dorm.members.map((m) => m.user_id),
  };
}
async function claim(h, r, id, marker_id) {
  const result = await api(h, "/chores/claim", {
    method: "POST",
    status: 201,
    data: {
      invite_code: r.invite_code,
      member_id: id,
      nickname: h.db.sqlite
        .prepare("SELECT nickname FROM users WHERE id=?")
        .get(id).nickname,
      ...(marker_id ? { marker_id } : {}),
    },
  });
  secrets.push(result.access_token);
  equal(result.member.user_id, id);
  equal(result.is_creator, false);
  ok(/^[a-f0-9]{64}$/.test(result.access_token), "opaque device token");
  return { ...result.member, token: result.access_token };
}
function board(h, r, person, extra = {}) {
  const id = typeof person === "number" ? person : person.user_id;
  return api(
    h,
    `/chores/board?invite_code=${r.invite_code}&member_id=${id}&month=2026-10`,
    { token: person.token, ...extra },
  );
}
const complete = (h, person, task, options = {}) =>
  api(h, `/chores/tasks/${task.id}/complete`, {
    method: "PATCH",
    token: person.token,
    data: {},
    ...options,
  });
const marker = (h, person, marker_id, options = {}) =>
  api(h, "/chores/marker", {
    method: "PATCH",
    token: person.token,
    data: { marker_id },
    ...options,
  });

export async function runChoreChecks() {
  const scenarios = [];
  const test = (name, run) => scenarios.push({ name, run });
  test("old migration preserves business data and caps device expiry without rotating credentials", async () => {
    const db = new SQLiteD1();
    try {
      const migrationRoot = path.join(root, "site/drizzle");
      const files = (await fs.readdir(migrationRoot))
        .filter((n) => n.endsWith(".sql"))
        .sort();
      ok(files.length >= 2, "new additive migration required");
      db.sqlite.exec(
        await fs.readFile(path.join(migrationRoot, files[0]), "utf8"),
      );
      db.sqlite
        .prepare(
          "INSERT INTO users(username,password_hash,nickname,created_at) VALUES (?,?,?,?)",
        )
        .run("old_owner", "disabled$old", "旧创建者", "2026-10-01T00:00:00Z");
      db.sqlite
        .prepare(
          "INSERT INTO dormitories(name,invite_code,admin_user_id,rotation_order,rotation_start_date) VALUES (?,?,?,?,?)",
        )
        .run("旧宿舍", "OLDROOM1", 1, "[1]", "2026-10-01");
      db.sqlite.exec(
        "UPDATE users SET current_dorm_id=1; INSERT INTO dorm_members(dorm_id,user_id,role,sort_order,joined_at) VALUES (1,1,'admin',0,'2026-10-01T00:00:00Z'); INSERT INTO duty_tasks(dorm_id,duty_date,assignee_id,assignee_name_snapshot,task_text,deadline_at,status,completed_at) VALUES (1,'2026-10-02',1,'旧创建者','旧任务','2026-10-02T14:00:00Z','completed','2026-10-02T13:00:00Z'); INSERT INTO notifications(user_id,dorm_id,task_id,reminder_kind,scheduled_at,title,body,dedupe_key) VALUES (1,1,1,'old','2026-10-02T00:00:00Z','旧提醒','保留内容','old-notification'); INSERT INTO sessions(token_hash,user_id,created_at,expires_at,kind) VALUES ('old-hash',1,'2026-10-01T00:00:00Z','2027-10-01T00:00:00Z','device');",
      );
      const tables = [
        "users",
        "dormitories",
        "dorm_members",
        "duty_tasks",
        "notifications",
        "sessions",
      ];
      const before = Object.fromEntries(
        tables.map((table) => [
          table,
          db.sqlite.prepare(`SELECT * FROM ${table}`).all(),
        ]),
      );
      for (const name of files.slice(1, -1))
        db.sqlite.exec(
          await fs.readFile(path.join(migrationRoot, name), "utf8"),
        );
      db.sqlite.exec(`
        INSERT INTO chore_settings(dorm_id) VALUES (1);
        INSERT INTO chore_categories(dorm_id,key,name,content,deadline_time,start_date,rotation_order,mode)
          VALUES (1,'floor','地板','旧地板','22:00','2026-10-01','[1]','self_round'),(1,'water','抬水','旧抬水','20:00','2026-10-01','[1]','completion');
        INSERT INTO chore_tasks(id,dorm_id,key,task_key,name,content,duty_date,assignee_id,assignee_name_snapshot,marker_id_snapshot,deadline_at,status,completed_at,sequence)
          VALUES (1,1,'floor','round-1-1','地板','旧完成记录','2026-10-02',1,'旧创建者','pixel-01','','completed','2026-10-02T12:00:00Z',1);
        INSERT INTO chore_reminders(id,dorm_id,sender_id,sender_name_snapshot,target_member_id,task_id,task_name_snapshot,task_content_snapshot,created_at,mutation_key)
          VALUES (1,1,1,'旧创建者',1,1,'地板','旧提醒内容','2026-10-02T11:00:00Z','old-chore-reminder');
        INSERT INTO chore_reminder_preferences(id,dorm_id,user_id,enabled,times,version,updated_at)
          VALUES (1,1,1,1,'["08:00"]',1,'2026-10-02T00:00:00Z');
        INSERT INTO chore_scheduled_reminders(id,preference_id,preference_version,reminder_id,day,time,scheduled_at,task_ids)
          VALUES (1,1,1,1,'2026-10-02','08:00','2026-10-02T00:00:00Z','[1]');
        INSERT INTO chore_push_subscriptions(id,dorm_id,user_id,endpoint,p256dh,auth,updated_at)
          VALUES (1,1,1,'https://push.example/old','old-p256dh','old-auth','2026-10-02T00:00:00Z');
        INSERT INTO chore_push_jobs(id,dorm_id,user_id,subscription_id,subscription_revision,reminder_id,next_attempt_at)
          VALUES (1,1,1,1,1,1,'2026-10-02T00:00:00Z');
      `);
      const choreTables = [
        "chore_categories",
        "chore_tasks",
        "chore_reminders",
        "chore_scheduled_reminders",
        "chore_push_jobs",
      ];
      const choreBefore = Object.fromEntries(
        choreTables.map((table) => [
          table,
          db.sqlite.prepare(`SELECT * FROM ${table}`).all(),
        ]),
      );
      db.sqlite.exec("BEGIN IMMEDIATE");
      db.sqlite.exec(
        await fs.readFile(path.join(migrationRoot, files.at(-1)), "utf8"),
      );
      db.sqlite.exec("COMMIT");
      for (const table of choreTables)
        equal(
          db.sqlite
            .prepare(
              `SELECT ${Object.keys(choreBefore[table][0] || {}).join(",") || "*"} FROM ${table}`,
            )
            .all(),
          choreBefore[table],
          `migration preserves ${table} rows and ids`,
        );
      db.sqlite.exec(`
        INSERT INTO chore_categories(dorm_id,key,name,content,deadline_time,start_date,rotation_order,mode)
          VALUES (1,'sink','洗手池','清洁洗手池','22:00','2026-10-02','[1]','self_round');
        INSERT INTO chore_tasks(dorm_id,key,task_key,name,content,duty_date,assignee_id,assignee_name_snapshot,marker_id_snapshot,deadline_at,status,sequence)
          VALUES (1,'sink','round-1-1','洗手池','清洁洗手池','2026-10-02',1,'旧创建者','pixel-01','','pending',1);
      `);
      for (const row of before.sessions)
        row.expires_at = new Date(
          Date.parse(row.created_at) + 90 * 86400000,
        ).toISOString();
      for (const table of tables) {
        const oldFields = Object.keys(before[table][0]);
        equal(
          db.sqlite
            .prepare(`SELECT ${oldFields.join(",")} FROM ${table}`)
            .all(),
          before[table],
          `legacy ${table} remains identical`,
        );
      }
      equal(db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
      equal(
        db.sqlite.prepare("PRAGMA integrity_check").get().integrity_check,
        "ok",
      );
    } finally {
      db.close();
    }
  });
  test("member claims stay scoped even when claiming creator, markers stay unique", async (h) => {
    const r = await room(h);
    const people = [];
    for (const [i, id] of r.ids.entries())
      people.push(await claim(h, r, id, `pixel-0${i + 1}`));
    for (const p of people) {
      await api(h, "/auth/me", { token: p.token, status: 401 });
      await api(h, "/dorms/current", { token: p.token, status: 401 });
      await api(h, "/duties", { token: p.token, status: 401 });
      const view = await board(h, r, p);
      equal(view.is_creator, false);
      await api(h, "/chores/settings", {
        method: "PATCH",
        token: p.token,
        data: { version: view.version, categories: [] },
        status: 403,
      });
    }
    equal(
      h.db.sqlite.prepare("SELECT count(*) AS n FROM sessions").get().n,
      1,
      "claim must not mint a legacy administrator session",
    );
    const targetView = await board(h, r, {
      ...people[1],
      user_id: people[2].user_id,
    });
    equal(targetView.is_creator, false);
    equal(targetView.reminders, []);
    ok(
      [
        ...targetView.today_tasks,
        ...targetView.next_tasks,
        ...(targetView.water_task ? [targetView.water_task] : []),
      ].every((t) => !t.can_complete),
      "another member board grants viewing only",
    );
    await marker(h, people[1], "pixel-01", { status: 409 });
    await marker(h, people[1], "pixel-99");
    const unchanged = await board(h, r, people[2]);
    equal(unchanged.member.marker_id, "pixel-03");
    const noToken = await board(h, r, r.ids[0]);
    equal(noToken.is_creator, false);
    equal(noToken.reminders, []);
    ok(
      [
        ...noToken.today_tasks,
        ...noToken.next_tasks,
        ...(noToken.water_task ? [noToken.water_task] : []),
      ].every((t) => !t.can_complete),
    );
    await board(h, r, { ...people[0], token: "f".repeat(64) }, { status: 401 });
    const otherRoom = await room(h, "其他宿舍");
    await board(
      h,
      otherRoom,
      { ...people[0], user_id: otherRoom.ids[0] },
      { status: 403 },
    );
    const creatorViewingOther = await board(h, r, {
      user_id: people[1].user_id,
      token: r.token,
    });
    equal(creatorViewingOther.is_creator, false);
    equal(creatorViewingOther.reminders, []);
    ok(
      [
        ...creatorViewingOther.today_tasks,
        ...creatorViewingOther.next_tasks,
        ...(creatorViewingOther.water_task
          ? [creatorViewingOther.water_task]
          : []),
      ].every((t) => !t.can_complete),
      "creator viewing a different name cannot complete as that name",
    );
  });
  test("floor and toilet complete only by assignee, with server timestamp and duplicate protection", async (h) => {
    const r = await room(h);
    const people = await Promise.all(r.ids.map((id) => claim(h, r, id)));
    let successes = 0;
    for (const person of people) {
      const view = await board(h, r, person);
      for (const task of view.today_tasks) {
        equal(task.assignee_id, person.user_id);
        ok(task.can_complete);
        const stranger = people.find((p) => p.user_id !== person.user_id);
        await complete(h, stranger, task, { status: 403 });
        const result = await complete(h, person, task, {
          data: { completed_at: "1999-01-01T00:00:00Z" },
        });
        equal(result.task.status, "completed");
        equal(result.task.completed_at, new Date().toISOString());
        await complete(h, person, task, { status: 409 });
        successes++;
      }
      for (const task of view.next_tasks)
        await complete(h, person, task, { status: 422 });
    }
    equal(successes, 2, "one floor and one toilet task exists today");
    const view = await board(h, r, people[0]);
    equal(
      view.calendar.filter((t) => ["floor", "toilet"].includes(t.key)).length,
      2,
    );
    const second = await room(h, "跨宿舍打卡");
    const other = await claim(h, second, second.ids[0]);
    const task = (await board(h, second, other)).today_tasks[0];
    await complete(h, people[0], task, { status: 403 });
  });
  test("water cycles in order, concurrency advances once, and multiple same-day records remain", async (h) => {
    const r = await room(h);
    const people = await Promise.all(r.ids.map((id) => claim(h, r, id)));
    let view = await board(h, r, people[0]);
    equal(view.water_order, r.ids);
    const task = view.water_task;
    equal(task.assignee_id, r.ids[0]);
    const statuses = await Promise.all([
      h.request(`/chores/tasks/${task.id}/complete`, {
        method: "PATCH",
        token: people[0].token,
        data: {},
      }),
      h.request(`/chores/tasks/${task.id}/complete`, {
        method: "PATCH",
        token: people[0].token,
        data: {},
      }),
    ]);
    equal(statuses.map((r) => r.status).sort(), [200, 409]);
    view = await board(h, r, people[0]);
    equal(view.water_task.assignee_id, r.ids[1]);
    equal(view.water_task.sequence, task.sequence + 1);
    equal(view.calendar.filter((t) => t.key === "water").length, 1);
    await complete(h, people[0], view.water_task, { status: 403 });
    for (let i = 1; i < r.ids.length * 2; i++) {
      const person = people[i % people.length];
      view = await board(h, r, person);
      equal(view.water_task.assignee_id, person.user_id);
      equal(view.water_task.sequence, task.sequence + i);
      const result = await complete(h, person, view.water_task);
      equal(result.task.completed_at, new Date().toISOString());
      equal(result.next_water.assignee_id, r.ids[(i + 1) % r.ids.length]);
    }
    view = await board(h, r, people[0]);
    const records = view.calendar.filter((t) => t.key === "water");
    equal(records.length, 6);
    equal(new Set(records.map((t) => t.id)).size, 6);
    ok(records.every((t) => t.completed_date === "2026-10-12"));
    equal(view.water_task.assignee_id, r.ids[0]);
  });
  test("creator customizes each category with CAS and preserves completed content and marker snapshots", async (h) => {
    const r = await room(h);
    const creator = { user_id: r.member_id, token: r.token };
    await marker(h, creator, "pixel-10");
    const initial = await board(h, r, creator);
    equal(initial.is_creator, true);
    const floor = initial.today_tasks.find((t) => t.key === "floor");
    const completed = await complete(h, creator, floor);
    const oldRecord = (await board(h, r, creator)).calendar.find(
      (t) => t.id === floor.id,
    );
    const current = await board(h, r, creator);
    const changes = current.categories.map((category, i) => ({
      ...category,
      content: [
        "地板：清扫并拖地",
        "厕所：刷洗便池与地漏",
        "洗手池：清洁池面与龙头",
        "抬水：从一楼抬水",
      ][i],
      deadline_time: ["20:15", "21:20", "21:40", "18:35"][i],
      weekdays: [1, 3, 5],
      rotation_days: 2,
      rotation_order: [...r.ids].reverse(),
    }));
    const requests = await Promise.all([
      h.request("/chores/settings", {
        method: "PATCH",
        token: r.token,
        data: { version: current.version, categories: changes },
      }),
      h.request("/chores/settings", {
        method: "PATCH",
        token: r.token,
        data: { version: current.version, categories: changes },
      }),
    ]);
    equal(requests.map((r) => r.status).sort(), [200, 409]);
    const next = await board(h, r, creator);
    for (const expected of changes) {
      const actual = next.categories.find((c) => c.key === expected.key);
      equal(actual.content, expected.content);
      equal(actual.deadline_time, expected.deadline_time);
      equal(actual.rotation_order, expected.rotation_order);
      equal(actual.weekdays, expected.weekdays);
      equal(actual.rotation_days, 2);
    }
    equal(
      next.water_task.assignee_id,
      changes.find((c) => c.key === "water").rotation_order[0],
      "water order immediately recalculates the pending assignee",
    );
    equal(
      next.water_task.content,
      changes.find((c) => c.key === "water").content,
    );
    equal(
      next.calendar.find((t) => t.id === floor.id),
      oldRecord,
    );
    equal(completed.task.content, floor.content);
    await marker(h, creator, "pixel-11");
    equal(
      (await board(h, r, creator)).calendar.find((t) => t.id === floor.id)
        .marker_id,
      "pixel-10",
    );
    await api(h, "/auth/me", {
      method: "PATCH",
      token: r.token,
      data: { nickname: "更名后的创建者" },
    });
    const renamed = await board(h, r, creator);
    equal(renamed.member.nickname, "更名后的创建者");
    equal(
      renamed.calendar.find((t) => t.id === floor.id).assignee_name,
      oldRecord.assignee_name,
    );
    equal(
      renamed.today_tasks.find((t) => t.id === floor.id).content,
      floor.content,
    );
    await api(h, "/chores/settings", {
      method: "PATCH",
      token: r.token,
      data: {
        version: (await board(h, r, creator)).version,
        categories: [{ key: "floor", deadline_time: "25:90" }],
      },
      status: 422,
    });
  });
  test("saved non-adjacent water order survives reload and controls the next turn", async (h) => {
    const r = await room(h);
    const owner = { user_id: r.member_id, token: r.token };
    const initial = await board(h, r, owner);
    const order = [r.ids[2], r.ids[0], r.ids[1]];
    await api(h, "/chores/settings", {
      method: "PATCH",
      token: r.token,
      data: {
        version: initial.version,
        categories: [{ key: "water", rotation_order: order }],
      },
    });
    const reloaded = await board(h, r, owner);
    equal(
      reloaded.categories.find((c) => c.key === "water").rotation_order,
      order,
    );
    equal(reloaded.water_task.assignee_id, order[0]);
    const actor =
      reloaded.water_task.assignee_id === owner.user_id
        ? owner
        : await claim(h, r, reloaded.water_task.assignee_id);
    await complete(h, actor, reloaded.water_task);
    const next = await board(h, r, owner);
    equal(
      next.water_task.assignee_id,
      order[(order.indexOf(actor.user_id) + 1) % order.length],
    );
    equal(
      next.calendar.find((t) => t.id === initial.water_task.id).assignee_id,
      actor.user_id,
    );
    equal(next.categories.find((c) => c.key === "water").rotation_order, order);
  });
  test("calendar uses Shanghai completion day, including late completion and month boundary", async (h) => {
    now = new OriginalDate("2026-10-31T15:50:00Z").getTime();
    const r = await room(h);
    const owner = { user_id: r.member_id, token: r.token };
    await marker(h, owner, "pixel-20");
    const oct = await api(
      h,
      `/chores/board?invite_code=${r.invite_code}&member_id=${r.member_id}&month=2026-10`,
      { token: r.token },
    );
    const task = oct.today_tasks.find((t) => t.key === "floor");
    equal(task.duty_date, "2026-10-31");
    now = new OriginalDate("2026-10-31T16:10:00Z").getTime();
    const result = await complete(h, owner, task);
    equal(result.task.completed_at, "2026-10-31T16:10:00.000Z");
    const before = await api(
      h,
      `/chores/board?invite_code=${r.invite_code}&member_id=${r.member_id}&month=2026-10`,
      { token: r.token },
    );
    equal(before.calendar.filter((t) => t.id === task.id).length, 0);
    const november = await api(
      h,
      `/chores/board?invite_code=${r.invite_code}&member_id=${r.member_id}&month=2026-11`,
      { token: r.token },
    );
    equal(november.today, "2026-11-01");
    equal(
      november.calendar.find((t) => t.id === task.id).completed_date,
      "2026-11-01",
    );
    equal(
      november.calendar.find((t) => t.id === task.id).marker_id,
      "pixel-20",
    );
  });
  test("member reminders enforce task target, cooldown, receipt privacy, and read ownership", async (h) => {
    const r = await room(h);
    const people = await Promise.all(r.ids.map((id) => claim(h, r, id)));
    const task = (await board(h, r, people[0])).water_task;
    const send = (person, target, t = task, options = {}) =>
      api(h, "/chores/remind", {
        method: "POST",
        token: person.token,
        data: { target_member_id: target, task_id: t.id },
        status: 201,
        ...options,
      });
    await send(people[1], people[2].user_id, task, { status: 422 });
    const reminder = await send(people[1], people[0].user_id);
    equal(reminder.sender_id, people[1].user_id);
    equal(reminder.target_member_id, people[0].user_id);
    equal(reminder.task_id, task.id);
    equal(reminder.read_at, null);
    await send(people[1], people[0].user_id, task, { status: 429 });
    const simultaneous = await Promise.all([
      h.request("/chores/remind", {
        method: "POST",
        token: people[2].token,
        data: { target_member_id: people[0].user_id, task_id: task.id },
      }),
      h.request("/chores/remind", {
        method: "POST",
        token: people[2].token,
        data: { target_member_id: people[0].user_id, task_id: task.id },
      }),
    ]);
    equal(
      simultaneous.map((response) => response.status).sort(),
      [201, 429],
      "concurrent double tap delivers one reminder",
    );
    const target = await board(h, r, people[0]);
    ok(target.reminders.some((n) => n.id === reminder.id && !n.read_at));
    ok(
      !(await board(h, r, people[2])).reminders.some(
        (n) => n.id === reminder.id,
      ),
    );
    await api(h, `/chores/reminders/${reminder.id}/read`, {
      method: "PATCH",
      token: people[2].token,
      data: {},
      status: 403,
    });
    const read = await api(h, `/chores/reminders/${reminder.id}/read`, {
      method: "PATCH",
      token: people[0].token,
      data: {},
    });
    equal(read.ok, true);
    equal(read.read_at, new Date().toISOString());
    now += 61000;
    await send(people[1], people[0].user_id);
    await complete(h, people[0], task);
    await send(people[2], people[0].user_id, task, { status: 409 });
    const other = await room(h, "提醒跨宿舍");
    const stranger = await claim(h, other, other.ids[0]);
    await send(stranger, people[0].user_id, task, { status: 403 });
    await api(h, "/chores/remind", {
      method: "POST",
      data: { target_member_id: people[0].user_id, task_id: task.id },
      status: 401,
    });
  });
  test("visitor demo and legacy guest views remain read-only", async (h) => {
    const { ensureLocalDemo } = await import("../local/database.mjs");
    const code = ensureLocalDemo(h.db);
    h.env.DEFAULT_DORM_INVITE_CODE = code;
    const legacy = await api(h, "/guest/dorm");
    const memberId = legacy.members[0].user_id;
    const view = await api(
      h,
      `/chores/board?member_id=${memberId}&month=2026-10`,
    );
    equal(view.is_creator, false);
    ok(
      [
        ...view.today_tasks,
        ...view.next_tasks,
        ...(view.water_task ? [view.water_task] : []),
      ].every((t) => !t.can_complete),
    );
    await api(h, "/chores/claim", {
      method: "POST",
      data: { invite_code: code, member_id: memberId },
      status: 403,
    });
    await api(h, `/guest/tasks?member_id=${memberId}`);
    await api(h, `/chores/tasks/${view.water_task.id}/complete`, {
      method: "PATCH",
      data: {},
      status: 401,
    });
  });
  test("ISO weekday boundaries and paused categories change future plans only", async (h) => {
    const r = await room(h),
      creator = { user_id: r.member_id, token: r.token };
    const initial = await board(h, r, creator);
    const today = initial.today_tasks.find((t) => t.key === "floor");
    await api(h, "/chores/settings", {
      method: "PATCH",
      token: r.token,
      data: {
        version: initial.version,
        categories: [{ key: "floor", weekdays: [7], rotation_days: 2 }],
      },
    });
    const sundays = h.db.sqlite
      .prepare(
        "SELECT duty_date,assignee_id FROM chore_tasks WHERE dorm_id=? AND key='floor' AND duty_date>'2026-10-12' AND status='pending' ORDER BY duty_date",
      )
      .all(r.dorm.id);
    equal(
      sundays.map((t) => t.duty_date),
      ["2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08"],
    );
    equal(
      sundays.map((t) => t.assignee_id),
      [r.ids[0], r.ids[0], r.ids[1], r.ids[1]],
    );
    const view = await board(h, r, creator);
    equal(view.today_tasks.find((t) => t.key === "floor").id, today.id);
    await api(h, "/chores/settings", {
      method: "PATCH",
      token: r.token,
      data: {
        version: view.version,
        categories: [
          { key: "floor", weekdays: [1], rotation_days: 1 },
          { key: "toilet", enabled: false },
        ],
      },
    });
    const mondays = h.db.sqlite
      .prepare(
        "SELECT duty_date FROM chore_tasks WHERE dorm_id=? AND key='floor' AND duty_date>'2026-10-12' AND status='pending' ORDER BY duty_date",
      )
      .all(r.dorm.id);
    equal(
      mondays.map((t) => t.duty_date),
      ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"],
    );
    equal(
      h.db.sqlite
        .prepare(
          "SELECT count(*) AS n FROM chore_tasks WHERE dorm_id=? AND key='toilet' AND duty_date>'2026-10-12' AND status='pending'",
        )
        .get(r.dorm.id).n,
      0,
    );
    const member = await claim(h, r, r.ids[1]);
    const toilet = (await board(h, r, member)).today_tasks.find(
      (t) => t.key === "toilet",
    );
    if (toilet) {
      equal(toilet.can_complete, false);
      await complete(h, member, toilet, { status: 409 });
    }
    const paused = await board(h, r, creator);
    await api(h, "/chores/settings", {
      method: "PATCH",
      token: r.token,
      data: {
        version: paused.version,
        categories: [{ key: "toilet", enabled: true }],
      },
    });
    ok(
      h.db.sqlite
        .prepare(
          "SELECT count(*) AS n FROM chore_tasks WHERE dorm_id=? AND key='toilet' AND duty_date>'2026-10-12' AND status='pending'",
        )
        .get(r.dorm.id).n > 0,
    );
  });
  test("leaving and joining synchronizes future rotation, live marks and pending water without rewriting history", async (h) => {
    const r = await room(h),
      owner = { user_id: r.member_id, token: r.token };
    const departing = await claim(h, r, r.ids[1], "pixel-02");
    const personal = (await board(h, r, departing)).today_tasks.find(
      (t) => t.key === "toilet",
    );
    await complete(h, departing, personal);
    await complete(h, owner, (await board(h, r, owner)).water_task);
    const before = await board(h, r, owner);
    equal(before.water_task.assignee_id, departing.user_id);
    const legacy = await api(h, "/dorms/current", { token: r.token });
    await api(
      h,
      `/dorms/current/members/${departing.user_id}?expected_version=${legacy.schedule_version}`,
      { method: "DELETE", token: r.token },
    );
    const after = await board(h, r, owner);
    equal(after.calendar, before.calendar);
    ok(
      after.categories.every(
        (c) => !c.rotation_order.includes(departing.user_id),
      ),
    );
    equal(after.water_task.assignee_id, r.ids[0]);
    await board(h, r, departing, { status: 401 });
    equal(
      h.db.sqlite
        .prepare(
          "SELECT count(*) AS n FROM member_marks WHERE dorm_id=? AND user_id=?",
        )
        .get(r.dorm.id, departing.user_id).n,
      0,
    );
    equal(
      h.db.sqlite
        .prepare(
          "SELECT count(*) AS n FROM chore_tasks WHERE dorm_id=? AND assignee_id=? AND duty_date>'2026-10-12' AND status='pending'",
        )
        .get(r.dorm.id, departing.user_id).n,
      0,
    );
    const password = "TemporaryJoinPassword!";
    secrets.push(password);
    await api(h, "/auth/register", {
      method: "POST",
      status: 201,
      data: { username: "new_roommate", nickname: "新室友", password },
    });
    const login = await api(h, "/auth/login", {
      method: "POST",
      data: { username: "new_roommate", password },
    });
    secrets.push(login.access_token);
    const added = await api(h, "/auth/me", { token: login.access_token });
    await api(h, "/dorms/join", {
      method: "POST",
      token: login.access_token,
      data: { invite_code: r.invite_code },
    });
    const joined = await board(h, r, owner);
    ok(joined.categories.every((c) => c.rotation_order.at(-1) === added.id));
    const newMember = joined.members.find((m) => m.user_id === added.id);
    equal(
      newMember.marker_id,
      "pixel-02",
      "departed member releases live mark",
    );
    equal(joined.calendar, before.calendar);
    equal(
      joined.calendar.find((t) => t.id === personal.id).marker_id,
      "pixel-02",
      "history retains departed member mark",
    );
  });
  test("one hundred active members get unique marks and statements stay within D1 binding limit", async (h) => {
    const r = await room(h, "百人容量验收");
    const ids = [...r.ids];
    for (let i = 3; i < 100; i++) {
      const id = Number(
        h.db.sqlite
          .prepare(
            "INSERT INTO users(username,password_hash,nickname,current_dorm_id,created_at) VALUES (?,?,?,?,?)",
          )
          .run(
            `capacity_${i}`,
            "disabled$fixture",
            `成员${i + 1}`,
            r.dorm.id,
            new Date().toISOString(),
          ).lastInsertRowid,
      );
      h.db.sqlite
        .prepare(
          "INSERT INTO dorm_members(dorm_id,user_id,role,sort_order,joined_at) VALUES (?,?,'member',?,?)",
        )
        .run(r.dorm.id, id, i, new Date().toISOString());
      ids.push(id);
    }
    h.db.sqlite
      .prepare("UPDATE dormitories SET rotation_order=? WHERE id=?")
      .run(JSON.stringify(ids), r.dorm.id);
    const prepare = h.db.prepare.bind(h.db);
    let maxBindings = 0;
    h.db.prepare = (sql) => {
      const statement = prepare(sql),
        bind = statement.bind.bind(statement);
      statement.bind = (...values) => {
        assert(
          values.length <= 100,
          `statement exceeds D1 100 binding limit: ${values.length}`,
        );
        maxBindings = Math.max(maxBindings, values.length);
        return bind(...values);
      };
      return statement;
    };
    const view = await board(h, r, { user_id: r.member_id, token: r.token });
    equal(view.members.length, 100);
    equal(new Set(view.members.map((m) => m.marker_id)).size, 100);
    equal(
      view.categories.map((c) => c.rotation_order.length),
      [100, 100, 100, 100],
    );
    const person = await claim(h, r, ids.at(-1), "pixel-100");
    equal(person.marker_id, "pixel-100");
    equal(
      h.db.sqlite
        .prepare("SELECT count(*) AS n FROM member_sessions WHERE token_hash=?")
        .get(person.token).n,
      0,
      "plain bearer token is not stored in database",
    );
    ok(
      maxBindings <= 100 && maxBindings > 80,
      "large schedule batches exercised with bounded bindings",
    );
  });
  test("water future start, pause and resume preserve the current turn and authoritative clock", async (h) => {
    const r = await room(h),
      creator = { user_id: r.member_id, token: r.token };
    const member = await claim(h, r, r.ids[1]);
    const initial = await board(h, r, creator);
    const original = initial.water_task;
    const configureWater = async (changes) => {
      const current = await board(h, r, creator);
      await api(h, "/chores/settings", {
        method: "PATCH",
        token: r.token,
        data: {
          version: current.version,
          categories: [{ key: "water", ...changes }],
        },
      });
      return board(h, r, creator);
    };
    const future = await configureWater({
      start_date: "2026-10-15",
      deadline_time: "18:45",
    });
    equal(future.water_task.id, original.id);
    equal(future.water_task.assignee_id, original.assignee_id);
    equal(future.water_task.sequence, original.sequence);
    equal(future.water_task.duty_date, "2026-10-15");
    equal(future.water_task.deadline_at, "", "water has no daily deadline");
    equal(future.water_task.can_complete, false);
    await complete(h, creator, future.water_task, { status: 422 });
    const active = await configureWater({ start_date: "2026-10-12" });
    equal(active.water_task.duty_date, "2026-10-12");
    equal(active.water_task.can_complete, true);
    const paused = await configureWater({ enabled: false });
    equal(paused.water_task.id, original.id);
    equal(paused.water_task.can_complete, false);
    await complete(h, creator, paused.water_task, { status: 409 });
    await api(h, "/chores/remind", {
      method: "POST",
      token: member.token,
      data: { target_member_id: creator.user_id, task_id: original.id },
      status: 409,
    });
    const resumed = await configureWater({ enabled: true });
    equal(resumed.water_task.id, original.id);
    equal(resumed.water_task.can_complete, true);
    const result = await complete(h, creator, resumed.water_task, {
      data: { completed_at: "1999-01-01T00:00:00Z" },
    });
    equal(result.task.completed_at, new Date().toISOString());
    equal(result.next_water.assignee_id, r.ids[1]);
    equal(result.next_water.sequence, original.sequence + 1);
  });

  const tests = [];
  globalThis.Date = class TestDate extends OriginalDate {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  };
  try {
    for (const scenario of scenarios) {
      if (
        process.env.TEST_MATCH &&
        !scenario.name
          .toLowerCase()
          .includes(process.env.TEST_MATCH.toLowerCase())
      )
        continue;
      now = new OriginalDate("2026-10-12T00:00:00.000Z").getTime();
      const before = assertions;
      let h;
      try {
        h = await createHarness();
        await scenario.run(h);
        await h.flush();
        tests.push({
          name: scenario.name,
          status: "passed",
          assertions: assertions - before,
        });
      } catch (error) {
        tests.push({
          name: scenario.name,
          status: "failed",
          assertions: assertions - before,
          reason: safe(error),
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
    storage: "isolated in-memory SQLite / D1 API shim",
    cloudD1: "not exercised",
    assertions,
    passed: tests.filter((t) => t.status === "passed").length,
    failed: tests.filter((t) => t.status === "failed").length,
    tests,
  };
  console.log(JSON.stringify(result, null, 2));
  if (process.env.CHORE_EVIDENCE === "1") {
    await fs.mkdir(path.join(root, "docs/evidence/chores"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(root, "docs/evidence/chores/backend.json"),
      JSON.stringify(result, null, 2) + "\n",
    );
  }
  if (result.failed) process.exitCode = 1;
  return result;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await runChoreChecks();
