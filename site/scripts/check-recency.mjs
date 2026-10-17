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
  const value = await r.json();
  eq(r.status, status, path);
  return value;
}
try {
  const room = await api(
    "/guest/create",
    null,
    "POST",
    { name: "间隔验收", nickname: "甲", members: ["乙"] },
    201,
  );
  const owner = room.access_token,
    invite = room.invite_code;
  const member = await api(
    "/chores/claim",
    null,
    "POST",
    { invite_code: invite, nickname: "乙" },
    201,
  );
  const board = () =>
    api(
      `/chores/board?invite_code=${invite}&member_id=${room.member_id}`,
      owner,
    );
  let b = await board();
  eq(
    b.categories.map((c) => c.reminder_interval_days),
    [3, 3, 3, 3],
    "existing default is independent for each category",
  );
  const water = b.water_task.id,
    rounds = JSON.stringify(b.rounds);
  await api("/chores/settings", owner, "PATCH", {
    version: b.version,
    categories: [
      { key: "floor", reminder_interval_days: 1 },
      { key: "toilet", reminder_interval_days: 5 },
      { key: "water", reminder_interval_days: 2 },
    ],
  });
  b = await board();
  eq(b.categories.find((c) => c.key === "floor").reminder_interval_days, 1);
  eq(b.categories.find((c) => c.key === "toilet").reminder_interval_days, 5);
  eq(b.categories.find((c) => c.key === "water").reminder_interval_days, 2);
  eq(b.water_task.id, water, "interval does not advance water");
  eq(JSON.stringify(b.rounds), rounds, "interval does not change rounds");
  for (const invalid of [0, 366, 1.5, "3"])
    await api(
      "/chores/settings",
      owner,
      "PATCH",
      {
        version: b.version,
        categories: [{ key: "floor", reminder_interval_days: invalid }],
      },
      422,
    );
  await api(
    "/chores/settings",
    member.access_token,
    "PATCH",
    {
      version: b.version,
      categories: [{ key: "floor", reminder_interval_days: 2 }],
    },
    403,
  );
  await api("/chores/settings", owner, "PATCH", {
    version: b.version,
    categories: [{ key: "sink", name: "洗手池" }],
  });
  b = await board();
  eq(
    b.categories.find((c) => c.key === "floor").reminder_interval_days,
    1,
    "unrelated save preserves interval",
  );
  async function backfill(at) {
    const before = await board();
    return api(
      "/chores/history",
      owner,
      "POST",
      {
        version: before.version,
        member_id: room.member_id,
        key: "floor",
        completed_at: at,
        reason: "隔离回归",
      },
      201,
    );
  }
  await backfill("2026-01-01T12:00:00+08:00");
  const activity = () => api("/chores/activity?invite_code=" + invite, owner);
  let a = await activity();
  eq(
    a.last_completed.find((r) => r.key === "floor").completed_at,
    "2026-01-01T04:00:00.000Z",
    "last completion searches all history",
  );
  eq(
    a.daily.filter((r) => r.key === "floor").length,
    0,
    "all-time recency is not a three-month aggregate",
  );
  const laterDay = new Date(Date.now() - 5 * 86400000)
    .toISOString()
    .slice(0, 10);
  const later = laterDay + "T12:00:00+08:00";
  const laterUtc = new Date(later).toISOString();
  const result = await backfill(later);
  a = await activity();
  eq(
    a.last_completed.find((r) => r.key === "floor").completed_at,
    laterUtc,
    "new valid record changes last completion",
  );
  const projected = (await board()).calendar;
  // Select the created history identity from the response, never a task binding.
  const id =
    result.record?.id ??
    result.id ??
    projected.find((r) => r.completed_at === laterUtc)?.id;
  assert(id < 0, "backfill has a history identity");
  b = await board();
  await api("/chores/history", owner, "PATCH", {
    id,
    version: b.version,
    revision: 1,
    completed_at: "2026-01-02T12:00:00+08:00",
    reason: "修正隔离回归",
  });
  eq(
    (await activity()).last_completed.find((r) => r.key === "floor")
      .completed_at,
    "2026-01-02T04:00:00.000Z",
    "correction updates recency projection",
  );
  b = await board();
  await api("/chores/history", owner, "DELETE", {
    id,
    version: b.version,
    revision: 2,
    reason: "撤回隔离回归",
  });
  eq(
    (await activity()).last_completed.find((r) => r.key === "floor")
      .completed_at,
    "2026-01-01T04:00:00.000Z",
    "deletion restores previous effective completion",
  );
  b = await board();
  eq(b.water_task.id, water);
  eq(JSON.stringify(b.rounds), rounds);
  const other = await api(
    "/guest/create",
    null,
    "POST",
    { name: "另一间", nickname: "丙" },
    201,
  );
  await api(
    "/chores/activity?invite_code=" + invite,
    other.access_token,
    "GET",
    undefined,
    403,
  );
  console.log(
    JSON.stringify({
      status: "passed",
      checks,
      scope:
        "independent reminder intervals, authority/range validation, all-time corrected recency and unchanged live rounds",
    }),
  );
} finally {
  h.close();
}
