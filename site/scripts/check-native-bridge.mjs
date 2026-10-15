import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "dorm-native-bridge-"),
);
let assertions = 0;
const eq = (a, b) => {
  assertions++;
  assert.deepEqual(a, b);
};
const originalTimeout = globalThis.setTimeout;
const originalClear = globalThis.clearTimeout;
const timers = new Map();
let timerId = 0;
globalThis.window = new EventTarget();
globalThis.setTimeout = (callback) => {
  const id = ++timerId;
  timers.set(id, callback);
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
const messages = [];
function port() {
  return {
    onmessage: null,
    postMessage(value) {
      messages.push(JSON.parse(value));
    },
  };
}
function reply(device, request, result = {}) {
  device.onmessage({
    data: JSON.stringify({
      id: request.id,
      ok: true,
      configured: true,
      enabled: true,
      platform: "harmony",
      ...result,
    }),
  });
}
try {
  await build({
    entryPoints: [
      new URL("../../frontend/src/api/nativePush.ts", import.meta.url).pathname,
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(directory, "bridge.mjs"),
  });
  await build({
    stdin: {
      contents: await fs.readFile(
        new URL(
          "../../native/harmony/entry/src/main/ets/PageLoadState.ets",
          import.meta.url,
        ),
        "utf8",
      ),
      loader: "ts",
    },
    platform: "node",
    format: "esm",
    outfile: path.join(directory, "load.mjs"),
  });
  const { nativePush, hasNativePush, onNativePushReady } = await import(
    pathToFileURL(path.join(directory, "bridge.mjs"))
  );
  const { PageLoadState } = await import(
    pathToFileURL(path.join(directory, "load.mjs"))
  );
  eq(hasNativePush(), false);
  await assert.rejects(nativePush("status"), /尚未就绪/);
  assertions++;
  let ready = 0;
  const remove = onNativePushReady(() => ready++);
  window.dispatchEvent(new Event("dorm-native-ready"));
  eq(ready, 0);
  const first = port();
  window.DormNativePush = first;
  window.dispatchEvent(new Event("dorm-native-ready"));
  eq(ready, 1);
  remove();
  window.dispatchEvent(new Event("dorm-native-ready"));
  eq(ready, 1);
  eq(hasNativePush(), true);
  const status = nativePush("status");
  const request = messages.at(-1);
  eq(request.command, "status");
  eq(timers.size, 1);
  first.onmessage({ data: "invalid-json" });
  reply(first, { id: "unrelated" });
  eq(timers.size, 1);
  reply(first, request);
  eq((await status).platform, "harmony");
  eq(timers.size, 0);
  const denied = nativePush("enable", "test-member");
  const deniedAssertion = assert.rejects(denied, /系统设置/);
  eq(messages.at(-1).token, "test-member");
  reply(first, messages.at(-1), {
    ok: false,
    message: "请在系统设置中允许通知",
  });
  await deniedAssertion;
  assertions++;
  eq(timers.size, 0);
  const old = nativePush("sync", "old-member");
  const oldRequest = messages.at(-1);
  const oldAssertion = assert.rejects(old, /页面已切换/);
  const second = port();
  window.DormNativePush = second;
  const current = nativePush("sync", "new-member");
  const currentRequest = messages.at(-1);
  await oldAssertion;
  assertions++;
  eq(timers.size, 1);
  reply(first, oldRequest);
  eq(timers.size, 1);
  reply(second, currentRequest, { enabled: false });
  eq((await current).enabled, false);
  eq(timers.size, 0);
  const timeout = nativePush("test", "test-member");
  const timeoutAssertion = assert.rejects(timeout, /连接超时/);
  timers.values().next().value();
  await timeoutAssertion;
  assertions++;
  timers.clear();
  window.DormNativePush = {
    onmessage: null,
    postMessage() {
      throw new Error("closed");
    },
  };
  await assert.rejects(nativePush("status"), /连接失败/);
  assertions++;
  eq(timers.size, 0);

  const home = "https://8.148.190.114/dorm-duty/",
    water = home + "water";
  const load = new PageLoadState(home);
  load.begin(home);
  eq(load.fail(home), true);
  eq(load.finish(home), false);
  load.begin(water);
  eq(load.fail(home), false);
  eq(load.finish(home), false);
  eq(load.fail(water), true);
  eq(load.finish(water), false);
  load.begin(load.url);
  eq(load.url, water);
  eq(load.finish(water), true);
  eq(load.fail(water), false);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        assertions,
        scope:
          "late native readiness; pending bridge replies, replacement, denial and timeout; Harmony main-frame retry state",
        excludes: "installed device UI and real push delivery",
      },
      null,
      2,
    ),
  );
} finally {
  globalThis.setTimeout = originalTimeout;
  globalThis.clearTimeout = originalClear;
  delete globalThis.window;
  await fs.rm(directory, { recursive: true, force: true });
}
