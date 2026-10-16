import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dorm-harmony-basic-"));
const originalNow = Date.now, originalTimeout = globalThis.setTimeout;
const originalStorage = globalThis.AppStorage;
let checks = 0, now = 0;
const eq = (a, b) => { checks++; assert.deepEqual(a, b); };
const sdk = {
  calls: [], initCount: 0, failInit: false, registration: [], callback: null,
  record(name, value) { this.calls.push([name, value]); },
};
globalThis.__dormPushTestSdk = sdk;
const routes = [], stored = new Map();
globalThis.AppStorage = { setOrCreate(key, value) { stored.set(key, value); } };
Date.now = () => now;
globalThis.setTimeout = (callback, delay) => { now += delay; callback(); return 1; };
try {
  await build({
    entryPoints: [new URL("../../native/harmony/entry/src/main/ets/BasicPush.ets", import.meta.url).pathname],
    bundle: true, platform: "node", format: "esm", outfile: path.join(directory, "push.mjs"),
    loader: { ".ets": "ts" },
    resolveExtensions: [".ets", ".ts", ".js"],
    plugins: [{ name: "mock-sdk", setup(builder) {
      builder.onResolve({ filter: /^@jg\/push$/ }, () => ({ path: "sdk", namespace: "mock" }));
      builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: `
        const sdk = globalThis.__dormPushTestSdk;
        export class CallBackMsg {}
        export const JPushInterface = {
          setContext: value => sdk.record('context', !!value),
          setAppKey: value => sdk.record('appKeyConfigured', value.length === 24),
          setDebug: value => sdk.record('debug', value),
          setChannel: value => sdk.record('channel', value),
          setUserRequestNotificationPermission: (_,value) => sdk.record('manualPermission',value),
          setBackgroundEnable: value => sdk.record('keepConnection', value),
          setSmartPushEnable: (_,value) => sdk.record('smartPush',value),
          setDataInsightsEnable: async (_,value) => sdk.record('insights',value),
          setCallBackMsg: value => { sdk.callback=value; },
          init: async () => { sdk.initCount++; if(sdk.failInit) throw Error('mock network failure'); },
          resumePush: () => sdk.record('resume',true),
          getRegistrationId: async () => sdk.registration.shift() || '',
        };
      ` }));
    } }],
  });
  const { BasicPush } = await import(pathToFileURL(path.join(directory, "push.mjs")));
  const application = {};
  const context = { getApplicationContext: () => application, eventHub: { emit: (...args) => routes.push(args) } };
  BasicPush.configure(application);
  BasicPush.configure(application);
  eq(sdk.initCount, 0); // Configuration must not opt the user into the SDK.
  eq(sdk.calls.filter(([name]) => name === "keepConnection"), [["keepConnection", true]]);
  eq(sdk.calls.filter(([name]) => name === "manualPermission"), [["manualPermission", true]]);
  eq(sdk.calls.filter(([name]) => name === "smartPush" || name === "insights"), [["smartPush", false], ["insights", false]]);
  await Promise.all([BasicPush.start(context), BasicPush.start(context)]);
  eq(sdk.initCount, 1); // Lifecycle and web bridge can race; share the init.
  sdk.registration = ["", "", "qa-registration-only"];
  eq(await BasicPush.registration(context), "qa-registration-only");
  eq(now, 400);
  await assert.rejects(BasicPush.registration(context), /注册超时/); checks++;
  eq(now, 20400);
  sdk.failInit = true;
  await assert.rejects(BasicPush.start(context), /mock network failure/); checks++;
  sdk.failInit = false;
  sdk.registration = ["recovered-qa-registration"];
  eq(await BasicPush.registration(context), "recovered-qa-registration");
  BasicPush.openMessage(undefined);
  BasicPush.openMessage({ extras: { url: "https://outside.invalid/" } });
  BasicPush.openMessage({ extras: { url: "/dorm-duty/water?invite_code=private" } });
  eq(routes.length, 0);
  const message = { msgId: "qa-message", extras: { url: "/dorm-duty/water" } };
  sdk.callback.onClickMessage(message);
  BasicPush.openMessage(message); // SDK callback + Want must not navigate twice.
  eq(routes, [["notification-route", "https://8.148.190.114/dorm-duty/water"]]);
  eq(stored.get("launchURL"), "https://8.148.190.114/dorm-duty/water");
  BasicPush.detach();
  BasicPush.openMessage({ msgId: "cold-qa-message", extras: { url: "/dorm-duty/calendar" } });
  eq(routes.length, 1);
  eq(stored.get("launchURL"), "https://8.148.190.114/dorm-duty/calendar");
  console.log(JSON.stringify({ checks, status: "passed", scope: "isolated Harmony lifecycle, opt-in, registration timeout/retry, trusted notification routing; not device delivery" }));
} finally {
  Date.now = originalNow; globalThis.setTimeout = originalTimeout;
  if (originalStorage === undefined) delete globalThis.AppStorage; else globalThis.AppStorage = originalStorage;
  delete globalThis.__dormPushTestSdk;
  await fs.rm(directory, { recursive: true, force: true });
}
