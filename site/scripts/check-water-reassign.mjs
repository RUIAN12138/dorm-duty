import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
const h = await createHarness();
let checks = 0;
const eq = (a, b, label) => {
  checks++;
  assert.deepEqual(a, b, label);
};
async function api(
  path,
  token,
  data,
  status = 200,
  method = data ? "POST" : "GET",
) {
  const r = await h.request(path, { token, method, data });
  eq(r.status, status, path);
  return r.json();
}
try {
  const r = await api(
    "/guest/create",
    null,
    { name: "抬水重排验收", nickname: "甲", members: ["乙", "丙", "丁"] },
    201,
  );
  const people = [];
  for (const m of r.dorm.members) {
    const claim = await api(
      "/chores/claim",
      null,
      { invite_code: r.invite_code, nickname: m.nickname },
      201,
    );
    people.push({ ...m, token: claim.access_token });
  }
  const ids = people.map((m) => m.user_id),
    board = (p = people[0]) =>
      api(
        `/chores/board?invite_code=${r.invite_code}&member_id=${p.user_id}`,
        p.token,
      );
  const save = (b, order) =>
    api(
      "/chores/order",
      people[0].token,
      { version: b.version, key: "water", rotation_order: order },
      200,
      "PATCH",
    );
  let b = await board();
  await save(b, [ids[2], ids[0], ids[1], ids[3]]);
  b = await board();
  eq(
    b.water_task.assignee_id,
    ids[2],
    "without history the first member becomes pending",
  );
  eq(b.water_handoff, null, "reorder alone creates no handoff event");
  const done = await api(
    `/chores/tasks/${b.water_task.id}/complete`,
    people[2].token,
    {},
    200,
    "PATCH",
  );
  b = await board();
  eq(b.water_task.assignee_id, ids[0]);
  eq(b.water_handoff.id, done.task.id);
  const history = h.db.sqlite
    .prepare("SELECT * FROM chore_tasks WHERE status='completed'")
    .all();
  const reminder = await api(
    "/chores/remind",
    people[1].token,
    { target_member_id: ids[0], task_id: b.water_task.id },
    201,
  );
  b = await board();
  await save(b, [ids[2], ids[3], ids[0], ids[1]]);
  let updated = await board();
  eq(
    updated.water_task.assignee_id,
    ids[3],
    "new order starts after latest completed member",
  );
  eq(
    updated.water_task.id,
    b.water_task.id,
    "pending turn keeps its reference",
  );
  eq(
    updated.water_handoff,
    b.water_handoff,
    "reorder is not a completion event",
  );
  eq(
    h.db.sqlite
      .prepare("SELECT * FROM chore_tasks WHERE status='completed'")
      .all(),
    history,
    "immutable completed history",
  );
  eq(
    (await board(people[0])).reminders.every((n) => n.read_at !== null),
    true,
    "obsolete recipient reminders cannot pop up as unread",
  );
  await api(
    `/chores/tasks/${updated.water_task.id}/complete`,
    people[0].token,
    {},
    403,
    "PATCH",
  );
  await api(
    "/chores/order",
    people[0].token,
    { version: b.version, key: "water", rotation_order: ids },
    409,
    "PATCH",
  );
  const requests = await Promise.all([
    h.request("/chores/order", {
      method: "PATCH",
      token: people[0].token,
      data: {
        version: updated.version,
        key: "water",
        rotation_order: [ids[2], ids[1], ids[3], ids[0]],
      },
    }),
    h.request(`/chores/tasks/${updated.water_task.id}/complete`, {
      method: "PATCH",
      token: people[3].token,
      data: {},
    }),
  ]);
  checks++;
  assert(requests.every((r) => [200, 403, 409].includes(r.status)));
  eq(
    h.db.sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM chore_tasks WHERE key='water' AND status='pending'",
      )
      .get().n,
    1,
    "concurrent reorder/complete leaves exactly one pending turn",
  );
  eq(h.db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  // A real undo may restore its original actor. Explicitly saving even the
  // same order must honor the preview's latest-completion rule again.
  const x = await api(
    "/guest/create",
    null,
    { name: "撤销后重排", nickname: "一", members: ["二", "三"] },
    201,
  );
  const xp = [];
  for (const m of x.dorm.members)
    xp.push({
      ...m,
      ...(await api(
        "/chores/claim",
        null,
        { invite_code: x.invite_code, nickname: m.nickname },
        201,
      )),
    });
  const xb = () =>
    api(
      `/chores/board?invite_code=${x.invite_code}&member_id=${x.member_id}`,
      x.access_token,
    );
  let v = await xb();
  await api(
    `/chores/tasks/${v.water_task.id}/complete`,
    x.access_token,
    {},
    200,
    "PATCH",
  );
  v = await xb();
  const secondId = v.water_task.id;
  await api(
    `/chores/tasks/${secondId}/complete`,
    xp[1].access_token,
    {},
    200,
    "PATCH",
  );
  v = await xb();
  const order = [xp[0].user_id, xp[2].user_id, xp[1].user_id];
  await api(
    "/chores/order",
    x.access_token,
    { version: v.version, key: "water", rotation_order: order },
    200,
    "PATCH",
  );
  await api(
    `/chores/tasks/${secondId}/undo`,
    xp[1].access_token,
    {},
    200,
    "PATCH",
  );
  v = await xb();
  eq(v.water_task.assignee_id, xp[1].user_id);
  await api(
    "/chores/order",
    x.access_token,
    { version: v.version, key: "water", rotation_order: order },
    200,
    "PATCH",
  );
  eq(
    (await xb()).water_task.assignee_id,
    xp[2].user_id,
    "same-order save after undo matches draft preview",
  );
  console.log(
    JSON.stringify({
      status: "passed",
      checks,
      scope:
        "immediate water reassignment, actual completion event, stale recipient, history and concurrency",
    }),
  );
} finally {
  await h.close();
}
