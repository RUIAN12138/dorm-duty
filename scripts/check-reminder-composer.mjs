import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import {
  reactive,
  effectScope,
  nextTick,
} from "../frontend/node_modules/vue/index.mjs";
const requests = [];
globalThis.reminderRequest = (kind, values) =>
  new Promise((resolve, reject) =>
    requests.push({ kind, ...values, resolve, reject }),
  );
const result = await build({
  entryPoints: [
    new URL(
      "../frontend/src/composables/useReminderComposer.ts",
      import.meta.url,
    ).pathname,
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "reminder-fixture",
      setup(b) {
        b.onResolve({ filter: /^vue$/ }, () => ({
          path: new URL(
            "../frontend/node_modules/vue/index.mjs",
            import.meta.url,
          ).href,
          external: true,
        }));
        b.onResolve({ filter: /api\/chores$/ }, () => ({
          path: "chores",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: `export const getChoreBoard=(invite,memberId,month,token,signal)=>globalThis.reminderRequest('board',{invite,memberId,month,token,signal});export const choreRequest=(path,token,options)=>globalThis.reminderRequest('send',{path,token,body:JSON.parse(options.body)});`,
        }));
      },
    },
  ],
});
const { useReminderComposer } = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const tick = async () => {
  await nextTick();
  await new Promise((resolve) => setImmediate(resolve));
};
const source = reactive({
  open: true,
  invite: "ROOM",
  memberId: 1,
  token: "fixture",
  month: "2026-10",
  busy: false,
});
let sent = 0,
  closed = 0;
const notices = [];
let form;
const scope = effectScope();
scope.run(
  () =>
    (form = useReminderComposer(() => ({ ...source }), {
      sent: () => sent++,
      close: () => {
        closed++;
        source.open = false;
      },
      notify: (message) => notices.push(message),
    })),
);
const task = (id, assignee_id, status = "pending") => ({
  id,
  assignee_id,
  status,
  key: "floor",
  name: "地板",
  mode: "self_round",
  duty_date: "2026-10-19",
});
const board = (id) => ({
  today_tasks: [
    task(id * 10, id),
    task(id * 10, id),
    task(999, 99),
    task(888, id, "completed"),
  ],
  next_tasks: [],
  water_task: null,
});
await form.choose(1);
assert.equal(requests.length, 0, "cannot remind self");
let first = form.choose(2);
await form.choose(2);
assert.equal(
  requests.length,
  1,
  "same target double click does not duplicate read",
);
requests[0].reject(Error("lookup failed"));
await first;
assert.equal(
  form.loaded.value,
  false,
  "failed lookup is not a successful empty task list",
);
assert.equal(form.canSend.value, false);
assert.equal(form.loadError.value, "lookup failed");
form.retry();
requests[1].resolve(board(2));
await tick();
assert.equal(
  form.tasks.value.length,
  1,
  "deduplicate and scope tasks to selected member",
);
assert.equal(form.taskId.value, 20);
source.busy = true;
await tick();
assert.equal(
  form.taskId.value,
  20,
  "busy state change must not reset selection",
);
assert.equal(form.canSend.value, false);
source.busy = false;
await tick();
first = form.choose(3);
let next = form.choose(2);
assert.equal(requests[2].signal.aborted, true);
requests[3].resolve(board(2));
await next;
requests[2].resolve(board(3));
await first;
assert.equal(form.targetId.value, 2);
assert.equal(
  form.taskId.value,
  20,
  "late target response cannot replace current selection",
);
first = form.send();
await form.send();
await form.choose(3);
assert.equal(
  requests.length,
  5,
  "sending blocks duplicate send and target changes",
);
assert.deepEqual(requests[4].body, { target_member_id: 2, task_id: 20 });
requests[4].reject(Error("send failed"));
await first;
assert.equal(form.taskId.value, 20);
assert.equal(form.sendError.value, "send failed");
assert.equal(form.canSend.value, true, "failed send keeps selection retryable");
first = form.send();
source.open = false;
await tick();
source.open = true;
await tick();
requests[5].resolve({});
await first;
assert.equal(sent, 1);
assert.equal(closed, 0, "old success does not close reopened composer");
assert.equal(source.open, true);
assert.equal(notices.length, 1);
first = form.choose(2);
requests[6].resolve(board(2));
await first;
first = form.send();
source.open = false;
await tick();
source.open = true;
await tick();
requests[7].reject(Error("old send error"));
await first;
assert.equal(
  form.sendError.value,
  "",
  "old failure cannot pollute reopened composer",
);
first = form.choose(2);
source.open = false;
assert.equal(requests[8].signal.aborted, true, "closing cancels target lookup");
requests[8].resolve(board(2));
await first;
assert.equal(form.loaded.value, false);
source.open = true;
await tick();
first = form.choose(3);
scope.stop();
assert.equal(requests[9].signal.aborted, true);
requests[9].resolve(board(3));
await first;
assert.equal(form.loaded.value, false, "unmounted composer ignores late data");
console.log(
  "Reminder composer: lookup failure/retry, scoped tasks, duplicate prevention, busy retention, stale targets, immutable send, reopen isolation and disposal passed.",
);

