import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
const result = await build({
  entryPoints: [
    new URL("../frontend/src/interaction/backgroundRefresh.ts", import.meta.url)
      .pathname,
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { createBackgroundRefresh, createPushSyncGate } = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
let clock = 0,
  calls = 0,
  finish;
const gate = createBackgroundRefresh(
  () => {
    calls++;
    return new Promise((resolve) => (finish = resolve));
  },
  () => clock,
);
const a = gate.run("foreground"),
  b = gate.run("foreground");
assert.equal(a, b);
await Promise.resolve();
assert.equal(calls, 1);
finish(true);
assert.equal(await a, true);
clock = 400;
assert.equal(await gate.run("foreground"), false);
assert.equal(calls, 1, "coalesce sequential foreground events");
clock = 10000;
let p = gate.run("poll");
await Promise.resolve();
assert.equal(calls, 2, "healthy polling retains ten-second interval");
finish(false);
await p;
clock = 20000;
await gate.run("poll");
assert.equal(calls, 2, "first failure backs off twenty seconds");
clock = 21000;
p = gate.run("foreground");
await Promise.resolve();
assert.equal(calls, 3, "foreground ignores polling backoff");
finish(false);
await p;
p = gate.run("online");
await Promise.resolve();
assert.equal(calls, 4, "online recovery is immediate even within burst window");
finish(false);
await p;
clock = 31000;
await gate.run("poll");
assert.equal(calls, 4);
clock = 32000;
gate.markSuccessful();
clock = 42000;
p = gate.run("poll");
await Promise.resolve();
assert.equal(calls, 5, "manual success resets backoff");
finish(true);
await p;
gate.dispose();
clock = 999999;
await gate.run("poll");
assert.equal(calls, 5);
// A cancelled older automatic read must not undo a newer manual success.
clock = 0;
let oldFinish,
  overlapCalls = 0;
const overlap = createBackgroundRefresh(
  () => {
    overlapCalls++;
    return new Promise((resolve) => (oldFinish = resolve));
  },
  () => clock,
);
let oldRead = overlap.run("poll");
await Promise.resolve();
clock = 5000;
overlap.markSuccessful();
oldFinish(false);
await oldRead;
clock = 15000;
oldRead = overlap.run("poll");
await Promise.resolve();
assert.equal(overlapCalls, 2);
oldFinish(true);
await oldRead;
let premature = 0;
const disposed = createBackgroundRefresh(async () => {
  premature++;
  return true;
});
const queued = disposed.run("foreground");
disposed.dispose();
await queued;
assert.equal(premature, 0, "unmounted queued reads do not start");
clock = 0;
let polls = 0;
const failing = createBackgroundRefresh(
  async () => {
    polls++;
    return false;
  },
  () => clock,
);
await failing.run("poll");
clock = 20000;
await failing.run("poll");
clock = 60000;
await failing.run("poll");
clock = 119999;
await failing.run("poll");
assert.equal(polls, 3);
clock = 120000;
await failing.run("poll");
assert.equal(polls, 4, "backoff caps at sixty seconds");
clock = 0;
const tokens = [];
let syncFinish;
const push = createPushSyncGate(
  (token) => {
    tokens.push(token);
    return new Promise((resolve) => (syncFinish = resolve));
  },
  () => clock,
);
let first = push.run("one");
assert.equal(first, push.run("one"));
await Promise.resolve();
assert.deepEqual(tokens, ["one"]);
syncFinish(true);
await first;
for (let i = 1; i < 6; i++) {
  clock = i * 10000;
  assert.equal(await push.run("one"), true);
}
assert.equal(
  tokens.length,
  1,
  "six board reads share one subscription sync per minute",
);
clock = 60000;
first = push.run("one");
await Promise.resolve();
assert.equal(tokens.length, 2);
syncFinish(true);
await first;
clock = 61000;
first = push.run("one", true);
await Promise.resolve();
assert.equal(tokens.length, 3, "native readiness bypasses cached result");
syncFinish(false);
await first;
first = push.run("two");
await Promise.resolve();
assert.equal(tokens.at(-1), "two", "new identity never uses old result");
syncFinish(true);
await first;
push.dispose();
assert.equal(await push.run("three"), false);
let failures = 0;
const retry = createPushSyncGate(async () => {
  failures++;
  throw Error("network");
});
await retry.run("one");
await retry.run("one");
assert.equal(
  failures,
  2,
  "failed device synchronization is retryable without cache delay",
);
console.log(
  "Background refresh: foreground coalescing, ten-second healthy cadence, backoff cap, immediate recovery, manual success, disposal and per-identity push synchronization passed.",
);

// A mobile suspend aborts the board read; resume must not reuse its flight.
clock = 0;
const resumeCalls = [];
const resumed = createBackgroundRefresh(
  () => new Promise((resolve) => resumeCalls.push(resolve)),
  () => clock,
);
const suspended = resumed.run("foreground");
await Promise.resolve();
resumed.interrupt();
const fresh = resumed.run("foreground");
await Promise.resolve();
assert.equal(resumeCalls.length, 2, "resume immediately starts a new flight");
resumeCalls[1](true);
await fresh;
resumeCalls[0](false);
await suspended;
clock = 500;
assert.equal(
  await resumed.run("foreground"),
  false,
  "old failure cannot undo the new successful burst window",
);
let hiddenQueuedCalls = 0;
const hiddenQueued = createBackgroundRefresh(async () => {
  hiddenQueuedCalls++;
  return true;
});
const queuedHidden = hiddenQueued.run("foreground");
hiddenQueued.interrupt();
await queuedHidden;
assert.equal(hiddenQueuedCalls, 0, "hidden queued read never starts");
resumed.dispose();
hiddenQueued.dispose();
console.log(
  "Background refresh suspend/resume and queued-read invalidation passed.",
);
