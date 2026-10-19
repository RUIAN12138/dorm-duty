// Component logic against Vue's in-memory renderer; no browser/layout claims.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import {
  parse,
  compileScript,
} from "../frontend/node_modules/@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js";
import {
  createRenderer,
  h,
  reactive,
  nextTick,
} from "../frontend/node_modules/vue/index.mjs";
const entries = ["ChoreSettings", "WaterOrderSheet", "HistoryEditor"];
const vueUrl = new URL(
  "../frontend/node_modules/vue/index.mjs",
  import.meta.url,
).href;
const result = await build({
  stdin: {
    contents:
      entries
        .map((n) => `export {default as ${n}} from './${n}.vue'`)
        .join(";") + ";export {ApiError} from '../api';",
    resolveDir: new URL("../frontend/src/components", import.meta.url).pathname,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "component-fixtures",
      setup(b) {
        b.onResolve({ filter: /^vue$/ }, () => ({
          path: vueUrl,
          external: true,
        }));
        b.onResolve({ filter: /\.vue$/ }, (args) => ({
          path: new URL(args.path, "file://" + args.resolveDir + "/").pathname,
          namespace: entries.some(
            (n) =>
              args.path.endsWith("/" + n + ".vue") || args.path === n + ".vue",
          )
            ? "component"
            : "child",
        }));
        b.onLoad({ filter: /.*/, namespace: "component" }, async (args) => {
          // Native input event directives are outside this save-lifecycle fixture.
          const source = (await fs.readFile(args.path, "utf8")).replace(
            /\bv-model(?:\.[\w]+)*="([^"]*)"/g,
            ':data-model="$1" @fixture-input="$1 = $event"',
          );
          const { descriptor } = parse(source);
          return {
            contents: compileScript(descriptor, {
              id: args.path,
              inlineTemplate: true,
            }).content,
            loader: "ts",
            resolveDir: new URL(".", "file://" + args.path).pathname,
          };
        });
        b.onLoad({ filter: /.*/, namespace: "child" }, () => ({
          contents: `import {h} from 'vue';export default {props:['modelValue'],setup(p,{slots}){return()=>p.modelValue===false?null:h('section',null,[slots.default?.(),slots.footer?.()])}}`,
        }));
        b.onResolve({ filter: /^reka-ui$/ }, () => ({
          path: "reka",
          namespace: "stub",
        }));
        b.onLoad({ filter: /reka/, namespace: "stub" }, () => ({
          contents: `import{h}from'vue';export const TabsRoot={setup(p,{slots}){return()=>h('div',null,slots.default?.())}};`,
        }));
        b.onResolve({ filter: /^\.\.\/api(?:\/chores)?$/ }, () => ({
          path: "api",
          namespace: "stub",
        }));
        b.onLoad({ filter: /api/, namespace: "stub" }, () => ({
          contents: `export class ApiError extends Error{constructor(status,message){super(message);this.status=status}};export const choreRequest=(...args)=>globalThis.settingsRequest(...args);`,
        }));
        b.onResolve({ filter: /interactions\/confirm$/ }, () => ({
          path: "confirm",
          namespace: "fixture-confirm",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture-confirm" }, () => ({
          contents: "export const confirmInSheet=()=>Promise.resolve();",
        }));
        b.onResolve({ filter: /interaction\/notice$/ }, () => ({
          path: "notice",
          namespace: "stub",
        }));
        b.onLoad({ filter: /notice/, namespace: "stub" }, () => ({
          contents:
            "export const showToast=message=>globalThis.saveNotices.push(message);",
        }));
      },
    },
  ],
});
const components = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const node = (type, text = "") => ({
  type,
  text,
  children: [],
  props: {},
  parent: null,
});
const renderer = createRenderer({
  createElement: (type) => node(type),
  createText: (text) => node("text", text),
  createComment: (text) => node("comment", text),
  setText: (n, text) => (n.text = text),
  setElementText: (n, text) => {
    n.text = text;
    n.children = [];
  },
  parentNode: (n) => n.parent,
  nextSibling: (n) =>
    n.parent?.children[n.parent.children.indexOf(n) + 1] || null,
  patchProp: (n, k, old, value) => (n.props[k] = value),
  insert: (n, parent, anchor) => {
    if (n.parent) {
      const i = n.parent.children.indexOf(n);
      if (i >= 0) n.parent.children.splice(i, 1);
    }
    n.parent = parent;
    const at = anchor ? parent.children.indexOf(anchor) : -1;
    if (at < 0) parent.children.push(n);
    else parent.children.splice(at, 0, n);
  },
  remove: (n) => {
    if (n.parent) {
      const i = n.parent.children.indexOf(n);
      if (i >= 0) n.parent.children.splice(i, 1);
      n.parent = null;
    }
  },
});
const find = (root, id) => {
  if (root.props["data-testid"] === id) return root;
  for (const n of root.children) {
    const match = find(n, id);
    if (match) return match;
  }
};
const text = (root) => root.text + " " + root.children.map(text).join(" ");
const tick = async () => {
  await nextTick();
  await new Promise((r) => setImmediate(r));
};
const categories = ["floor", "water"].map((key, i) => ({
  key,
  name: key === "water" ? "抬水" : "地板",
  content: "清洁",
  enabled: true,
  start_date: "2026-10-19",
  deadline_time: "22:00",
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  rotation_days: 1,
  rotation_order: [1, 2],
  mode: key === "water" ? "completion" : "self_round",
  reminder_interval_days: 3,
}));
for (const name of entries.filter((name) => name !== "HistoryEditor")) {
  const requests = [];
  globalThis.saveNotices = [];
  globalThis.settingsRequest = (path, token, options) =>
    new Promise((resolve, reject) =>
      requests.push({ path, body: JSON.parse(options.body), resolve, reject }),
    );
  const state = reactive({ modelValue: true, version: 1 });
  const root = node("root");
  let saved = 0,
    closed = 0;
  const app = renderer.createApp({
    setup() {
      return () =>
        h(components[name], {
          ...state,
          categories,
          members: [
            { user_id: 1, nickname: "甲", marker_id: "pixel-01" },
            { user_id: 2, nickname: "乙", marker_id: "pixel-02" },
          ],
          category: categories[1],
          initialKey: "water",
          editable: true,
          token: "fixture",
          onSaved: () => saved++,
          "onUpdate:modelValue": (value) => {
            state.modelValue = value;
            closed++;
          },
        });
    },
  });
  app.config.warnHandler = () => {};
  app.mount(root);
  await tick();
  const submit = () =>
    name === "ChoreSettings"
      ? find(root, "chore-settings").props.onSubmit({ preventDefault() {} })
      : find(root, "water-order-save").props.onClick({});
  state.version = 2;
  await tick();
  let pending = submit();
  await tick();
  assert.equal(
    requests[0].body.version,
    1,
    `${name} uses opening version, not live props`,
  );
  submit();
  await tick();
  assert.equal(requests.length, 1, "double submit shares busy guard");
  requests[0].reject(new components.ApiError(409, "conflict"));
  await pending;
  await tick();
  assert.equal(state.modelValue, true);
  assert.equal(saved, 0);
  assert.match(text(root), /轮序已被更新|室友刚刚更新/);
  state.modelValue = false;
  await tick();
  state.modelValue = true;
  await tick();
  pending = submit();
  await tick();
  assert.equal(
    requests[1].body.version,
    2,
    "reopened draft captures fresh version",
  );
  state.modelValue = false;
  await tick();
  state.modelValue = true;
  await tick();
  requests[1].resolve({});
  await pending;
  await tick();
  assert.equal(saved, 1, "late persisted success still refreshes board");
  assert.equal(
    state.modelValue,
    true,
    "old success does not close reopened draft",
  );
  assert.equal(closed, 0);
  assert.equal(globalThis.saveNotices.length, 1);
  pending = submit();
  await tick();
  state.modelValue = false;
  await tick();
  state.modelValue = true;
  await tick();
  requests[2].reject(Error("old failure"));
  await pending;
  await tick();
  assert.doesNotMatch(
    text(root),
    /old failure/,
    "old failure does not pollute new draft",
  );
  pending = submit();
  await tick();
  app.unmount();
  requests[3].resolve({});
  await pending;
  assert.equal(saved, 1, "unmounted sheet emits no delayed result");
}
console.log(
  "Settings components: opening version, duplicate submit, failure retention, reopen isolation, confirmed success and unmount passed (in-memory renderer).",
);

