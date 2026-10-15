// Run the actual Vue setup/template in an in-memory renderer, without a browser or production data.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import {
  parse,
  compileScript,
} from "../../frontend/node_modules/@vue/compiler-sfc/dist/compiler-sfc.cjs.js";
import {
  createRenderer,
  defineComponent,
  h,
  nextTick,
  reactive,
} from "../../frontend/node_modules/vue/index.mjs";

const node = (type, text = "") => ({
  addEventListener() {},
  type,
  text,
  children: [],
  props: {},
  parent: null,
});
function detach(el) {
  if (el.parent) {
    el.parent.children.splice(el.parent.children.indexOf(el), 1);
    el.parent = null;
  }
}
const renderer = createRenderer({
  createElement: (tag) => node(tag),
  createText: (text) => node("text", text),
  createComment: () => node("comment"),
  setText: (el, text) => {
    el.text = text;
  },
  setElementText: (el, text) => {
    el.text = text;
    el.children = [];
  },
  patchProp: (el, key, previous, value) => {
    el.props[key] = value;
  },
  parentNode: (el) => el.parent,
  nextSibling: (el) =>
    el.parent?.children[el.parent.children.indexOf(el) + 1] || null,
  insert(el, parent, anchor = null) {
    if (el.parent) detach(el);
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, el);
    el.parent = parent;
  },
  remove: detach,
});
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await nextTick();
  }
};
const all = (root) => [root, ...root.children.flatMap(all)];
const text = (el) => el.text + el.children.map(text).join("");

