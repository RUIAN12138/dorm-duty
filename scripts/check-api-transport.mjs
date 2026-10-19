import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
const result = await build({
  stdin: {
    contents: `export {api,ApiError} from './index'; export {choreRequest} from './chores'; export {guestApi} from './guest'; export {networkState} from './network';`,
    resolveDir: new URL("../frontend/src/api", import.meta.url).pathname,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "isolate-network",
      setup(b) {
        b.onResolve({ filter: /^\.\/network$/ }, () => ({
          path: "network",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: "export const networkState = {unreachable:false};",
        }));
        b.onResolve({ filter: /^\.\/path$/ }, () => ({
          path: "path",
          namespace: "paths",
        }));
        b.onLoad({ filter: /.*/, namespace: "paths" }, () => ({
          contents: "export const appPath = p => p;",
        }));
      },
    },
  ],
});
const { api, ApiError, choreRequest, guestApi, networkState } = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const storage = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
};
globalThis.sessionStorage = storage();
globalThis.localStorage = storage();
globalThis.window = new EventTarget();
Object.defineProperty(globalThis, "navigator", {
  value: { onLine: true },
  configurable: true,
});
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let calls = 0;
globalThis.fetch = async (path, options) => {
  calls++;
  assert.equal(options.credentials, "same-origin");
  assert.equal(options.cache, "no-store");
  assert.equal(options.headers.get("X-Test"), "yes");
  assert.equal(options.headers.get("Authorization"), "Bearer member");
  return json({ ok: true });
};
assert.deepEqual(
  await choreRequest("/test", "member", {
    headers: new Headers({ "X-Test": "yes" }),
  }),
  { ok: true },
);
const cancelled = new AbortController();
cancelled.abort();
networkState.unreachable = false;
globalThis.fetch = async (_, options) => {
  assert.equal(options.signal.aborted, true);
  throw new DOMException("Cancelled", "AbortError");
};
await assert.rejects(api("/cancel", { signal: cancelled.signal }), {
  name: "AbortError",
});
assert.equal(networkState.unreachable, false);
networkState.unreachable = true;
await assert.rejects(guestApi("/guest/dorm", {}, cancelled.signal), {
  name: "AbortError",
});
assert.equal(networkState.unreachable, true);
const controller = new AbortController();
globalThis.fetch = (_, options) =>
  new Promise((resolve, reject) => {
    options.signal.addEventListener(
      "abort",
      () => reject(new DOMException("Cancelled", "AbortError")),
      { once: true },
    );
    queueMicrotask(() => controller.abort());
  });
await assert.rejects(
  choreRequest("/cancel", "", { signal: controller.signal }),
  { name: "AbortError" },
);
assert.equal(networkState.unreachable, true);
let expired = 0;
window.addEventListener("auth-expired", () => expired++);
sessionStorage.setItem("dorm-token", "admin");
localStorage.setItem("dorm-email-admin-grant", "admin");
globalThis.fetch = async () => json({ detail: { message: "身份已过期" } }, 401);
await assert.rejects(
  choreRequest("/chores/board", "member"),
  (e) => e instanceof ApiError && e.status === 401,
);
assert.equal(expired, 0);
assert.equal(sessionStorage.getItem("dorm-token"), "admin");
await assert.rejects(api("/dorms/me"), (e) => e.message === "身份已过期");
assert.equal(expired, 1);
assert.equal(sessionStorage.getItem("dorm-token"), null);
// A delayed 401 from the previous identity must not sign out the new one.
sessionStorage.setItem("dorm-token", "old");
localStorage.setItem("dorm-email-admin-grant", "new");
let resolveOld;
globalThis.fetch = () => new Promise((resolve) => (resolveOld = resolve));
const stale = api("/auth/me");
sessionStorage.setItem("dorm-token", "new");
resolveOld(json({ detail: { message: "old expired" } }, 401));
await assert.rejects(stale, (e) => e.status === 401);
assert.equal(sessionStorage.getItem("dorm-token"), "new");
assert.equal(localStorage.getItem("dorm-email-admin-grant"), "new");
assert.equal(expired, 1, "stale expiry emits no current-session event");
globalThis.fetch = async () =>
  new Response("<html>proxy error</html>", { status: 200 });
await assert.rejects(
  choreRequest("/bad"),
  (e) => e instanceof ApiError && e.message.includes("响应异常"),
);
assert.equal(networkState.unreachable, false);
// /dorms/current legitimately returns JSON null before a dorm is joined.
globalThis.fetch = async () => json(null);
assert.equal(await api("/dorms/current"), null);
globalThis.fetch = async () => json(false);
assert.equal(await choreRequest("/boolean"), false);
globalThis.fetch = async () => new Response(null, { status: 204 });
assert.equal(await choreRequest("/empty"), null);
globalThis.fetch = async () => {
  throw new TypeError("Failed to fetch");
};
await assert.rejects(api("/offline"), /连接服务失败/);
assert.equal(networkState.unreachable, true);
navigator.onLine = false;
await assert.rejects(choreRequest("/offline"), /当前离线/);
console.log(
  "API transport: headers, cancellation before/during fetch, network state, scoped 401, invalid JSON, 204, offline passed.",
);

// Exercise the deadline without a real 15-second wait, including response bodies.
navigator.onLine = true;
const realTimeout = globalThis.setTimeout,
  realClear = globalThis.clearTimeout;
let deadline;
globalThis.setTimeout = (callback) => {
  deadline = callback;
  return 1;
};
globalThis.clearTimeout = () => {};
try {
  globalThis.fetch = (_, options) =>
    new Promise((resolve, reject) =>
      options.signal.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      ),
    );
  let operation = choreRequest("/timeout");
  deadline();
  await assert.rejects(operation, /请求超时/);
  assert.equal(networkState.unreachable, true);
  globalThis.fetch = async (_, options) => ({
    ok: true,
    status: 200,
    json: () =>
      new Promise((resolve, reject) =>
        options.signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        ),
      ),
  });
  operation = choreRequest("/slow-body");
  await new Promise((resolve) => setImmediate(resolve));
  deadline();
  await assert.rejects(operation, /请求超时/);
  const cancelDeadline = new AbortController();
  operation = choreRequest("/cancel-timeout", "", {
    signal: cancelDeadline.signal,
  });
  await new Promise((resolve) => setImmediate(resolve));
  cancelDeadline.abort();
  await assert.rejects(operation, { name: "AbortError" });
} finally {
  globalThis.setTimeout = realTimeout;
  globalThis.clearTimeout = realClear;
}
console.log(
  "API timeout: fetch/body deadlines and caller cancellation precedence passed.",
);
