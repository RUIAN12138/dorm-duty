import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import {
  createPinia,
  setActivePinia,
} from "../frontend/node_modules/pinia/dist/pinia.mjs";
const requests = [];
globalThis.identityRequest = (path, options = {}) =>
  new Promise((resolve, reject) =>
    requests.push({ path, options, resolve, reject }),
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
globalThis.CustomEvent = class extends Event {
  constructor(type, options) {
    super(type);
    this.detail = options.detail;
  }
};
const external = {
  vue: new URL("../frontend/node_modules/vue/index.mjs", import.meta.url).href,
  pinia: new URL(
    "../frontend/node_modules/pinia/dist/pinia.mjs",
    import.meta.url,
  ).href,
};
const result = await build({
  stdin: {
    contents: `export {useSession} from './stores/session'; export {emailAccount,refreshEmailAccount,emailPost} from './api/email';`,
    resolveDir: new URL("../frontend/src", import.meta.url).pathname,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "identity-fixture",
      setup(b) {
        b.onResolve({ filter: /^(vue|pinia)$/ }, (args) => ({
          path: external[args.path],
          external: true,
        }));
        b.onResolve({ filter: /^\.\.\/api$/ }, () => ({
          path: "session-api",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /session-api/, namespace: "fixture" }, () => ({
          contents: `export const api=(path,options)=>globalThis.identityRequest(path,options);export const post=(path,data)=>globalThis.identityRequest(path,{data});`,
        }));
        b.onResolve({ filter: /^\.\/chores$/ }, () => ({
          path: "chores",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /chores/, namespace: "fixture" }, () => ({
          contents: `export const choreRequest=(path,token,options)=>globalThis.identityRequest(path,{...options,token});export const savedChoreToken=()=>'';export const saveChoreToken=()=>{};`,
        }));
        b.onResolve({ filter: /^\.\/logout$/ }, () => ({
          path: "logout",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /logout/, namespace: "fixture" }, () => ({
          contents: `export const logoutEvent='fixture-logout';export const pendingLogout=()=>false;export const logoutAll=async()=>{};`,
        }));
        b.onResolve({ filter: /^\.\/dormHistory$/ }, () => ({
          path: "history",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /history/, namespace: "fixture" }, () => ({
          contents: `export const forgetDorm=()=>{};`,
        }));
      },
    },
  ],
});
const { useSession, emailAccount, refreshEmailAccount, emailPost } =
  await import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
const tick = () => new Promise((resolve) => setImmediate(resolve));
setActivePinia(createPinia());
const session = useSession();
sessionStorage.setItem("dorm-token", "A");
let first = session.refresh(),
  second = session.refresh();
assert.equal(
  requests.length,
  2,
  "parallel consumers share one identity read pair",
);
assert.equal(requests[0].options.headers.Authorization, "Bearer A");
assert.equal(requests[1].options.headers.Authorization, "Bearer A");
requests[0].resolve({ id: 1, nickname: "A" });
await tick();
assert.equal(
  session.user,
  null,
  "half response does not commit mismatched pair",
);
requests[1].resolve({ id: 10, name: "room A" });
await Promise.all([first, second]);
assert.equal(session.user.id, 1);
assert.equal(session.dorm.id, 10);
first = session.refresh();
session.clear();
requests[2].resolve({ id: 1 });
requests[3].resolve({ id: 10 });
await first;
assert.equal(session.user, null, "logout blocks old response resurrection");
assert.equal(session.initialized, false);
sessionStorage.setItem("dorm-token", "A");
first = session.refresh();
sessionStorage.setItem("dorm-token", "B");
second = session.refresh();
assert.equal(
  session.user,
  null,
  "identity switch clears old snapshot before awaiting new response",
);
requests[6].resolve({ id: 2 });
requests[7].resolve({ id: 20 });
await second;
requests[4].resolve({ id: 1 });
requests[5].resolve({ id: 10 });
await first;
assert.equal(session.user.id, 2);
assert.equal(session.dorm.id, 20);
// Initialized state is scoped to the token, not forever true after a first login.
sessionStorage.setItem("dorm-token", "C");
const init = session.init();
assert.equal(requests.length, 10);
requests[8].resolve({ id: 3 });
requests[9].resolve(null);
await init;
assert.equal(session.user.id, 3);
assert.equal(session.dorm, null);
first = session.refresh();
requests[10].resolve({ id: 4 });
requests[11].reject(Error("temporary"));
await assert.rejects(first, /temporary/);
assert.equal(
  session.user.id,
  3,
  "failed pair retains earlier complete snapshot",
);
session.clear();
sessionStorage.setItem("dorm-token", "D");
const oldInit = session.init();
session.clear();
requests[12].resolve({ id: 4 });
requests[13].resolve({ id: 40 });
await oldInit;
assert.equal(session.user, null);
assert.equal(
  session.initialized,
  false,
  "cancelled initialization stays uninitialized",
);
const login = session.login("fixture", "fixture");
session.clear();
requests[14].resolve({ access_token: "cancelled-login" });
assert.equal(
  await login,
  false,
  "cancelled login suppresses success navigation",
);
assert.equal(
  sessionStorage.getItem("dorm-token"),
  null,
  "late login cannot undo logout",
);
// A guard waiting on one token follows a replacement token before it returns.
sessionStorage.setItem("dorm-token", "E");
let start = requests.length;
const switchedInit = session.init();
sessionStorage.setItem("dorm-token", "F");
requests[start].resolve({ id: 5 });
requests[start + 1].resolve({ id: 50 });
await tick();
assert.equal(requests.length, start + 4);
requests[start + 2].resolve({ id: 6 });
requests[start + 3].resolve({ id: 60 });
await switchedInit;
assert.equal(session.user.id, 6);
assert.equal(session.dorm.id, 60);
sessionStorage.removeItem("dorm-token");
await session.init();
assert.equal(session.user, null);
assert.equal(session.dorm, null);
requests.length = 0;
let r1 = refreshEmailAccount(),
  r2 = refreshEmailAccount();
assert.equal(
  requests.length,
  2,
  "email panel and router share config/account request",
);
requests[0].resolve({ available: true, registration_required: true });
requests[1].resolve({ logged_in: true, email: "old@example.test", rooms: [] });
await Promise.all([r1, r2]);
assert.equal(emailAccount.email, "old@example.test");
r1 = refreshEmailAccount();
const mutation = emailPost("verify", {});
assert.equal(requests.length, 5);
requests[4].resolve({});
await mutation;
r2 = refreshEmailAccount();
assert.equal(
  requests.length,
  7,
  "successful identity mutation invalidates pending snapshot",
);
requests[5].resolve({ available: true, registration_required: true });
requests[6].resolve({ logged_in: true, email: "new@example.test", rooms: [] });
await r2;
requests[2].resolve({ available: true, registration_required: true });
requests[3].resolve({ logged_in: false });
await r1;
assert.equal(
  emailAccount.email,
  "new@example.test",
  "older account snapshot cannot overwrite verified identity",
);
r1 = refreshEmailAccount();
window.dispatchEvent(new Event("fixture-logout"));
requests[7].resolve({ available: true, registration_required: true });
requests[8].resolve({ logged_in: true, email: "old@example.test" });
await r1;
assert.equal(emailAccount.loggedIn, false);
assert.equal(emailAccount.email, "", "logout invalidates late account read");
r1 = refreshEmailAccount();
requests[9].reject(Error("network"));
requests[10].resolve({ logged_in: false });
await assert.rejects(r1, /network/);
r1 = refreshEmailAccount();
assert.equal(requests.length, 13, "failed shared read is retryable");
requests[11].resolve({ available: true, registration_required: true });
requests[12].resolve({ logged_in: false });
await r1;
console.log(
  "Identity races: shared requests, atomic snapshots, stale token, initialization, logout/login cancellation, email mutation invalidation and retry passed.",
);
