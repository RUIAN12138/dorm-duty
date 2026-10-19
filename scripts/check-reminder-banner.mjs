import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import {
  effectScope,
  reactive,
  nextTick,
} from "../frontend/node_modules/vue/index.mjs";
const result = await build({
  stdin: {
    contents: `export {useReminderBanner} from './composables/useReminderBanner';export {createCalendarViewMemory} from './interaction/calendarViewMemory';export {preferredEntryRoom} from './interaction/entryRoom';`,
    resolveDir: new URL("../frontend/src", import.meta.url).pathname,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "banner-fixture",
      setup(b) {
        b.onResolve({ filter: /^vue$/ }, () => ({
          path: new URL(
            "../frontend/node_modules/vue/index.mjs",
            import.meta.url,
          ).href,
          external: true,
        }));
      },
    },
  ],
});
const code = result.outputFiles[0].text;
const api = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const stored = new Map();
globalThis.localStorage = {
  getItem: (key) => stored.get(key) || null,
  setItem: (key, value) => stored.set(key, value),
};
const note = (id) => ({
  id,
  sender_name: "室友",
  task_name: "地板",
  created_at: `2026-10-19T03:00:0${id}Z`,
  read_at: null,
});
const source = reactive({
  identity: "ROOM:1",
  notes: [note(2), note(1)],
  blocked: true,
  visible: true,
  inboxOpen: false,
});
let banner;
let scope = effectScope();
scope.run(() => (banner = api.useReminderBanner(() => ({ ...source }))));
assert.equal(banner.active.value, null);
assert.equal(stored.size, 0, "blocked notices are not consumed");
source.blocked = false;
await nextTick();
assert.equal(banner.active.value.id, 1, "oldest unseen first");
assert.equal(source.notes[0].read_at, null, "presenting does not mark read");
banner.dismiss();
banner.refresh();
assert.equal(banner.active.value, null, "wait for leave before next banner");
banner.settled();
assert.equal(banner.active.value.id, 2);
banner.dismiss();
banner.settled();
assert.equal(banner.active.value, null);
scope.stop();
// Import a fresh module to prove persistent receipts, not only module memory.
const fresh = await import(
  "data:text/javascript;base64," +
    Buffer.from(code + "\n// fresh module").toString("base64")
);
scope = effectScope();
scope.run(() => (banner = fresh.useReminderBanner(() => ({ ...source }))));
assert.equal(banner.active.value, null, "refresh does not replay seen notices");
source.identity = "ROOM:2";
source.visible = false;
await nextTick();
assert.equal(banner.active.value, null);
assert.equal(
  stored.has("dorm-reminder-banner-v1:ROOM:2"),
  false,
  "hidden identity is not consumed",
);
source.visible = true;
await nextTick();
assert.equal(banner.active.value.id, 1, "member receipts isolated");
source.inboxOpen = true;
await nextTick();
assert.equal(banner.active.value, null);
banner.settled();
source.inboxOpen = false;
await nextTick();
assert.equal(
  banner.active.value,
  null,
  "opening inbox consumes already visible unread messages",
);
source.notes = [...source.notes, note(3)];
source.blocked = true;
await nextTick();
assert.equal(banner.active.value, null);
source.blocked = false;
await nextTick();
assert.equal(banner.active.value.id, 3);
banner.dismiss();
banner.settled();
globalThis.localStorage = {
  getItem() {
    throw Error("blocked");
  },
  setItem() {
    throw Error("blocked");
  },
};
source.notes = [...source.notes, note(4)];
await nextTick();
assert.equal(banner.active.value.id, 4);
banner.dismiss();
banner.settled();
banner.refresh();
assert.equal(
  banner.active.value,
  null,
  "memory dedup survives storage failure",
);
scope.stop();
source.notes = [note(5)];
banner.refresh();
assert.equal(banner.active.value, null, "disposed banner cannot reopen");
const room = (id) => ({ id, invite_code: `ROOM${id}` });
assert.equal(api.preferredEntryRoom([]), undefined);
assert.equal(api.preferredEntryRoom([room(1)]).id, 1);
assert.equal(api.preferredEntryRoom([room(1), room(2)]), undefined);
assert.equal(api.preferredEntryRoom([room(1), room(2)], "ROOM2").id, 2);
assert.equal(api.preferredEntryRoom([room(1), room(2)], "UNKNOWN"), undefined);
const first = api.createCalendarViewMemory(),
  second = api.createCalendarViewMemory();
first.view = "list";
first.list.page = 2;
assert.equal(second.view, "calendar");
assert.equal(
  second.list.page,
  0,
  "board memory never leaks into another identity",
);
console.log(
  "Reminder banner: one-time persistence, queue/leave, hidden/blocked deferral, inbox/read separation, member isolation, storage failure and disposal; bound-room selection and independent page memory passed.",
);

const fallbackSource = reactive({
  identity: "FALLBACK:1",
  notes: [note(6), note(7)],
  blocked: false,
  visible: true,
  inboxOpen: false,
});
let fallback;
const fallbackScope = effectScope();
fallbackScope.run(
  () => (fallback = api.useReminderBanner(() => ({ ...fallbackSource }))),
);
assert.equal(fallback.active.value.id, 6);
fallback.dismiss();
await new Promise((resolve) => setTimeout(resolve, 400));
assert.equal(
  fallback.active.value.id,
  7,
  "missing leave event cannot stall queue",
);
fallback.dismiss();
fallback.settled(6);
fallback.refresh();
assert.equal(
  fallback.active.value,
  null,
  "old leave callback cannot advance a newer dismissal",
);
fallback.settled(7);
fallbackScope.stop();
console.log(
  "Reminder banner: cancelled/missing transition fallback and stale leave identity passed.",
);
