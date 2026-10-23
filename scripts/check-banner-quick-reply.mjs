// Read-intent protocol checks using real Vue scopes and deferred HTTP mocks.
// No browser, production account or live notification service is involved.
import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import {
  reactive,
  ref,
  effectScope,
  nextTick,
} from "../frontend/node_modules/vue/index.mjs";
const requests = [],
  storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, v),
  removeItem: (k) => storage.delete(k),
};
globalThis.bannerInboxRequest = (v) =>
  new Promise((resolve, reject) => requests.push({ ...v, resolve, reject }));
const bundle = await build({
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
      name: "isolated-inbox",
      setup(b) {
        b.onResolve({ filter: /^vue$/ }, () => ({
          path: new URL(
            "../frontend/node_modules/vue/index.mjs",
            import.meta.url,
          ).href,
          external: true,
        }));
        b.onResolve({ filter: /api\/chores$/ }, () => ({
          path: "api",
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents:
            "export const choreRequest=(path,token,options)=>globalThis.bannerInboxRequest({path,token,options});",
        }));
      },
    },
  ],
});
const { useReminderInbox } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const checks = [];
const check = (v, label) => {
  assert(v, label);
  checks.push(label);
  console.log("PASS " + label);
};
const s = reactive({
    open: false,
    token: "token-a",
    invite: "ROOM",
    memberId: 1,
  }),
  busy = ref("");
let inbox, scope;
const confirmed = [];
function mount() {
  scope = effectScope();
  scope.run(
    () =>
      (inbox = useReminderInbox(() => ({ ...s }), busy, {
        confirmed: (...args) => confirmed.push(args),
      })),
  );
}
const tick = async () => {
  await nextTick();
  await Promise.resolve();
};
mount();
await inbox.read(10);
check(requests.length === 0, "closed details never become a read action");
let pending = inbox.read(10, true);
await tick();
check(
  requests.length === 1,
  "explicit captured banner ID can request read without opening details",
);
requests[0].reject(Error("offline receipt"));
await pending;
check(
  !inbox.reconcile([{ id: 10, read_at: null }])[0].read_at,
  "failed server receipt never becomes optimistic read_at",
);
check(
  typeof inbox.retryPending === "function",
  "banner receipt controller exposes an explicit retry drain",
);
const before = requests.length;
// Advance only the fake wall-clock deadline; production retry remains bounded.
const realNow = Date.now;
let clock = realNow() + 4000;
Date.now = () => clock;
pending = inbox.retryPending();
await tick();
check(
  requests.length === before + 1,
  "failed banner intent remains retryable after banner removal",
);
requests.at(-1).resolve({ read_at: "2026-10-23T03:00:00.000Z" });
await pending;
check(
  inbox.reconcile([{ id: 10, read_at: null }])[0].read_at ===
    "2026-10-23T03:00:00.000Z",
  "retry commits only the exact server timestamp",
);
const count = requests.length;
check(
  (await inbox.read(10, true)) === true && requests.length === count,
  "already confirmed read is a successful no-op",
);
busy.value = "other-board-action";
pending = inbox.read(11, true);
await tick();
check(
  requests.at(-1).path.endsWith("/11/read"),
  "busy board never swallows the explicit captured banner read intent",
);
requests.at(-1).resolve({ read_at: "2026-10-23T03:00:01.000Z" });
await pending;
check(
  busy.value === "other-board-action",
  "idempotent banner receipt never clears another operation's busy state",
);
busy.value = "";
check(
  confirmed.some(([id]) => id === 11),
  "read reports the confirmed original ID",
);
pending = inbox.read(12, true);
await tick();
requests.at(-1).resolve({});
await pending;
check(
  !inbox.reconcile([{ id: 12, read_at: null }])[0].read_at,
  "missing read_at is not replaced by a fabricated client timestamp",
);
// A successful server read from another device is authoritative even if a
// transport retry is still pending locally.
const server = "2026-10-23T03:00:02.000Z";
const merged = inbox.reconcile([{ id: 12, read_at: server }]);
check(
  merged[0].read_at === server,
  "fresh server read status wins during reconciliation",
);
// A late response from a revoked identity may not mutate another member.
pending = inbox.read(13, true);
check(
  inbox.pendingIds().includes(13),
  "explicit read intent is durable before session expiry can interrupt its response",
);
await tick();
const stale = requests.at(-1);
s.token = "token-b";
s.memberId = 2;
await tick();
stale.resolve({ read_at: "2026-10-23T03:00:03.000Z" });
await pending;
check(
  !confirmed.some(([id]) => id === 13),
  "late old-identity success cannot update the new member",
);
const beforeNew = requests.length;
await inbox.retryPending();
await tick();
check(
  requests.length === beforeNew,
  "old member queue is never retried under another member identity",
);
// A queue may persist as member-scoped IDs, but must never persist secrets.
pending = inbox.read(14, true);
await tick();
requests.at(-1).reject(Error("second offline"));
await pending;
check(
  ![...storage.values()].join("").includes("token-"),
  "pending receipt storage never includes bearer tokens",
);
scope.stop();
s.token = "token-c";
await tick();
mount();
const resumed = inbox.retryPending();
await tick();
check(
  requests.at(-1).path.endsWith("/14/read") &&
    requests.at(-1).token === "token-c",
  "same member can resume pending receipt using only the new current credential",
);
requests.at(-1).resolve({ read_at: "2026-10-23T03:00:04.000Z" });
await resumed;
scope.stop();
// The reply transport captures token, room, member and original message ID.
const replyBundle = await build({
  entryPoints: [
    new URL(
      "../frontend/src/composables/useBannerQuickReply.ts",
      import.meta.url,
    ).pathname,
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "reply-api-fixture",
      setup(b) {
        b.onResolve({ filter: /^vue$/ }, () => ({
          path: new URL(
            "../frontend/node_modules/vue/index.mjs",
            import.meta.url,
          ).href,
          external: true,
        }));
        b.onResolve({ filter: /api\/chores$/ }, () => ({
          path: "reply-api",
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents:
            "export const choreRequest=(path,token,options)=>globalThis.bannerInboxRequest({path,token,options});",
        }));
      },
    },
  ],
});
const { useBannerQuickReply, bannerReplyTarget } = await import(
  "data:text/javascript;base64," +
    Buffer.from(replyBundle.outputFiles[0].text).toString("base64")
);
const rs = reactive({
  token: "reply-a",
  invite: "ROOM",
  memberId: 1,
  members: [
    { user_id: 1, nickname: "本人" },
    { user_id: 2, nickname: "张三" },
    { user_id: 3, nickname: "李四" },
  ],
});
let reply;
const sent = [],
  notices = [];
