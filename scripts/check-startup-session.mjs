import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) || null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
const r = await build({
  entryPoints: ["frontend/src/interaction/persistentSession.ts"],
  bundle: true,
  write: false,
  format: "esm",
});
const m = await import(
  "data:text/javascript;base64," +
    Buffer.from(r.outputFiles[0].text).toString("base64")
);
let n = 0;
const check = (v, label) => {
  assert(v, label);
  n++;
  console.log("PASS " + label);
};
m.persistSessionToken("fixture-only");
sessionStorage = storage();
check(
  m.restoreSessionToken() === "fixture-only",
  "process-session recreation restores ordinary server token",
);
check(
  localStorage.getItem(m.persistentSessionKey) === "fixture-only",
  "temporary connection failure does not delete persisted token",
);
m.forgetSessionToken();
check(
  !m.restoreSessionToken(),
  "explicit logout removes persistent ordinary token",
);
localStorage.setItem("dorm-email-admin-grant", "email-fixture");
check(
  m.restoreSessionToken() === "email-fixture",
  "email grant uses same validated session restore",
);
localStorage.setItem(m.persistentSessionKey, "canonical-current");
sessionStorage.setItem("dorm-token", "stale-session-copy");
check(
  m.restoreSessionToken() === "canonical-current" &&
    sessionStorage.getItem("dorm-token") === "canonical-current",
  "durable token wins over a stale restored sessionStorage copy",
);
console.log(
  `${n} persistence checks passed; no native process or actual token used`,
);
// Exercise the actual API expiry path with a bounded transport fixture.
globalThis.window=new EventTarget();
let failure='network', requestToken='', rejectRace;
globalThis.fixtureRequest=async(_path,options)=>{
  requestToken=new Headers(options?.headers).get('Authorization')?.replace(/^Bearer /,'')||'';
  if(failure==='network')throw new TypeError('offline');
  if(failure==='valid')return {ok:true};
  if(failure==='race')return new Promise((_resolve,reject)=>{rejectRace=()=>reject(new globalThis.FixtureApiError(401,'expired'))});
  throw new globalThis.FixtureApiError(401,'expired');
};
let expiredEvents=0;window.addEventListener('auth-expired',()=>expiredEvents++);
const apiBuild=await build({entryPoints:['frontend/src/api/index.ts'],bundle:true,write:false,format:'esm',plugins:[{name:'transport-fixture',setup(b){b.onResolve({filter:/\.\/transport$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export class ApiError extends Error {constructor(status,message){super(message);this.status=status}};globalThis.FixtureApiError=ApiError;export const requestJson=(...args)=>globalThis.fixtureRequest(...args);`}))}}]});
const apiModule=await import('data:text/javascript;base64,'+Buffer.from(apiBuild.outputFiles[0].text).toString('base64'));
localStorage.removeItem('dorm-email-admin-grant');m.persistSessionToken('fresh-fixture');sessionStorage.setItem('dorm-token','stale-session-copy');failure='valid';await apiModule.api('/auth/me');
check(requestToken==='fresh-fixture'&&sessionStorage.getItem('dorm-token')==='fresh-fixture','API requests use the durable current token instead of stale restored tab state');
failure='network';
await apiModule.api('/auth/me').catch(()=>{});
check(localStorage.getItem(m.persistentSessionKey)==='fresh-fixture','actual API network failure retains persisted grant');
m.persistSessionToken('race-old');failure='race';const raced=apiModule.api('/auth/me').catch(()=>{});await Promise.resolve();localStorage.setItem(m.persistentSessionKey,'race-new');rejectRace();await raced;
check(localStorage.getItem(m.persistentSessionKey)==='race-new'&&expiredEvents===0,'late 401 from a replaced token cannot clear the newer login');
m.persistSessionToken('expiry-fixture');localStorage.setItem('dorm-email-admin-grant','stale-email-grant');sessionStorage.setItem('dorm-token','stale-session-copy');failure='expired';await apiModule.api('/auth/me').catch(()=>{});
check(!m.restoreSessionToken(),'actual API 401 clears every token alias so stale compatibility keys cannot restore a rejected session');
check(expiredEvents===1,'only a 401 for the current durable token emits auth-expired');
const originalLocal=localStorage,originalSession=sessionStorage;
globalThis.localStorage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')},removeItem(){throw new Error('blocked')},key(){return null},get length(){return 0}};
globalThis.sessionStorage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')},removeItem(){throw new Error('blocked')},key(){return null},get length(){return 0}};
check(m.restoreSessionToken()===null,'unavailable browser storage is treated as absent instead of crashing startup');
assert.doesNotThrow(()=>m.persistSessionToken('volatile-fixture'));
n++;console.log('PASS storage denial does not throw while persisting a session');
globalThis.localStorage=originalLocal;globalThis.sessionStorage=originalSession;
sessionStorage.setItem('dorm-token','legacy-getter-fallback');
const localDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('blocked property')}});
check(m.restoreSessionToken()==='legacy-getter-fallback','a throwing localStorage getter safely falls back to an available legacy token');
if(localDescriptor)Object.defineProperty(globalThis,'localStorage',localDescriptor);
else delete globalThis.localStorage;
console.log(`${n} total session checks passed`);

// Exercise the actual router guard with isolated Vue Router/session/email
// fixtures. A network-failed restoration must not present password login.
let guard;
const routeHarness = {
  session: {
    initialized: false,
    user: null,
    initCalls: 0,
    async init() {
      this.initCalls++;
    },
  },
  emailAccount: { required: false, loggedIn: false },
  refreshEmailAccount: async () => {},
  createRouter(options) {
    return {
      options,
      beforeEach(callback) {
        guard = callback;
      },
    };
  },
};
globalThis.__routeHarness = routeHarness;
const routerBuild = await build({
  entryPoints: ["frontend/src/router/index.ts"],
  bundle: true,
  write: false,
  format: "esm",
  define: { "import.meta.env.BASE_URL": JSON.stringify("/") },
  plugins: [
    {
      name: "startup-route-fixtures",
      setup(builder) {
        builder.onResolve({ filter: /\.vue$/ }, (args) => ({
          path: args.path,
          external: true,
        }));
        builder.onResolve({ filter: /^vue-router$/ }, () => ({
          path: "router",
          namespace: "route-fixture",
        }));
        builder.onLoad(
          { filter: /.*/, namespace: "route-fixture" },
          (args) => {
            if (args.path === "router")
              return {
                contents:
                  "export const createWebHistory=()=>({}); export const createRouter=(options)=>globalThis.__routeHarness.createRouter(options);",
              };
            if (args.path === "session")
              return {
                contents:
                  "export const useSession=()=>globalThis.__routeHarness.session;",
              };
            return {
              contents:
                "export const emailAccount=globalThis.__routeHarness.emailAccount; export const refreshEmailAccount=()=>globalThis.__routeHarness.refreshEmailAccount();",
            };
          },
        );
        builder.onResolve({ filter: /stores\/session/ }, () => ({
          path: "session",
          namespace: "route-fixture",
        }));
        builder.onResolve({ filter: /api\/email/ }, () => ({
          path: "email",
          namespace: "route-fixture",
        }));
      },
    },
  ],
});
await import(
  "data:text/javascript;base64," +
    Buffer.from(routerBuild.outputFiles[0].text).toString("base64")
);
const route = (path, isPublic = false) => ({
  path,
  fullPath: `${path}?tab=next`,
  meta: { public: isPublic },
});
routeHarness.session = {
  initialized: false,
  user: null,
  initCalls: 0,
  async init() {
    this.initCalls++;
  },
};
check(
  (await guard(route("/", true))) === undefined &&
    routeHarness.session.initCalls === 0,
  "public startup route remains available without running the protected-route guard",
);
routeHarness.session = {
  initialized: false,
  user: null,
  initCalls: 0,
  async init() {
    this.initCalls++;
  },
};
check(
  (await guard(route("/manage"))) === "/" &&
    routeHarness.session.initCalls === 1,
  "unresolved retained session returns to public recovery instead of password login",
);
check(
  (await guard(route("/admin/login", true))) === "/",
  "unresolved session cannot flash the login form",
);
routeHarness.session = { initialized: true, user: null, async init() {} };
const rejectedSessionRedirect = await guard(route("/manage"));
check(
  rejectedSessionRedirect.path === "/admin/login" &&
    rejectedSessionRedirect.query.next === "/manage?tab=next",
  "verified signed-out session still reaches the requested login flow",
);
routeHarness.session = { initialized: true, user: { id: 7 }, async init() {} };
check(
  (await guard(route("/manage"))) === undefined,
  "verified authenticated session can enter protected routes",
);
check(
  (await guard(route("/admin/login", true))) === "/dorm",
  "verified authenticated session skips the login page",
);
routeHarness.refreshEmailAccount = async () => { throw new Error("offline"); };
routeHarness.session = { initialized: true, user: null, async init() {} };
check(
  (await guard(route("/manage"))) === "/",
  "email-verification transport failure stays on the public recovery surface",
);
console.log("7 router recovery checks passed");
