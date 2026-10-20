// Reproduce a corrected task that keeps its ID through undo/re-complete.
// All records are disposable; no real user credentials or deployed writes.
import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
import { handleApi } from "../worker/backend.mjs";
const h = await createHarness();
let clock = new Date("2026-10-18T02:00:00Z"),
  checks = 0;
const eq = (a, b, label) => {
  assert.deepEqual(a, b, label);
  checks++;
};
async function api(path, token, method = "GET", data, status = 200) {
  const response = await handleApi(
    new Request("https://isolated.example" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    h.env,
    { now: () => clock, waitUntil() {} },
  );
  const body = await response.json();
  eq(response.status, status, JSON.stringify({ path, error: body.detail }));
  return body;
}
try {
  const room = await api(
    "/guest/create",
    null,
    "POST",
    { name: "重新打卡历史隔离", nickname: "甲", members: ["乙", "丙"] },
    201,
  );
  const token = room.access_token,
    invite = room.invite_code;
  const board = () =>
    api(
      `/chores/board?invite_code=${invite}&member_id=${room.member_id}&month=2026-10`,
      token,
    );
  for (const key of ["floor", "toilet", "sink", "water"]) {
    clock = new Date("2026-10-18T03:00:00Z");
    let b = await board();
    const task =
      key === "water" ? b.water_task : b.today_tasks.find((t) => t.key === key);
    assert.equal(task.assignee_id, room.member_id);
    await api(`/chores/tasks/${task.id}/complete`, token, "PATCH", {});
    clock = new Date("2026-10-18T04:00:00Z");
    b = await board();
    await api("/chores/history", token, "PATCH", {
      id: task.id,
      revision: 0,
      version: b.version,
      completed_at: "2026-10-16T23:50:00+08:00",
      reason: "隔离旧修正",
    });
    b = await board();
    eq(
      b.calendar.find((r) => r.id === task.id).completed_date,
      "2026-10-16",
      "current correction still applies",
    );
    if (key === "sink") {
      clock = new Date("2026-10-18T05:00:00Z");
      await api("/chores/history", token, "DELETE", {
        id: task.id,
        revision: 1,
        version: b.version,
        reason: "隔离隐藏旧打卡",
      });
    }
    const oldEntry = h.db.sqlite
      .prepare("SELECT * FROM chore_history_entries WHERE task_id=?")
      .get(task.id);
    const oldAudit = h.db.sqlite
      .prepare("SELECT * FROM chore_history_audit WHERE entry_id=? ORDER BY id")
      .all(oldEntry.id);
    await api(`/chores/tasks/${task.id}/undo`, token, "PATCH", {});
    clock = new Date("2026-10-20T09:08:44.538Z");
    const receipt = await api(
      `/chores/tasks/${task.id}/complete`,
      token,
      "PATCH",
      {},
    );
    eq(receipt.task.id, task.id, "new completion reuses original task ID");
    b = await board();
    const visible = b.calendar.find((r) => r.id === task.id);
    eq(
      visible.completed_date,
      "2026-10-20",
      "old correction cannot move a new completion",
    );
    eq(
      visible.corrected,
      false,
      "old correction no longer labels new completion corrected",
    );
    eq(
      visible.revision,
      oldEntry.revision,
      "revision is retained for optimistic concurrency",
    );
    eq(
      h.db.sqlite
        .prepare("SELECT * FROM chore_history_entries WHERE task_id=?")
        .get(task.id),
      oldEntry,
      "stored correction remains unchanged",
    );
    eq(
      h.db.sqlite
        .prepare(
          "SELECT * FROM chore_history_audit WHERE entry_id=? ORDER BY id",
        )
        .all(oldEntry.id),
      oldAudit,
      "all original audit entries remain unchanged",
    );
    const activity = await api(`/chores/activity?invite_code=${invite}`, token);
    eq(
      activity.last_completed.find((r) => r.key === key).completed_at,
      receipt.task.completed_at,
      "statistics use recompletion time",
    );
    eq(
      activity.daily
        .filter((r) => r.key === key && r.date === "2026-10-20")
        .reduce((sum, r) => sum + r.count, 0),
      1,
      "heatmap counts this completion today exactly once",
    );
    const detail = await api(`/chores/history?id=${task.id}`, token);
    eq(
      detail.audit.length,
      oldAudit.length,
      "superseded correction is still available to audit",
    );
    clock = new Date("2026-10-20T10:00:00Z");
    await api("/chores/history", token, "PATCH", {
      id: task.id,
      revision: visible.revision,
      version: b.version,
      completed_at: "2026-10-19T22:00:00+08:00",
      reason: "新打卡之后的修正",
    });
    b = await board();
    const latest = b.calendar.find((r) => r.id === task.id);
    eq(
      latest.completed_date,
      "2026-10-19",
      "a correction made after new completion still works",
    );
    eq(latest.corrected, true, "new correction has normal corrected state");
    eq(latest.revision, oldEntry.revision + 1, "revision continues increasing");
    await api(
      "/chores/history",
      token,
      "PATCH",
      {
        id: task.id,
        revision: visible.revision,
        version: b.version,
        completed_at: "2026-10-19T21:00:00+08:00",
        reason: "过期草稿",
      },
      409,
    );
  }
  console.log(
    JSON.stringify({
      status: "passed",
      checks,
      scope:
        "four categories, real undo/re-complete API, old date/void corrections, calendar/activity/audit and new correction concurrency",
    }),
  );
} finally {
  h.close();
}
