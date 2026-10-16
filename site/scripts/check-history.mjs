import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
const h = await createHarness();
let checks = 0;
const eq = (a, b, label) => {
  assert.deepEqual(a, b, label);
  checks++;
};
async function api(path, token, method = "GET", data, status = 200) {
  const r = await h.request(path, { token, method, data });
  const result = await r.json();
  eq(
    r.status,
    status,
    `${method} ${path}: ${JSON.stringify(result.detail || "")}`,
  );
  return result;
}
try {
  const room = await api(
    "/guest/create",
    null,
    "POST",
    { name: "历史验收", nickname: "甲", members: ["乙", "丙"] },
    201,
  );
  const owner = room.access_token,
    invite = room.invite_code,
    member = room.dorm.members.find((m) => m.nickname === "乙");
  const claimed = await api(
      "/chores/claim",
      null,
      "POST",
      { invite_code: invite, nickname: "乙" },
      201,
    ),
    token = claimed.access_token;
  const board = () =>
    api(
      `/chores/board?invite_code=${invite}&member_id=${member.user_id}`,
      token,
    );
  let b = await board();
  const task = b.today_tasks.find((t) => t.key === "floor");
  await api(`/chores/tasks/${task.id}/complete`, token, "PATCH", {});
  b = await board();
  const original = h.db.sqlite
    .prepare("SELECT * FROM chore_tasks ORDER BY id")
    .all();
  const waterId = b.water_task.id,
    rounds = JSON.stringify(b.rounds);
  const at = "2026-01-01T12:34:00+08:00";
  await api(
    "/chores/activity?invite_code=" + invite,
    null,
    "GET",
    undefined,
    401,
  );
  const other = await api(
    "/guest/create",
    null,
    "POST",
    { name: "别的房间", nickname: "丁" },
    201,
  );
  await api(
    "/chores/activity?invite_code=" + invite,
    other.access_token,
    "GET",
    undefined,
    403,
  );
  await api(
    "/chores/history",
    token,
    "POST",
    {
      version: b.version,
      member_id: room.member_id,
      key: "water",
      completed_at: at,
      reason: "越权",
    },
    403,
  );
  await api(
    "/chores/history",
    token,
    "POST",
    {
      version: b.version,
      member_id: member.user_id,
      key: "water",
      completed_at: "2099-01-01T12:00:00+08:00",
      reason: "未来",
    },
    422,
  );
  await api(
    "/chores/history",
    token,
    "POST",
    {
      version: b.version,
      member_id: member.user_id,
      key: "water",
      completed_at: "2026-02-30T12:00:00+08:00",
      reason: "日期",
    },
    422,
  );
  await api("/chores/history", token, "PATCH", {
    id: task.id,
    revision: 0,
    version: b.version,
    completed_at: at,
    reason: "修正时间",
  });
  const correctedBoard = await api(
    `/chores/board?invite_code=${invite}&member_id=${member.user_id}&month=2026-01`,
    token,
  );
  const corrected = correctedBoard.calendar.find((r) => r.id === task.id);
  eq(corrected.completed_date, "2026-01-01");
  eq(corrected.revision, 1);
  eq(
    JSON.stringify(correctedBoard.rounds),
    rounds,
    "history changes never advance rounds",
  );
  eq(correctedBoard.water_task.id, waterId);
  eq(
    h.db.sqlite.prepare("SELECT * FROM chore_tasks ORDER BY id").all(),
    original,
    "original task rows immutable",
  );
  const log = await api("/chores/history?id=" + task.id, token);
  eq(log.audit.length, 1);
  eq(log.audit[0].actor_name, "乙");
  eq(
    log.audit[0].before.completed_at,
    original.find((t) => t.id === task.id).completed_at,
  );
  await api(
    "/chores/history",
    token,
    "PATCH",
    {
      id: task.id,
      revision: 0,
      version: correctedBoard.version,
      completed_at: at,
      reason: "陈旧修正",
    },
    409,
  );
  await api(
    "/chores/history?id=" + task.id,
    other.access_token,
    "GET",
    undefined,
    404,
  );
  b = await board();
  const today = b.today,
    past = today + "T00:01:00+08:00";
  await api(
    "/chores/history",
    owner,
    "POST",
    {
      version: b.version,
      member_id: member.user_id,
      key: "water",
      completed_at: past,
      reason: "创建者补记",
    },
    201,
  );
  b = await board();
  const manual = b.calendar.find((r) => r.id < 0);
  eq(manual.assignee_id, member.user_id);
  const snapshot = h.db.sqlite
    .prepare("SELECT * FROM chore_tasks ORDER BY id")
    .all();
  const activity = await api("/chores/activity?invite_code=" + invite, token);
  eq(
    activity.recent_records.some((r) => r.id === manual.id),
    true,
  );
  eq(
    activity.daily.find((d) => d.date === today && d.key === "water").count,
    1,
  );
  await api("/chores/history", token, "DELETE", {
    id: manual.id,
    revision: manual.revision,
    version: b.version,
    reason: "重复补记",
  });
  b = await board();
  eq(
    b.calendar.some((r) => r.id === manual.id),
    false,
  );
  eq(b.water_task.id, waterId);
  eq(
    h.db.sqlite.prepare("SELECT * FROM chore_tasks ORDER BY id").all(),
    snapshot,
  );
  eq(
    h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM chore_history_audit").get()
      .n,
    3,
    "append-only audit includes soft deletion",
  );
  const creatorClaim = await api(
    "/chores/claim",
    null,
    "POST",
    { invite_code: invite, nickname: "甲" },
    201,
  );
  await api(
    "/chores/history?id=" + task.id,
    creatorClaim.access_token,
    "GET",
    undefined,
    403,
  );
  await api("/chores/history", owner, "PATCH", {
    id: task.id,
    revision: 1,
    version: b.version,
    completed_at: past,
    reason: "创建者修正",
  });
  console.log(
    JSON.stringify({
      status: "passed",
      checks,
      scope:
        "history ownership, creator authority, cross-room denial, audit, CAS, calendar/statistics projection, no rotation mutation",
    }),
  );
} finally {
  h.close();
}