// Test the actual editor's opening-version snapshot and failed-detail protection.
const historyCalls = [];
globalThis.settingsRequest = (path, token, options) =>
  new Promise((resolve, reject) =>
    historyCalls.push({
      path,
      body: options.body ? JSON.parse(options.body) : null,
      resolve,
      reject,
    }),
  );
const historyState = reactive({ modelValue: true, version: 4, record: null });
let historySaved = 0;
const historyRoot = node("root");
const historyApp = renderer.createApp({
  render: () =>
    h(components.HistoryEditor, {
      ...historyState,
      date: "2026-10-18",
      today: "2026-10-19",
      token: "fixture",
      memberId: 1,
      members: [{ user_id: 1, nickname: "甲", marker_id: "pixel-01" }],
      creator: true,
      onSaved: () => historySaved++,
      "onUpdate:modelValue": (value) => (historyState.modelValue = value),
    }),
});
historyApp.config.warnHandler = () => {};
historyApp.mount(historyRoot);
await tick();
function locate(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = locate(child, predicate);
    if (found) return found;
  }
}
const reasonInput = () =>
  locate(historyRoot, (n) => n.props.placeholder === "例如：昨天忘记打卡");
const saveButton = () =>
  locate(historyRoot, (n) => n.props.class === "history-save");
