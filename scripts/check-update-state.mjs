// Failure/race checks against the real update state machine; not a browser test.
import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
const output = await build({
  entryPoints: [
    new URL("../frontend/src/interaction/appUpdates.ts", import.meta.url)
      .pathname,
  ],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  define: {
    "import.meta.env.BASE_URL": '"/dorm-duty/"',
    "import.meta.env.VITE_RELEASE_VERSION": '"release-v1"',
  },
  plugins: [
    {
      name: "external-vue",
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
let online = true,
  reloads = 0,
  reads = 0,
  updates = 0,
  release = "release-v1",
  fail = false,
  finishRead;
const reg = {
  active: {},
  waiting: null,
  installing: null,
  update: async () => {
    updates++;
  },
};
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    get onLine() {
      return online;
    },
    serviceWorker: {
      controller: {},
      getRegistration: async (scope) => {
        assert.equal(scope, "/dorm-duty/");
        return reg;
      },
    },
  },
});
globalThis.window = {
  location: {
    reload() {
      reloads++;
    },
  },
};
globalThis.fetch = async (url, options) => {
  reads++;
  assert.equal(url, "/dorm-duty/health");
  assert.equal(options.cache, "no-store");
  if (finishRead) await new Promise((r) => (finishRead = r));
  return {
    ok: !fail,
    json: async () =>
      fail ? { detail: "unavailable" } : { release: { version: release } },
  };
};
const m = await import(
  "data:text/javascript;base64," +
    Buffer.from(output.outputFiles[0].text).toString("base64")
);
m.configureUpdates({ registration: reg });
await m.checkForUpdates();
assert.equal(m.updatePhase.value, "current");
assert.equal(reloads, 0);
fail = true;
await m.checkForUpdates();
assert.equal(m.updatePhase.value, "error");
assert.equal(reloads, 0);
fail = false;
online = false;
await m.checkForUpdates();
assert.match(m.updateError.value, /离线/);
online = true;
const before = reads;
finishRead = true;
const a = m.checkForUpdates(),
  b = m.checkForUpdates();
assert.equal(a, b);
assert.equal(reads, before + 1);
finishRead();
finishRead = null;
await a;
class Worker extends EventTarget {
  state = "installed";
  mode = "reject";
  postMessage(message) {
    assert.equal(message.type, "SKIP_WAITING");
    queueMicrotask(() => {
      this.state = this.mode === "reject" ? "redundant" : "activated";
      this.dispatchEvent(new Event("statechange"));
    });
  }
}
release = "release-v2";
reg.waiting = new Worker();
await m.checkForUpdates();
assert.equal(m.updateReady.value, true);
assert.equal(m.updatePhase.value, "available");
await assert.rejects(m.installUpdate(), /更新失败/);
assert.equal(
  reloads,
  0,
  "failed activation never reloads or claims installation",
);
assert.equal(m.updatePhase.value, "available");
assert.match(m.updateError.value, /更新失败/);
reg.waiting = new Worker();
reg.waiting.mode = "success";
await m.installUpdate();
assert.equal(reloads, 1, "reload waits for the worker to activate");
assert(updates >= 3);
console.log(
  "Update state: fresh reads, duplicate coalescing, offline/failure retry, activation failure and successful activation-before-reload passed.",
);
