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

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "dorm-push-settings-"));
const source = new URL(
  "../../frontend/src/components/ChorePushSettings.vue",
  import.meta.url,
);
const vue = new URL(
  "../../frontend/node_modules/vue/index.mjs",
  import.meta.url,
).href;
let checks = 0;
const eq = (actual, expected, message) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const loads = [],
  syncs = [],
  enables = [],
  toasts = [];
globalThis.window = new EventTarget();
globalThis.__pushSettingsMocks = {
  capability: () => ({
    native: Boolean(window.DormNativePush),
    supported: true,
    ios: false,
    standalone: false,
  }),
  getMemberPushConfig(token) {
    const job = { token, ...deferred() };
    loads.push(job);
    return job.promise;
  },
  syncMemberPush(token) {
    syncs.push(token);
    return Promise.resolve(false);
  },
  enableMemberPush(token) {
    const job = { token, ...deferred() };
    enables.push(job);
    return job.promise;
  },
  disableMemberPush() {
    return Promise.resolve();
  },
  testMemberPush() {
    return Promise.resolve();
  },
  toast(message) {
    toasts.push(message);
  },
};
const node = (type, text = "") => ({
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
let app;
try {
  const { descriptor } = parse(await fs.readFile(source, "utf8"), {
    filename: source.pathname,
  });
  const compiled = compileScript(descriptor, {
    id: "push-settings-test",
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
        name: "test-transport",
        setup(builder) {
          builder.onResolve({ filter: /^vue$/ }, () => ({
            path: vue,
            external: true,
          }));
          builder.onResolve(
            {
              filter:
                /^(vant|\.\/ElasticSheet\.vue|\.\/SettingsSkeleton\.vue|\.\/TimedReminderSettings\.vue|\.\/CalendarSubscriptionSettings\.vue|\.\.\/api\/memberPush|\.\.\/api\/push)$/,
            },
            ({ path: id }) => ({ path: id, namespace: "mock" }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: "mock" },
            ({ path: id }) => ({
              contents:
                id === "vant"
                  ? "export const showToast=(message)=>globalThis.__pushSettingsMocks.toast(message)"
                  : id.endsWith("SettingsSkeleton.vue") ||
                      id.endsWith("TimedReminderSettings.vue") ||
                      id.endsWith("CalendarSubscriptionSettings.vue")
                    ? "export default {render(){return null}}"
                    : id.endsWith("ElasticSheet.vue")
                      ? "import {defineComponent,h} from 'vue'; export default defineComponent({props:['modelValue'],setup(props,{slots}){return ()=>props.modelValue?h('section',slots.default?.()):null}})"
                      : id.endsWith("/push")
                        ? "export const pushCapability=()=>globalThis.__pushSettingsMocks.capability()"
                        : [
                            "getMemberPushConfig",
                            "syncMemberPush",
                            "enableMemberPush",
                            "disableMemberPush",
                            "testMemberPush",
                          ]
                            .map(
                              (name) =>
                                `export const ${name}=(...args)=>globalThis.__pushSettingsMocks.${name}(...args)`,
                            )
                            .join(";"),
              loader: "js",
            }),
          );
        },
      },
    ],
  });
  const Component = (
    await import(pathToFileURL(path.join(temp, "component.mjs")))
  ).default;
  const state = reactive({ open: true, token: "member-a" });
  const root = node("root");
  app = renderer.createApp(
    defineComponent({
      setup: () => () =>
        h(Component, {
          modelValue: state.open,
          token: state.token,
          nickname: "验收成员",
        }),
    }),
  );
  app.mount(root);
  await flush();
  eq(
    loads.map((job) => job.token),
    ["member-a"],
  );
  state.token = "member-b";
  await flush();
  eq(
    loads.map((job) => job.token),
    ["member-a", "member-b"],
  );
  loads[1].resolve({ available: true, public_key: "test" });
  await flush();
  eq(syncs, ["member-b"]);
  loads[0].resolve({ available: false, public_key: null });
  await flush();
  eq(
    syncs,
    ["member-b"],
    "A late configuration response must not rebind the previous member",
  );
  const button = all(root).find(
    (el) => el.props["data-testid"] === "push-enable",
  );
  eq(button.props.disabled, false);
  button.props.onClick();
  await flush();
  eq(enables[0].token, "member-b");
  state.open = false;
  await flush();
  enables[0].resolve();
  await flush();
  eq(
    toasts,
    [],
    "A completed operation from a closed sheet must not announce success",
  );
  state.open = true;
  await flush();
  eq(loads.length, 3);
  state.open = false;
  await flush();
  loads[2].reject(new Error("old network error"));
  await flush();
  eq(syncs, ["member-b"]);
  state.open = true;
  await flush();
  window.DormNativePush = { postMessage() {}, onmessage: null };
  window.dispatchEvent(new Event("dorm-native-ready"));
  await flush();
  eq(loads.length, 5);
  loads[4].resolve({ available: false, public_key: null, native: true });
  await flush();
  eq(text(root).includes("安装版推送尚未配置"), true);
  eq(
    all(root).find((el) => el.props["data-testid"] === "push-enable").props
      .disabled,
    true,
  );
  loads[3].resolve({ available: true, public_key: "old-web-config" });
  await flush();
  eq(syncs, ["member-b", "member-b"]);
  eq(text(root).includes("安装版推送尚未配置"), true);
  app.unmount();
  app = null;
  window.dispatchEvent(new Event("dorm-native-ready"));
  await flush();
  eq(loads.length, 5);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        assertions: checks,
        scope:
          "actual Vue notification sheet; switched member, closed sheet, late native readiness and stale config",
        excludes: "native OS permission dialogs and real push delivery",
      },
      null,
      2,
    ),
  );
} finally {
  app?.unmount();
  delete globalThis.window;
  delete globalThis.__pushSettingsMocks;
  await fs.rm(temp, { recursive: true, force: true });
}
