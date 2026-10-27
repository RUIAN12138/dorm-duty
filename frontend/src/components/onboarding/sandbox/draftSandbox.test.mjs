import assert from "node:assert/strict";
import { createDraftSandbox } from "./draftSandbox.mjs";
import { createDraftPreviewModel } from "../draftPreviewBoard.ts";
const clone = (value) => JSON.parse(JSON.stringify(value));
let at = new Date("2026-10-27T02:00:00Z"),
  checks = 0;
const check = (value, label) => {
  assert.ok(value, label);
  checks++;
};
const draft = {
  schema_version: 2,
  name: "模拟宿舍",
  nickname: "甲",
  members: [],
  policy: "soft",
  pages: [
    { id: "duty", label: "值日" },
    { id: "water", label: "催促" },
    { id: "calendar", label: "日历" },
  ],
  tasks: [
    {
      key: "floor",
      name: "地板",
      content: "扫地",
      enabled: true,
      page: "duty",
      rotation: "round",
      display: "title",
      deadline: "22:00",
      execution_time: "09:00",
      interval: 3,
    },
    {
      key: "water",
      name: "抬水",
      content: "饮用水",
      enabled: true,
      page: "water",
      rotation: "completion",
      display: "title",
      deadline: "20:00",
      execution_time: "09:00",
      interval: 3,
    },
  ],
};
const fixture = (value = draft) => createDraftPreviewModel()(value, at);
const s = createDraftSandbox(fixture(), () => at),
  before = s.snapshot();
const own = before.workspace_tasks.find(
    (t) => t.key === "floor" && t.assignee_id === -1,
  ),
  peer = before.workspace_tasks.find(
    (t) => t.key === "floor" && t.assignee_id === -3,
  );
const unchanged = (operation) => {
  const b = JSON.stringify(s.snapshot());
  assert.throws(operation);
  check(
    JSON.stringify(s.snapshot()) === b,
    "rejected operation preserves canonical snapshot",
  );
};
unchanged(() => s.complete({ ...peer, assignee_id: -1, can_complete: true }));
unchanged(() => s.complete({ ...own, id: 1 }));
unchanged(() => s.complete({ ...own, id: -99999 }));
const receipt = s.complete({ ...own, assignee_id: -3, name: "伪造" }),
  after = s.snapshot();
check(
  receipt.task.name === "地板" &&
    receipt.task.assignee_id === -1 &&
    receipt.task.completed_by === -1,
  "receipt uses canonical task fields",
);
check(
  after.today_tasks.find((t) => t.id === own.id).status === "completed",
  "personal task becomes completed",
);
check(
  after.workspace_tasks.find((t) => t.id === own.id).status === "completed" &&
    after.nudge_tasks.find((t) => t.id === own.id).status === "completed",
  "workspace and nudge states match",
);
check(
  after.calendar.filter((r) => r.id === own.id).length === 1 &&
    after.rounds[0].completed === 2,
  "completion enters calendar and round exactly once",
);
unchanged(() => s.complete(own));
unchanged(() => s.undo(peer.id));
s.undo(own.id);
check(
  !s.snapshot().calendar.some((r) => r.id === own.id) &&
    s.snapshot().rounds[0].completed === 1,
  "undo removes matching record and round progress",
);
unchanged(() => s.undo(own.id));
const detached = s.snapshot();
detached.workspace_tasks[0].status = "completed";
check(
  JSON.stringify(detached) !== JSON.stringify(s.snapshot()),
  "snapshot mutation cannot change canonical tasks",
);
check(
  s.nudge(peer) === "sent" &&
    s.nudge(peer) === "recent" &&
    s.events.nudge === 1,
  "nudge cooldown sends one synthetic event",
);
at = new Date(at.getTime() + 60001);
check(
  s.nudge(peer) === "sent" && s.events.nudge === 2,
  "nudge can retry after the same minute cooldown",
);
unchanged(() => s.nudge(own));
s.sendNote({ target_member_id: -2, text: "合成留言" });
unchanged(() => s.sendNote({ target_member_id: 1, text: "错误对象" }));
unchanged(() => s.sendNote({ target_member_id: "all", text: "重复全体" }));
const notes = s.notes;
notes[0].text = "篡改";
check(s.notes[0].text === "合成留言", "outbox reads are detached");
const count = s.events;
count.complete = 999;
check(s.events.complete === 1, "event reads are detached");
const completedState = JSON.stringify(s.snapshot().workspace_tasks);
s.pages([...draft.pages].reverse());
check(
  JSON.stringify(s.snapshot().workspace_tasks) === completedState &&
    s.snapshot().configuration.pages[0].id === "calendar",
  "page reorder changes draft navigation without resetting operations",
);
const water = s.snapshot().water_task,
  waterReceipt = s.complete(water),
  waterNext = s.snapshot().water_task;
