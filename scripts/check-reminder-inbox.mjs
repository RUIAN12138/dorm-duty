import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import {
  reactive,
  ref,
  effectScope,
} from "../frontend/node_modules/vue/index.mjs";
const requests = [];
globalThis.inboxRequest = (values) =>
  new Promise((resolve, reject) =>
    requests.push({ ...values, resolve, reject }),
  );
const result = await build({
  entryPoints: [
    new URL("../frontend/src/composables/useReminderInbox.ts", import.meta.url)
      .pathname,
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "inbox-fixture",
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
          contents: `export const choreRequest=(path,token,options)=>globalThis.inboxRequest({path,token,body:JSON.parse(options.body)});`,
        }));
      },
    },
  ],
});
const { useReminderInbox } = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);

const source = reactive({
  open: true,
  token: "a",
  invite: "ROOM",
  memberId: 1,
});
const busy = ref("");
const confirmed = [];
let inbox;
const scope = effectScope();
scope.run(
  () =>
    (inbox = useReminderInbox(() => ({ ...source }), busy, {
      confirmed: (...args) => confirmed.push(args),
    })),
);
const notes = [
  { id: 1, read_at: null },
  { id: 2, read_at: null },
];
let pending = inbox.read(1);
await inbox.read(1);
assert.equal(requests.length, 1, "duplicate read blocked");
requests[0].reject(Error("offline"));
await pending;
assert.equal(inbox.error.value, "offline");
assert.equal(
  inbox.reconcile(notes)[0].read_at,
  null,
  "failed write stays unread",
);
pending = inbox.read(1);
requests[1].resolve({ read_at: "2026-10-19T03:00:00Z" });
await pending;
assert.deepEqual(confirmed, [[1, "2026-10-19T03:00:00Z"]]);
assert.equal(
  inbox.reconcile(notes)[0].read_at,
  "2026-10-19T03:00:00Z",
  "old board snapshot cannot erase confirmed receipt",
);
assert.equal(
  notes[0].read_at,
  null,
  "reconciliation does not mutate incoming snapshot",
);
assert.equal(
  inbox.reconcile([]).length,
  0,
  "receipt does not reinsert removed messages",
);
assert.equal(
  inbox.reconcile([{ id: 1, read_at: "server" }])[0].read_at,
  "server",
  "server read timestamp wins",
);
await inbox.read(1);
assert.equal(requests.length, 2, "already confirmed read is not resubmitted");
pending = inbox.read(2);
source.open = false;
source.open = true;
requests[2].reject(Error("late error"));
await pending;
assert.equal(
  inbox.error.value,
  "",
  "old error does not pollute reopened sheet",
);
pending = inbox.read(2);
source.open = false;
requests[3].resolve({});
await pending;
assert.equal(
  confirmed.length,
  2,
  "same identity still accepts confirmed read after closing",
);
assert.ok(inbox.reconcile(notes)[1].read_at);
source.open = true;
source.token = "b";
source.memberId = 2;
assert.equal(
  inbox.reconcile(notes)[0].read_at,
  null,
  "identity change clears receipts",
);
pending = inbox.read(1);
source.invite = "OTHER";
requests[4].resolve({});
await pending;
assert.equal(confirmed.length, 2, "old room result ignored");
pending = inbox.read(1);
scope.stop();
requests[5].resolve({});
await pending;
assert.equal(confirmed.length, 2, "unmounted inbox ignores late success");
console.log(
  "Reminder inbox: duplicate prevention, retry, monotonic read receipt, unchanged input, no message resurrection, reopening, identity and disposal passed.",
);