const replyScope = effectScope();
replyScope.run(
  () =>
    (reply = useBannerQuickReply(() => ({ ...rs }), {
      sent: (id) => sent.push(id),
      notice: (m) => notices.push(m),
    })),
);
const note = {
  id: 21,
  source: "note",
  sender_id: 2,
  sender_name: "张三",
  read_at: null,
};
check(reply.open(note), "valid incoming sender opens inline draft");
reply.setDraft("旧会话中的回复");
const oldSend = reply.send(21);
await tick();
const oldRequest = requests.at(-1);
const beforeDouble = requests.length;
await reply.send(21);
check(
  requests.length === beforeDouble,
  "reply state synchronously locks duplicate sends",
);
rs.token = "reply-b";
await tick();
reply.open(note);
reply.setDraft("新会话草稿不能被旧回执清掉");
oldRequest.resolve({ id: 100 });
await oldSend;
check(
  reply.draft.value === "新会话草稿不能被旧回执清掉" && sent.length === 0,
  "old-token success cannot close or acknowledge a reopened panel under a new credential",
);
reply.cancel(21);
check(
  !reply.open({ ...note, source: "scheduled" }) && !reply.editing.value,
  "system reminders cannot create a reply target",
);
check(
  bannerReplyTarget({ ...note, sender_id: 1 }, rs) === null &&
    bannerReplyTarget({ ...note, sender_id: 999 }, rs) === null,
  "self and unknown-room senders are rejected",
);
reply.open({ ...note, id: 22, sender_id: 3 });
reply.setDraft("广播留言只回给发送者");
const failed = reply.send(22);
await tick();
const failedRequest = requests.at(-1);
check(
  JSON.parse(failedRequest.options.body).target_member_id === 3,
  "broadcast-origin note replies privately to its actual author",
);
failedRequest.reject(Error("reply offline"));
await failed;
check(
  reply.phase.value === "failed" &&
    reply.draft.value === "广播留言只回给发送者" &&
    sent.length === 0,
  "failed reply retains draft and never emits delivery success",
);
const retried = reply.send(22);
await tick();
requests.at(-1).resolve({ id: 101 });
await retried;
check(
  sent.length === 1 && sent[0] === 22 && !reply.editing.value,
  "confirmed send reports only the captured original incoming message ID",
);
replyScope.stop();
Date.now = realNow;
console.log(
  JSON.stringify({
    passed: checks.length,
    checks,
    scope: "in-memory Vue and deferred read endpoint; not device acceptance",
  }),
);
