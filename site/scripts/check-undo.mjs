import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
import { dailyReminderTasksSql } from "../shared/notifications.mjs";
let assertions = 0;
const eq = (a, b, label) => {
  assertions++;
  assert.deepEqual(a, b, label);
};
async function api(h, path, options = {}, status = 200) {
  const res = await h.request(path, options);
  const data = await res.json();
  eq(res.status, status, `${path}: ${JSON.stringify(data)}`);
  return data;
}
async function room(h) {
  const r = await api(
    h,
    "/guest/create",
    {
      method: "POST",
      data: { name: "撤销验收", nickname: "甲", members: ["乙"] },
    },
    201,
  );
  const c = await api(
    h,
    "/chores/claim",
    {
      method: "POST",
      data: {
        invite_code: r.invite_code,
        nickname: r.dorm.members.find(m => m.user_id !== r.member_id).nickname,
        member_id: r.dorm.members.find((m) => m.user_id !== r.member_id)
          .user_id,
      },
    },
    201,
  );
  return {
    ...r,
    a: { user_id: r.member_id, token: r.access_token },
    b: { ...c.member, token: c.access_token },
  };
}
const board = (h, r, p = r.a) =>
  api(h, `/chores/board?invite_code=${r.invite_code}&member_id=${p.user_id}`, {
    token: p.token,
  });
const find = (b, key) => b.today_tasks.find((t) => t.key === key);
const act = (h, p, t, action, status = 200) =>
  api(
    h,
    `/chores/tasks/${t.id}/${action}`,
    { method: "PATCH", token: p.token, data: {} },
    status,
  );
const h = await createHarness();
try {
  const r = await room(h);
  let b = await board(h, r);
  const floor = find(b, "floor");
  await act(h, r.a, floor, "undo", 409);
  await act(h, r.a, floor, "complete");
  await act(h, r.b, floor, "undo", 403);
  await act(h, r.a, floor, "undo");
  b = await board(h, r);
  eq(find(b, "floor").status, "pending");
  eq(find(b, "floor").completed_at, null);
  eq(b.calendar.length, 0);
  eq(b.rounds.find((x) => x.key === "floor").completed, 0);
  await act(h, r.a, floor, "complete");
  const bf = find(await board(h, r, r.b), "floor");
  await act(h, r.b, bf, "complete");
  eq((await board(h, r)).rounds.find((x) => x.key === "floor").sequence, 2);
  const subscription = await api(h, "/chores/calendar-subscription", {
    method: "POST",
    token: r.b.token,
    data: { version: 0, include_alarms: false },
  });
  await act(h, r.b, bf, "undo");
  b = await board(h, r, r.b);
  eq(b.rounds.find((x) => x.key === "floor").sequence, 1);
  eq(find(b, "floor").id, bf.id);
  eq(find(b, "floor").status, "pending");
  const feed = await h.request(subscription.path);
  eq(feed.status, 200);
  const calendar = await feed.text();
  eq(
    calendar.includes(`UID:duty-${r.dorm.id}-${r.b.user_id}-${bf.id}@lundao`),
    true,
    "private calendar returns to the restored turn after undo",
  );
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const reminderTasks = h.db.sqlite
    .prepare(dailyReminderTasksSql)
    .all(r.dorm.id, r.b.user_id, today, today);
  eq(
    reminderTasks.some((t) => t.id === bf.id),
    true,
    "daily reminders select the restored unfinished turn",
  );
  await act(h, r.b, bf, "complete");
  b = await board(h, r);
  eq(b.rounds.find((x) => x.key === "floor").sequence, 2);
  await act(h, r.a, find(b, "floor"), "complete");
  await act(h, r.b, bf, "undo", 409);
  // Water rewind must remove the newly pending turn but keep its references valid.
  b = await board(h, r);
  const w = b.water_task;
  await act(h, r.a, w, "complete");
  const w2 = (await board(h, r, r.b)).water_task;
  await api(
    h,
    "/chores/remind",
    {
      method: "POST",
      token: r.a.token,
      data: { target_member_id: r.b.user_id, task_id: w2.id },
    },
    201,
  );
  await act(h, r.a, w, "undo");
  eq((await board(h, r)).water_task.id, w.id);
  eq(h.db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  await act(h, r.a, w, "complete");
  eq((await board(h, r, r.b)).water_task.id, w2.id);
  await act(h, r.b, w2, "complete");
  await act(h, r.a, w, "undo", 409);
  const other = await room(h);
  await act(h, other.a, w2, "undo", 403);
  const last = await board(h, r, r.b);
  eq(
    last.undo_tasks.some((t) => t.id === w2.id),
    true,
  );
  await Promise.all([
    act(h, r.b, w2, "undo"),
    act(h, r.a, find(await board(h, r), "sink"), "complete"),
  ]);
  eq((await board(h, r)).water_task.id, w2.id);
  // Scheduled chores and concurrent requests use the same guarded mutation.
  const daily = await room(h);
  const dbd = await board(h, daily);
  const dc = dbd.categories.find((c) => c.key === "floor");
  await api(h, "/chores/settings", {
    method: "PATCH",
    token: daily.a.token,
    data: { version: dbd.version, categories: [{ ...dc, mode: "scheduled" }] },
  });
  const dt = find(await board(h, daily), "floor");
  await act(h, daily.a, dt, "complete");
  await act(h, daily.a, dt, "undo");
  eq(find(await board(h, daily), "floor").status, "pending");
  const wt = (await board(h, daily)).water_task;
  await act(h, daily.a, wt, "complete");
  const duplicates = await Promise.all([
    h.request(`/chores/tasks/${wt.id}/undo`, {
      method: "PATCH",
      token: daily.a.token,
      data: {},
    }),
    h.request(`/chores/tasks/${wt.id}/undo`, {
      method: "PATCH",
      token: daily.a.token,
      data: {},
    }),
  ]);
  eq(duplicates.map((r) => r.status).sort(), [200, 409]);
  eq((await board(h, daily)).water_task.id, wt.id);
  await act(h, daily.a, wt, "complete");
  const following = (await board(h, daily, daily.b)).water_task;
  const competing = await Promise.all([
    h.request(`/chores/tasks/${wt.id}/undo`, {
      method: "PATCH",
      token: daily.a.token,
      data: {},
    }),
    h.request(`/chores/tasks/${following.id}/complete`, {
      method: "PATCH",
      token: daily.b.token,
      data: {},
    }),
  ]);
  eq(competing.map((r) => r.status).sort(), [200, 409]);
  eq(
    h.db.sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM chore_tasks WHERE dorm_id=? AND key='water' AND status='pending'",
      )
      .get(daily.dorm.id).n,
    1,
  );
  eq(h.db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        assertions,
        scope:
          "own-only undo, round rewind, replay, following-round safety, water references, concurrency and calendar removal",
      },
      null,
      2,
    ),
  );
} finally {
  await h.close();
}