check(
  waterNext.assignee_id === -2 &&
    waterNext.sequence === 2 &&
    waterNext.id !== water.id,
  "completion hands water to the next member with a new stable ID",
);
check(
  waterReceipt.next_water.id === waterNext.id &&
    s.snapshot().water_handoff.id === water.id,
  "handoff snapshot matches returned receipt",
);
s.undo(water.id);
check(
  s.snapshot().water_task.id === water.id &&
    s.snapshot().water_handoff === null,
  "water undo restores original turn and clears stale handoff",
);
const hardDraft = clone(draft);
hardDraft.policy = "hard";
const hard = createDraftSandbox(fixture(hardDraft), () => at);
const h1 = hard
    .snapshot()
    .workspace_tasks.find((t) => t.key === "floor" && t.assignee_id === -1),
  h3 = hard
    .snapshot()
    .workspace_tasks.find((t) => t.key === "floor" && t.assignee_id === -3);
hard.complete(h1);
hard.complete(h3);
check(
  hard.snapshot().rounds[0].sequence === 2 &&
    hard.snapshot().rounds[0].completed === 0,
  "only all members completed starts a fresh self round",
);
hard.undo(h3.id);
check(
  hard.snapshot().rounds[0].sequence === 1 &&
    hard.snapshot().rounds[0].completed === 2,
  "undo rolls back an untouched following round",
);
hard.complete(h3);
const later = hard
  .snapshot()
  .workspace_tasks.find((t) => t.key === "floor" && t.assignee_id === -1);
hard.complete(later);
assert.throws(() => hard.undo(h3.id), /后续/);
check(true, "later completed turn prevents rewinding history");
const earlyAt = new Date("2026-10-27T00:59:59Z");
const early = createDraftSandbox(
  createDraftPreviewModel()(hardDraft, earlyAt),
  () => earlyAt,
);
assert.throws(() => early.complete(early.snapshot().today_tasks[0]));
check(true, "hard task cannot complete before the configured execution time");
const scheduledDraft = clone(draft);
scheduledDraft.tasks[0].rotation = "rotation";
const scheduled = createDraftSandbox(fixture(scheduledDraft), () => at);
const scheduledTask = scheduled
  .snapshot()
  .today_tasks.find((t) => t.key === "floor");
scheduled.complete(scheduledTask);
check(
  scheduled.snapshot().workspace_tasks.filter((t) => t.key === "floor")
    .length === 1 &&
    scheduled.snapshot().workspace_tasks.find((t) => t.key === "floor")
      .status === "completed",
  "scheduled task completion does not hand off immediately",
);
const bad = fixture();
bad.members[0].user_id = 1;
assert.throws(() => createDraftSandbox(bad));
check(true, "real member IDs cannot initialize the local capability");
const missingActor = fixture();
missingActor.member.user_id = -999;
assert.throws(() => createDraftSandbox(missingActor));
check(true, "actor must belong to the canonical synthetic member list");
const missingOrder = fixture();
missingOrder.categories[0].rotation_order = [-999];
assert.throws(() => createDraftSandbox(missingOrder));
check(true, "invalid rotation is rejected before any mutation");
const readFixture = fixture();
readFixture.reminders = [
  {
    id: -888,
    source: "note",
    title: "模拟",
    body: "内容",
    created_at: at.toISOString(),
    read_at: null,
  },
];
const read = createDraftSandbox(readFixture, () => at);
check(
  read.read(-888) &&
    read.read(-888) &&
    read.events.read === 1 &&
    !read.read(888),
  "read sync stays local, exact-ID and idempotent",
);
console.log(
  JSON.stringify({
    status: "passed",
    checks,
    scope: "pure synthetic task state, no network/storage/database",
  }),
);
