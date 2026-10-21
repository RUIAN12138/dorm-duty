import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
const h = await createHarness();
let n = 0;
async function api(
  path,
  token,
  data,
  status = 200,
  method = data ? "POST" : "GET",
) {
  const r = await h.request(path, { token, data, method });
  const body = await r.json();
  assert.equal(r.status, status, `${path}: ${JSON.stringify(body)}`);
  n++;
  return body;
}
try {
  const r = await api(
    "/guest/create",
    null,
    { name: "抬水灵活队列测试", nickname: "甲", members: ["乙", "丙"] },
    201,
  );
  const people = [];
  for (const m of r.dorm.members) {
    const c = await api(
      "/chores/claim",
      null,
      { invite_code: r.invite_code, nickname: m.nickname },
      201,
    );
    people.push({ ...m, token: c.access_token });
  }
  const [a, b, c] = people;
  const board = (p = a) =>
    api(
      `/chores/board?invite_code=${r.invite_code}&member_id=${p.user_id}`,
      p.token,
    );
  const complete = (b, p) =>
    api(`/chores/tasks/${b.water_task.id}/complete`, p.token, {}, 200, "PATCH");
  let state = await board();
  assert.equal(state.water_task.assignee_id, a.user_id);
  n++;
  // A skips once, to the back, with no calendar completion.
  await api(
    "/chores/water/skip",
    b.token,
    { version: state.version, task_id: state.water_task.id },
    403,
  );
  await api(
    "/chores/water/skip",
    a.token,
    { version: state.version, task_id: state.water_task.id, reason: "上课" },
    200,
  );
  state = await board();
  assert.equal(state.water_task.assignee_id, b.user_id);
  n++;
  assert.equal(state.calendar.length, 0);
  n++;
  assert.equal(
    h.db.sqlite.prepare("SELECT reason FROM chore_water_skips").get().reason,
    "上课",
  );
  n++;
  // C advances while B is pending. Only one actual completion is recorded.
  const early = await api("/chores/water/advance", c.token, {
    version: state.version,
    task_id: state.water_task.id,
  });
  assert.equal(early.task.assignee_id, c.user_id);
  n++;
  state = await board(c);
  assert.equal(state.water_advance_task_id, early.task.id);
  n++;
  await api(
    "/chores/water/advance",
    c.token,
    { version: state.version, task_id: state.water_task.id },
    409,
  );
  // B finishes: C's future slot is consumed, then A is still required this cycle.
  const finished = await complete(state, b);
  state = await board();
  assert.equal(state.water_task.assignee_id, a.user_id);
  n++;
  assert.deepEqual(
    state.water_handoff.steps.map((s) => s.member_id),
    [c.user_id],
  );
  n++;
  assert.deepEqual(finished.water_handoff, state.water_handoff);
  n++;
  assert.equal(state.calendar.filter((r) => r.key === "water").length, 2);
  n++;
  // Repeated GET is read-only; it cannot consume the advance again.
  const version = state.version;
  state = await board();
  assert.equal(state.version, version);
  n++;
  await api(`/chores/tasks/${early.task.id}/undo`, c.token, {}, 409, "PATCH");
  // Undo B restores the skipped queue and C's outstanding credit, without erasing its real history.
  await api(
    `/chores/tasks/${finished.task.id}/undo`,
    b.token,
    {},
    200,
    "PATCH",
  );
  state = await board();
  assert.equal(state.water_task.assignee_id, b.user_id);
  n++;
  assert.equal(
    h.db.sqlite
      .prepare("SELECT status FROM chore_water_credits WHERE task_id=?")
      .get(early.task.id).status,
    "pending",
  );
  n++;
  assert.equal(state.calendar.length, 1);
  n++;
  await complete(state, b);
  state = await board();
  await complete(state, a);
  state = await board();
  assert.equal(state.water_task.assignee_id, b.user_id);
  n++;
  // C now may prepay the next cycle, and undo an unused credit without moving pending member.
  const again = await api("/chores/water/advance", c.token, {
    version: state.version,
    task_id: state.water_task.id,
  });
  const pending = state.water_task.id;
  await api(`/chores/tasks/${again.task.id}/undo`, c.token, {}, 200, "PATCH");
  state = await board();
  assert.equal(state.water_task.id, pending);
  n++;
  // Concurrent requests with one version admit one advance only.
  const responses = await Promise.all(
    [1, 2].map(() =>
      h.request("/chores/water/advance", {
        token: c.token,
        method: "POST",
        data: { version: state.version, task_id: pending },
      }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  n++;
  assert.equal(
    h.db.sqlite
      .prepare(
        "SELECT COUNT(*) n FROM chore_water_credits WHERE status='pending'",
      )
      .get().n,
    1,
  );
  n++;
  // Deliberate order changes still use last regular completer, without changing history.
  state = await board();
  const before = state.calendar.length;
  await api(
    "/chores/order",
    a.token,
    {
      version: state.version,
      key: "water",
      rotation_order: [a.user_id, c.user_id, b.user_id],
    },
    200,
    "PATCH",
  );
  state = await board();
  assert.equal(state.water_task.assignee_id, b.user_id);
  n++;
  assert.deepEqual(
    state.water_handoff.steps.map((s) => s.member_id),
    [c.user_id],
  );
  n++;
  assert.equal(state.calendar.length, before);
  n++;
  assert.deepEqual(h.db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  n++;
  const old = new Date(Date.now() - 5 * 86400000 - 3600000).toISOString();
  h.db.sqlite
    .prepare(
      "UPDATE chore_tasks SET completed_at=? WHERE key='water' AND status='completed'",
    )
    .run(old);
  state = await board();
  assert(
    state.overdue_categories.some((c) => c.key === "water" && c.days === 5),
  );
  n++;
  await complete(state, b);
  state = await board();
  assert(!state.overdue_categories.some((c) => c.key === "water"));
  n++;
  // Two different skips cannot bring a completed person back ahead of debt.
  const r2 = await api(
    "/guest/create",
    null,
    { name: "连续跳过验收", nickname: "壹", members: ["贰", "叁"] },
    201,
  );
  const roster = [];
  for (const m of r2.dorm.members) {
    const claim = await api(
      "/chores/claim",
      null,
      { invite_code: r2.invite_code, nickname: m.nickname },
      201,
    );
    roster.push({ ...m, token: claim.access_token });
  }
  const [one, two, three] = roster;
  const b2 = () =>
    api(
      `/chores/board?invite_code=${r2.invite_code}&member_id=${one.user_id}`,
      one.token,
    );
  let round = await b2();
  await api("/chores/water/skip", one.token, {
    version: round.version,
    task_id: round.water_task.id,
  });
  round = await b2();
  await complete(round, two);
  round = await b2();
  await api("/chores/water/skip", three.token, {
    version: round.version,
    task_id: round.water_task.id,
  });
  round = await b2();
  assert.equal(round.water_task.assignee_id, one.user_id);
  n++;
  await complete(round, one);
  round = await b2();
  assert.equal(
    round.water_task.assignee_id,
    three.user_id,
    "completed member two waits until the skipped debt is finished",
  );
  n++;
  await api(
    "/chores/water/skip",
    three.token,
    { version: round.version, task_id: round.water_task.id },
    409,
  );
  await complete(round, three);
  round = await b2();
  assert.equal(
    round.water_task.assignee_id,
    one.user_id,
    "new cycle follows configured order after last actual completer",
  );
  n++;
  assert.equal(round.calendar.filter((r) => r.key === "water").length, 3);
  n++;
  console.log(JSON.stringify({ ok: true, assertions: n }));
} finally {
  h.close();
}
