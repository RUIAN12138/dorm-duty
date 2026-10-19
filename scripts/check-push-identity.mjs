import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
const result = await build({
  entryPoints: ["frontend/src/api/memberPush.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "push-fixture",
      setup(b) {
        b.onResolve(
          { filter: /^\.\/(nativePush|chores|index|push)$/ },
          (args) => ({ path: args.path, namespace: "fixture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents:
            args.path === "./nativePush"
              ? `export const hasNativePush=()=>false;export const nativePush=()=>Promise.reject(Error('unexpected native'));`
              : args.path === "./push"
                ? `export const pushCapability=()=>({supported:true,ios:false});`
                : args.path === "./index"
                  ? `export class ApiError extends Error {}`
                  : `export const choreRequest=(path,token,options)=>globalThis.pushRequest(path,token,options);`,
        }));
      },
    },
  ],
});
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = { isSecureContext: true };
globalThis.Notification = {
  permission: "granted",
  requestPermission: async () => "granted",
};
let registration,
  subRead,
  unsubscribed = 0;
const writes = [];
const sub = {
  toJSON: () => ({ endpoint: "local-endpoint", keys: {} }),
  options: {},
  unsubscribe: async () => {
    unsubscribed++;
    return true;
  },
};
const reg = {
  active: true,
  pushManager: {
    getSubscription: () => (subRead ? subRead() : Promise.resolve(sub)),
  },
};
Object.defineProperty(globalThis, "navigator", {
  value: {
    serviceWorker: {
      getRegistration: () =>
        registration ? registration() : Promise.resolve(reg),
    },
  },
  configurable: true,
});
globalThis.pushRequest = async (...args) => {
  writes.push(args);
  return {};
};
const api = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
await api.syncMemberPush("old");
let release;
registration = () => new Promise((resolve) => (release = resolve));
let pending = api.disableMemberPush("old");
await new Promise((resolve) => setImmediate(resolve));
const change = api.syncMemberPush("new");
release(reg);
await assert.rejects(pending, /身份已切换/);
await change;
assert.equal(writes.length, 0);
assert.equal(
  unsubscribed,
  0,
  "old disable does not unsubscribe current device",
);
registration = null;
pending = api.testMemberPush("new");
const next = api.syncMemberPush("third");
await assert.rejects(pending, /身份已切换/);
await next;
assert.equal(writes.length, 0, "queued old test cannot send");
await api.syncMemberPush("old");
subRead = () => new Promise((resolve) => (release = resolve));
pending = api.enableMemberPush("old", { available: true, public_key: "AQID" });
await new Promise((resolve) => setImmediate(resolve));
const changed = api.syncMemberPush("new");
release(sub);
await assert.rejects(pending, /身份已切换/);
await changed;
assert.equal(
  writes.length,
  0,
  "old enable cannot bind device after identity changes",
);
subRead = null;
await api.disableMemberPush("new");
assert.equal(writes[0][0], "/chores/push/unsubscribe");
assert.equal(writes[0][1], "new");
assert.equal(unsubscribed, 1);
await api.testMemberPush("new");
assert.equal(writes[1][0], "/chores/push/test");
console.log(
  "Push identity: pending disable, queued test, delayed enable and current-identity operations passed (no real push).",
);