const temp = await fs.mkdtemp(
  path.join(os.tmpdir(), "dorm-calendar-settings-"),
);
const source = new URL(
  "../../frontend/src/components/CalendarSubscriptionSettings.vue",
  import.meta.url,
);
const vue = new URL(
  "../../frontend/node_modules/vue/index.mjs",
  import.meta.url,
).href;
let checks = 0;
const eq = (a, b, message) => {
  checks++;
  assert.deepEqual(a, b, message);
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const jobs = {
  load: [],
  create: [],
  update: [],
  revoke: [],
  confirm: [],
  toasts: [],
  copies: [],
};
const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);
globalThis.window = { location: { origin: "https://calendar-qa.example" } };
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    clipboard: {
      writeText(value) {
        jobs.copies.push(value);
        return Promise.reject(new Error("denied"));
      },
    },
  },
});
globalThis.__calendarMocks = {
  getCalendarSubscription(token, signal) {
    const job = { token, signal, ...deferred() };
    jobs.load.push(job);
    return job.promise;
  },
  createCalendarSubscription(token, version, alarms, signal) {
    const job = { token, version, alarms, signal, ...deferred() };
    jobs.create.push(job);
    return job.promise;
  },
  updateCalendarSubscription(token, version, alarms, signal) {
    const job = { token, version, alarms, signal, ...deferred() };
    jobs.update.push(job);
    return job.promise;
  },
  revokeCalendarSubscription(token, version, signal) {
    const job = { token, version, signal, ...deferred() };
    jobs.revoke.push(job);
    return job.promise;
  },
  confirm() {
    const job = deferred();
    jobs.confirm.push(job);
    return job.promise;
  },
  toast(message) {
    jobs.toasts.push(message);
  },
};
let app;
try {
  const { descriptor } = parse(await fs.readFile(source, "utf8"), {
    filename: source.pathname,
  });
  const compiled = compileScript(descriptor, {
    id: "calendar-settings-test",
    inlineTemplate: true,
  });
  await build({
    stdin: {
      contents: compiled.content,
      loader: "ts",
      resolveDir: path.dirname(source.pathname),
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(temp, "component.mjs"),
    plugins: [
      {
        name: "test-transports",
        setup(b) {
          b.onResolve({ filter: /^vue$/ }, () => ({
            path: vue,
            external: true,
          }));
          b.onResolve(
            {
              filter:
                /^(vant|\.\.\/api|\.\.\/api\/path|\.\.\/api\/calendarSubscription)$/,
            },
            ({ path }) => ({ path, namespace: "mock" }),
          );
          b.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({
            loader: "js",
            contents:
              path === "vant"
                ? `export const showConfirmDialog=()=>globalThis.__calendarMocks.confirm();export const showToast=m=>globalThis.__calendarMocks.toast(m)`
                : path.endsWith("/path")
                  ? `export const appPath=p=>'/dorm-duty'+p`
                  : path === "../api"
                    ? `export class ApiError extends Error {constructor(status,message){super(message);this.status=status}}`
                    : [
                        "getCalendarSubscription",
                        "createCalendarSubscription",
                    "updateCalendarSubscription",
                        "revokeCalendarSubscription",
                      ]
                        .map(
                          (n) =>
                            `export const ${n}=(...args)=>globalThis.__calendarMocks.${n}(...args)`,
                        )
                        .join(";"),
          }));
        },
      },
    ],
  });
  const Component = (
    await import(pathToFileURL(path.join(temp, "component.mjs")))
  ).default;
  const state = reactive({ active: true, token: "member-a" }),
    root = node("root");
  app = renderer.createApp(
    defineComponent({ setup: () => () => h(Component, state) }),
  );
  app.mount(root);
  await flush();
  const allText = () => text(root),
    button = (label) =>
      all(root).find((e) => e.type === "button" && text(e).trim() === label);
  const open = async () => {
    all(root)
      .find((e) => e.type === "details")
      .props.onToggle({ target: { open: true } });
    await flush();
  };
  const config = (enabled = false, version = 0, path, include_alarms = false) => ({
    enabled,
    include_alarms,
    version,
    updated_at: null,
    ...(path ? { path } : {}),
  });
  const privatePath = "/chores/calendar/" + "a".repeat(64) + ".ics";
  eq(jobs.load.length, 0, "collapsed settings do not fetch");
  await open();
  eq(jobs.load.length, 1);
  state.token = "member-b";
  await flush();
  eq(jobs.load[0].signal.aborted, true, "identity change aborts old load");
  await open();
  jobs.load[1].resolve(config());
  await flush();
  jobs.load[0].resolve(config(true, 1, privatePath));
  await flush();
  eq(
    Boolean(button("复制订阅地址")),
    false,
    "old identity cannot reveal an address",
  );
  button("生成订阅地址").props.onClick();
  await flush();
  eq(jobs.create[0].token, "member-b");
  eq(jobs.create[0].version, 0);
  eq(jobs.create[0].alarms, false);
  state.active = false;
  await flush();
  eq(jobs.create[0].signal.aborted, true);
  jobs.create[0].resolve(config(true, 1, privatePath));
  await flush();
  eq(jobs.toasts, [], "late mutation does not show a success toast");
  eq(Boolean(button("复制订阅地址")), false);
  state.active = true;
  await flush();
  await open();
  jobs.load[2].resolve(config(true, 1));
  await flush();
  button("重新生成订阅地址").props.onClick();
  await flush();
  eq(jobs.confirm.length, 1);
  button("正在处理…")?.props.onClick();
  await flush();
  eq(jobs.confirm.length, 1, "busy confirmation cannot stack");
  state.token = "member-c";
  await flush();
  jobs.confirm[0].resolve();
  await flush();
  eq(jobs.create.length, 1, "late confirmation cannot mutate old member");
  await open();
  jobs.load[3].resolve(config());
  await flush();
  button("生成订阅地址").props.onClick();
  await flush();
  jobs.create[1].resolve(config(true, 1, privatePath));
  await flush();
  eq(Boolean(button("复制订阅地址")), true);
  eq(
    all(root).filter((e) => e.type === "textarea").length,
    0,
    "private address hidden by default",
  );
  await button("复制订阅地址").props.onClick();
  await flush();
  eq(jobs.copies, ["https://calendar-qa.example/dorm-duty" + privatePath]);
  eq(
    all(root).find((e) => e.type === "textarea").props.value,
    "https://calendar-qa.example/dorm-duty" + privatePath,
    "clipboard denial reveals long-press copy",
  );
  eq(
    all(root).find((e) => e.type === "a").props.href,
    "webcal://calendar-qa.example/dorm-duty" + privatePath,
  );
  const checkbox = all(root).find((e) => e.type === "input");
  const modelUpdate =
    checkbox.props["onUpdate:modelValue"] || checkbox.props.onChange;
  assert.equal(typeof modelUpdate, "function", "alarm switch has an update handler");
  modelUpdate(true);
  await flush();
  eq(Boolean(button("保存提醒设置")), true);
  button("保存提醒设置").props.onClick();
  await flush();
  eq(jobs.update[0].token, "member-c");
  eq(jobs.update[0].version, 1);
  eq(jobs.update[0].alarms, true);
  jobs.update[0].resolve(config(true, 2, undefined, true));
  await flush();
  eq(Boolean(button("保存提醒设置")), false);
  eq(
    all(root).find((e) => e.type === "textarea").props.value,
    "https://calendar-qa.example/dorm-duty" + privatePath,
    "saving alarm preference preserves the private subscription URL",
  );
  button("撤销日历订阅").props.onClick();
  await flush();
  jobs.confirm[1].reject();
  await flush();
  eq(jobs.revoke.length, 0, "cancelled revoke does not call server");
  button("撤销日历订阅").props.onClick();
  await flush();
  jobs.confirm[2].resolve();
  await flush();
  eq(jobs.revoke[0].token, "member-c");
  jobs.revoke[0].resolve(config(false, 3));
  await flush();
  eq(Boolean(button("复制订阅地址")), false);
  eq(
    all(root).filter((e) => e.type === "textarea").length,
    0,
    "revoke clears address",
  );
  state.token = "member-d";
  await flush();
  await open();
  jobs.load[4].resolve(config());
  await flush();
  button("生成订阅地址").props.onClick();
  await flush();
  jobs.create[2].resolve(config(true, 1, "https://attacker.example/secret"));
  await flush();
  eq(
    Boolean(button("复制订阅地址")),
    false,
    "unexpected server URL is not exposed",
  );
  state.token = "member-e";
  await flush();
  await open();
  const last = jobs.load.at(-1);
  app.unmount();
  app = null;
  eq(last.signal.aborted, true, "unmount aborts request");
  last.resolve(config());
  await flush();
  process.stdout.write(
    JSON.stringify(
      {
        status: "passed",
        assertions: checks,
        scope:
          "actual Vue subscription settings: identity races, private URL, copying, confirmation and revoke",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  app?.unmount();
  await fs.rm(temp, { recursive: true, force: true });
  if (originalNavigator)
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete globalThis.navigator;
  delete globalThis.window;
  delete globalThis.__calendarMocks;
}