// A late send belongs to its original identity, even if the component is retained.
let otherForm;
let otherSent = 0;
const otherNotices = [];
const other = reactive({
  open: true,
  invite: "ROOM",
  memberId: 1,
  token: "old",
  month: "2026-10",
  busy: false,
});
const otherScope = effectScope();
otherScope.run(
  () =>
    (otherForm = useReminderComposer(() => ({ ...other }), {
      sent: () => otherSent++,
      close: () => {
        other.open = false;
      },
      notify: (value) => otherNotices.push(value),
    })),
);
let index = requests.length;
let operation = otherForm.choose(2);
requests[index].resolve(board(2));
await operation;
index = requests.length;
operation = otherForm.send();
other.token = "new";
other.memberId = 3;
requests[index].resolve({});
await operation;
assert.equal(otherSent, 0, "late send cannot refresh a different identity");
assert.equal(
  otherNotices.length,
  0,
  "late send cannot notify another identity",
);
assert.equal(other.open, true);
index = requests.length;
operation = otherForm.choose(2);
requests[index].resolve(board(2));
await operation;
other.open = false;
assert.equal(otherForm.canSend.value, false, "closed composer is not sendable");
const availableTask = otherForm.taskId.value;
otherForm.taskId.value = null;
otherForm.select(availableTask);
assert.equal(
  otherForm.taskId.value,
  null,
  "closed composer cannot select a valid task",
);
otherScope.stop();
console.log("Reminder composer identity isolation passed.");
// Context is preselected only while the intended task still exists.
let contextual;
const contextState = reactive({
  open: true,
  invite: "ROOM",
  memberId: 1,
  token: "context",
  month: "2026-10",
  busy: false,
  context: { memberId: 2, taskId: 21 },
});
const contextScope = effectScope();
let contextIndex = requests.length;
contextScope.run(
  () =>
    (contextual = useReminderComposer(() => ({ ...contextState }), {
      sent() {},
      close() {},
      notify() {},
    })),
);
await tick();
requests[contextIndex].resolve({
  today_tasks: [task(20, 2), task(21, 2)],
  next_tasks: [],
  water_task: null,
});
await tick();
assert.equal(contextual.targetId.value, 2);
assert.equal(
  contextual.taskId.value,
  21,
  "preselect intended task instead of first task",
);
contextIndex = requests.length;
contextState.context = { memberId: 3, taskId: 999 };
await tick();
requests[contextIndex].resolve({
  today_tasks: [task(30, 3)],
  next_tasks: [],
  water_task: null,
});
await tick();
assert.equal(
  contextual.taskId.value,
  null,
  "missing contextual task does not silently select another",
);
assert.equal(contextual.canSend.value, false);
assert.match(contextual.contextNotice.value, /更新/);
contextual.select(30);
assert.equal(contextual.canSend.value, true);
assert.equal(contextual.contextNotice.value, "");
contextScope.stop();
console.log(
  "Reminder context: member/task prefill and stale-task explicit reselection passed.",
);
