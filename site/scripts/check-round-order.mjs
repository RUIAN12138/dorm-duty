import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
let assertions = 0;
const eq = (a, b) => {
  assertions++;
  assert.deepEqual(a, b);
};
const h = await createHarness();
const api = async (url, options = {}, status = 200) => {
  const res = await h.request(url, options);
  const data = await res.json();
  eq(res.status, status);
  return data;
};
try {
  const r = await api(
    "/guest/create",
    {
      method: "POST",
      data: { name: "排列隔离验收", nickname: "甲", members: ["乙", "丙"] },
    },
    201,
  );
  const owner = { id: r.member_id, token: r.access_token };
  const other = r.dorm.members.find((m) => m.user_id !== owner.id);
  const claimed = await api(
    "/chores/claim",
    {
      method: "POST",
      data: { invite_code: r.invite_code, member_id: other.user_id },
    },
    201,
  );
  const board = (person = owner) =>
    api(`/chores/board?invite_code=${r.invite_code}&member_id=${person.id}`, {
      token: person.token,
    });
  for (const key of ["floor", "sink", "toilet"]) {
    let b = await board();
    const task = b.today_tasks.find((t) => t.key === key);
    await api(`/chores/tasks/${task.id}/complete`, {
      method: "PATCH",
      token: owner.token,
      data: {},
    });
    b = await board();
    const before = b.rounds.find((r) => r.key === key);
    eq(before.completions.length, 1);
    eq(before.completions[0].user_id, owner.id);
    eq(
      before.completions[0].completed_at,
      b.calendar.find((t) => t.id === task.id).completed_at,
    );
    const history = b.calendar;
    const tasks = h.db.sqlite
      .prepare(
        "SELECT * FROM chore_tasks WHERE dorm_id=? AND key=? ORDER BY id",
      )
      .all(r.dorm.id, key);
    const category = b.categories.find((c) => c.key === key);
    const order = [...category.rotation_order].reverse();
    const draft = {
      version: b.version,
      categories: [{ ...category, rotation_order: order }],
    };
    await api(
      "/chores/settings",
      { method: "PATCH", token: claimed.access_token, data: draft },
      403,
    );
    await api("/chores/settings", {
      method: "PATCH",
      token: owner.token,
      data: draft,
    });
    await api(
      "/chores/settings",
      { method: "PATCH", token: owner.token, data: draft },
      409,
    );
    b = await board();
    const after = b.rounds.find((r) => r.key === key);
    eq(
      after.members.map((m) => m.user_id),
      order,
    );
    eq(after.sequence, before.sequence);
    eq(after.completed, before.completed);
    eq(after.completions, before.completions);
    eq(after.members.find((m) => m.user_id === owner.id).completed, true);
    eq(b.calendar, history);
    eq(
      h.db.sqlite
        .prepare(
          "SELECT * FROM chore_tasks WHERE dorm_id=? AND key=? ORDER BY id",
        )
        .all(r.dorm.id, key),
      tasks,
    );
    const memberView = await board({
      id: other.user_id,
      token: claimed.access_token,
    });
    eq(
      memberView.rounds
        .find((r) => r.key === key)
        .members.map((m) => m.user_id),
      order,
    );
  }
  // Month previews must carry the real completion markers over a month boundary.
  const current = await board();
  const done = current.calendar[0];
  const nextMonth = new Date(done.completed_at);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const preview = await api(
    `/chores/board?invite_code=${r.invite_code}&member_id=${owner.id}&month=${nextMonth.toISOString().slice(0, 7)}`,
    { token: owner.token },
  );
  eq(preview.calendar, []);
  eq(
    preview.calendar_neighbors[done.completed_date.slice(0, 7)],
    current.calendar,
  );
  eq(
    preview.rounds.find((r) => r.key === "floor").completions,
    current.rounds.find((r) => r.key === "floor").completions,
  );
  eq(h.db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        assertions,
        scope:
          "three independent voluntary round orders, member visibility, creator permission, stale version and unchanged tasks/history",
      },
      null,
      2,
    ),
  );
} finally {
  await h.close();
}
