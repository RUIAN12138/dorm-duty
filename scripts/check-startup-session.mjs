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
console.log(
  `${n} persistence checks passed; no native process or actual token used`,
);
// Exercise the actual API expiry path with a bounded transport fixture.
globalThis.window=new EventTarget();
let failure='network';
globalThis.fixtureRequest=async()=>{if(failure==='network')throw new TypeError('offline');throw new globalThis.FixtureApiError(401,'expired')};
const apiBuild=await build({entryPoints:['frontend/src/api/index.ts'],bundle:true,write:false,format:'esm',plugins:[{name:'transport-fixture',setup(b){b.onResolve({filter:/\.\/transport$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export class ApiError extends Error {constructor(status,message){super(message);this.status=status}};globalThis.FixtureApiError=ApiError;export const requestJson=(...args)=>globalThis.fixtureRequest(...args);`}))}}]});
const apiModule=await import('data:text/javascript;base64,'+Buffer.from(apiBuild.outputFiles[0].text).toString('base64'));
localStorage.removeItem('dorm-email-admin-grant');m.persistSessionToken('expiry-fixture');
await apiModule.api('/auth/me').catch(()=>{});
check(localStorage.getItem(m.persistentSessionKey)==='expiry-fixture','actual API network failure retains persisted grant');
failure='expired';await apiModule.api('/auth/me').catch(()=>{});
check(!localStorage.getItem(m.persistentSessionKey)&&!sessionStorage.getItem('dorm-token'),'actual API 401 revokes cached grant rather than restoring it next launch');
console.log(`${n} total session checks passed`);
