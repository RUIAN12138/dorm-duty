import assert from "node:assert/strict";
import { createHarness } from "../../../../../site/scripts/check-cloud-backend.mjs";
import { createDraftSandbox } from "./draftSandbox.mjs";
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : ["2026-10-27T02:00:00Z"]));
  }
  static now() {
    return new RealDate("2026-10-27T02:00:00Z").getTime();
  }
};
const h = await createHarness();
let checks = 0;
function local(value, key = "") {
  if (Array.isArray(value))
    return value.map((item) =>
      local(
        item,
        ["rotation_order", "water_order"].includes(key) ? "user_id" : key,
      ),
    );
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, local(v, k)]),
    );
  return typeof value === "number" &&
    [
      "id",
      "user_id",
      "member_id",
      "assignee_id",
      "completed_by",
      "from_member_id",
      "target_member_id",
    ].includes(key)
    ? -Math.abs(value)
    : value;
}
const task = (key, rotation) => ({
  key,
  name: key,
  content: "合成内容",
  enabled: true,
  page: key === "water" ? "water" : "duty",
  rotation,
  display: "title",
  deadline: "22:00",
  execution_time: "09:00",
  interval: 3,
});
const config = {
  schema_version: 2,
  policy: "soft",
  pages: [
    { id: "duty", label: "值日" },
    { id: "water", label: "催促" },
    { id: "calendar", label: "日历" },
  ],
  tasks: [task("floor", "round"), task("water", "completion")],
};
try {
  const legacy = await (
    await h.request("/guest/create", {
      method: "POST",
      data: { name: "旧宿舍对照", nickname: "旧成员", members: ["旧室友"] },
    })
  ).json();
  await h.request(
    `/chores/board?invite_code=${legacy.invite_code}&member_id=${legacy.member_id}`,
    { token: legacy.access_token },
  );
  const oldSnapshot = () =>
    JSON.stringify(
      h.db.sqlite
        .prepare("SELECT * FROM chore_tasks WHERE dorm_id=? ORDER BY id")
        .all(legacy.dorm.id),
    );
  const oldBefore = oldSnapshot();
  const room = await (
    await h.request("/guest/create", {
      method: "POST",
      data: {
        name: "沙箱对照",
        nickname: "甲",
        members: [],
        configuration: config,
      },
    })
  ).json();
  const get = async () => {
    const response = await h.request(
      `/chores/board?invite_code=${room.invite_code}&member_id=${room.member_id}`,
      { token: room.access_token },
    );
    assert(response.ok);
    return response.json();
  };
  const initial = await get(),
    s = createDraftSandbox(local(initial), () => new Date());
  function shape(board) {
    return {
      tasks: board.workspace_tasks
        .map((t) => ({
          key: t.key,
          mode: t.mode,
          assignee: t.assignee_id,
          status: t.status,
          sequence: t.sequence ?? null,
          can_complete: t.can_complete,
        }))
        .sort((a, b) => a.key.localeCompare(b.key) || a.assignee - b.assignee),
      rounds: board.rounds
        .map((r) => ({
          key: r.key,
          sequence: r.sequence,
          completed: r.completed,
          total: r.total,
        }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      records: board.calendar
        .map((r) => ({
          key: r.key,
          assignee: r.assignee_id,
          date: r.completed_date,
        }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      water: board.water_task
        ? {
            assignee: board.water_task.assignee_id,
            sequence: board.water_task.sequence,
            status: board.water_task.status,
          }
        : null,
    };
  }
  async function compare(label) {
    assert.deepEqual(shape(s.snapshot()), shape(local(await get())), label);
    checks++;
  }
  await compare("initial synthetic snapshot matches actual service shape");
  for (const key of ["floor", "water"]) {
    const remote = (await get()).workspace_tasks.find(
        (t) => t.key === key && t.assignee_id === room.member_id,
      ),
      sim = s
        .snapshot()
        .workspace_tasks.find(
          (t) => t.key === key && t.assignee_id === -room.member_id,
        );
    s.complete(sim);
    const completed = await h.request(`/chores/tasks/${remote.id}/complete`, {
      token: room.access_token,
      method: "PATCH",
      data: {},
    });
    assert(completed.ok, await completed.clone().text());
    await compare(`${key} completion and next round/turn match real backend`);
    s.undo(sim.id);
    const undone = await h.request(`/chores/tasks/${remote.id}/undo`, {
      token: room.access_token,
      method: "PATCH",
      data: {},
    });
    assert(undone.ok, await undone.clone().text());
    await compare(`${key} undo matches real backend`);
  }
  assert.equal(oldSnapshot(), oldBefore);
  checks++;
  console.log(
    JSON.stringify({
      status: "passed",
      checks,
      scope:
        "real API and temporary SQLite versus local sandbox; synthetic members; no production database",
    }),
  );
} finally {
  h.close();
  globalThis.Date = RealDate;
}
