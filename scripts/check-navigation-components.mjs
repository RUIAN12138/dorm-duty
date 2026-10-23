// Actual Vue component logic in memory; no CSS/touch-device claims.
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
const names = ["ReminderBanner", "CompactRecordList"];
const result = await build({
  stdin: {
    contents: names
      .map((name) => `export {default as ${name}} from './${name}.vue'`)
      .join(";"),
    resolveDir: new URL("../frontend/src/components", import.meta.url).pathname,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "navigation-fixture",
      setup(b) {
        b.onResolve({ filter: /^vue$/ }, () => ({
          path: new URL(
            "../frontend/node_modules/vue/index.mjs",
            import.meta.url,
          ).href,
          external: true,
        }));
        b.onResolve({ filter: /\.vue$/ }, (args) => ({
          path: new URL(args.path, "file://" + args.resolveDir + "/").pathname,
          namespace: names.some((name) => args.path.endsWith(name + ".vue"))
            ? "component"
            : "child",
        }));
        b.onLoad({ filter: /.*/, namespace: "component" }, async (args) => {
          let source = await fs.readFile(args.path, "utf8");
          // Teleport and CSS Transition require a browser. Replace only those hosts.
          source = source
            .replace('<Teleport to="body">', "<div>")
            .replace("</Teleport>", "</div>")
            .replace(/<Transition\b([^>]*)>/g, (_, attrs) =>
              attrs.includes(':css="false"')
                ? '<div @fixture-enter="cancelGesture" @fixture-leave="afterLeave">'
                : "<div>",
            )
            .replace(/<\/Transition>/g, "</div>");
          return {
            contents: compileScript(parse(source).descriptor, {
              id: args.path,
              inlineTemplate: true,
            }).content,
            loader: "ts",
            resolveDir: new URL(".", "file://" + args.path).pathname,
          };
        });
        b.onLoad({ filter: /.*/, namespace: "child" }, () => ({
          contents: `import{h}from'vue';export default{setup(){return()=>h('div')}}`,
        }));
        b.onResolve({ filter: /interaction\/bannerReplyLayout$/ }, () => ({
          path: "reply-layout",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /interaction\/motion$/ }, () => ({
          path: "motion",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents:
            args.path === "reply-layout"
              ? `export const createBannerReplyLayout=()=>({start(){},stop(){},sync(){}});export const lockBackgroundScroll=()=>()=>{};`
              : `export const motionAllowed=()=>globalThis.allowed;`,
        }));
      },
    },
  ],
});
const components = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
const media = new EventTarget();
globalThis.matchMedia = () => media;
globalThis.allowed = true;
globalThis.ResizeObserver = class {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {
    this.callback();
  }
  disconnect() {}
};
let now = 0;
let frameId = 0;
const frames = new Map();
globalThis.requestAnimationFrame = (fn) => {
  frames.set(++frameId, fn);
  return frameId;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.performance = { now: () => now };
const node = (type, text = "") => ({
  type,
  text,
  children: [],
  props: {},
  scrollTop: 0,
  clientHeight: 340,
  capture: new Set(),
  setPointerCapture(id) {
    this.capture.add(id);
  },
  hasPointerCapture(id) {
    return this.capture.has(id);
  },
  releasePointerCapture(id) {
    this.capture.delete(id);
  },
  querySelectorAll: () => [],
  style: { setProperty() {} },
  clientWidth: 300,
  clientHeight: 56,
  getBoundingClientRect: () => ({}),
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

const find = (root, predicate) => {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = find(child, predicate);
    if (found) return found;
  }
};
const hasClass = (node, name) =>
  String(node.props.class || "")
    .split(/\s+/)
    .includes(name);
let dismissals = 0,
  opens = 0;
const state = reactive({
  note: {
    id: 1,
    sender_name: "小陈",
    task_name: "地板",
    created_at: "2026-10-19T03:00:00Z",
    read_at: null,
  },
});
const root = node("root");
const app = renderer.createApp({
  render: () =>
    h(components.ReminderBanner, {
      note: state.note,
      onDismiss: () => dismissals++,
      onOpen: () => opens++,
    }),
});
app.config.warnHandler = () => {};
app.mount(root);
await nextTick();
const card = () => find(root, (n) => hasClass(n, "reminder-banner-card"));
const event = (y) => ({
  isPrimary: true,
  button: 0,
  pointerId: 1,
  clientX: 30,
  clientY: y,
  target: { closest: () => null },
  currentTarget: card(),
});
card().props.onClick();
assert.equal(opens, 1);
card().props.onPointerdown(event(100));
now = 100;
card().props.onPointermove(event(40));
await nextTick();
assert.ok(card().props.style.transform.includes("translate3d(0px,-25.2px"));
now = 110;
card().props.onPointerup(event(40));
await nextTick();
assert.equal(dismissals, 1);
card().props.onClick();
assert.equal(opens, 1, "swipe suppresses synthetic click");
find(root, (n) => n.props.onFixtureLeave).props.onFixtureLeave();
find(root, (n) => n.props.onFixtureEnter).props.onFixtureEnter();
await nextTick();
now = 800;
card().props.onPointerdown(event(100));
now = 1000;
card().props.onPointermove(event(88));
now = 1300;
card().props.onPointerup(event(88));
await nextTick();
assert.equal(dismissals, 1, "short slow swipe rebounds");
for (let i = 0; i < 240; i++) {
  now += 1000 / 120;
  const batch = [...frames.values()];
  frames.clear();
  batch.forEach((fn) => fn(now));
}
await nextTick();
assert.ok(card().props.style.transform.includes("translate3d(0px,0px"));
globalThis.allowed = false;
window.dispatchEvent(new Event("ui-motion-change"));
await nextTick();
assert.ok(card().props.style.transform.includes("translate3d(0px,0px"));
app.unmount();
const memory = reactive({
  month: "2026-10",
  page: 2,
  scrollTop: 80,
  expanded: ["2026-10-05"],
  collapsedToday: "",
});
const records = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  completed_date: `2026-10-${String(i + 1).padStart(2, "0")}`,
  completed_at: "2026-10-01T01:00:00Z",
  name: "地板",
  key: "floor",
  assignee_id: 1,
  assignee_name: "甲",
  marker_id: "pixel-01",
}));
const listState = reactive({ month: "2026-10", records });
function mountList() {
  const listRoot = node("root");
  const instance = renderer.createApp({
    render: () =>
      h(components.CompactRecordList, {
        ...listState,
        today: "2026-10-19",
        memory,
      }),
  });
  instance.config.warnHandler = () => {};
  instance.mount(listRoot);
  return { listRoot, instance };
}
let list = mountList();
await nextTick();
let area = find(list.listRoot, (n) => hasClass(n, "folded-record-page"));
assert.equal(area.props["data-page"], 2);
assert.equal(area.scrollTop, 80);
find(
  list.listRoot,
  (n) => n.props["aria-label"] === "下一页记录",
).props.onClick();
await nextTick();
assert.equal(memory.page, 3);
assert.equal(memory.scrollTop, 0);
area = find(list.listRoot, (n) => hasClass(n, "folded-record-page"));
area.scrollTop = 120;
area.props.onScroll({ target: area });
list.instance.unmount();
list = mountList();
await nextTick();
area = find(list.listRoot, (n) => hasClass(n, "folded-record-page"));
assert.equal(area.props["data-page"], 3, "remount keeps list page");
assert.equal(area.scrollTop, 120, "remount restores list scroll");
listState.month = "2026-09";
await nextTick();
assert.equal(memory.page, 0);
assert.equal(memory.scrollTop, 0);
assert.deepEqual(memory.expanded, []);
list.instance.unmount();
console.log(
  "Navigation components: banner swipe/flick threshold, rebound/cancel, click suppression, interruption and close; list page/scroll restoration and month reset passed (in-memory renderer, no visual QA).",
);