reasonInput().props.onFixtureInput("补记");
historyState.version = 5;
await tick();
let historyPending = saveButton().props.onClick();
await tick();
assert.equal(
  historyCalls[0].body.version,
  4,
  "actual editor captures opening version",
);
historyState.modelValue = false;
await tick();
historyState.modelValue = true;
await tick();
historyCalls[0].resolve({});
await historyPending;
await tick();
assert.equal(historySaved, 1);
assert.equal(
  historyState.modelValue,
  true,
  "actual editor keeps reopened sheet",
);
historyState.record = {
  id: 12,
  key: "floor",
  name: "地板",
  assignee_id: 1,
  assignee_name: "甲",
  marker_id: "pixel-01",
  completed_at: "2026-10-18T04:00:00Z",
  revision: 1,
};
await tick();
assert.match(historyCalls[1].path, /history\?id=12/);
historyCalls[1].reject(Error("detail failed"));
await tick();
assert.match(text(historyRoot), /detail failed/);
assert.equal(
  saveButton().props.disabled,
  true,
  "failed detail cannot submit an obsolete revision",
);
const retryHistory = locate(
  historyRoot,
  (n) => n.type === "button" && text(n).includes("重新读取"),
);
retryHistory.props.onClick();
await tick();
historyCalls[2].resolve({
  record: { ...historyState.record, revision: 3 },
  audit: [],
});
await tick();
reasonInput().props.onFixtureInput("更正");
await tick();
historyPending = saveButton().props.onClick();
await tick();
assert.equal(historyCalls[3].body.revision, 3);
assert.equal(historyCalls[3].body.version, 5);
historyCalls[3].resolve({});
await historyPending;
await tick();
assert.equal(historyState.modelValue, false);
historyApp.unmount();
console.log(
  "History editor integration: initial-open draft version, reopened sheet, failed-detail lock, retry and fresh revision passed (in-memory renderer).",
);
