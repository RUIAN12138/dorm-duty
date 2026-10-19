// Component state/timer regression in Vue's in-memory renderer; no visual QA claim.
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
const file = new URL(
  "../frontend/src/components/CompletionAction.vue",
  import.meta.url,
).pathname;
const result = await build({
  entryPoints: [file],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "completion-fixture",
      setup(b) {
        b.onResolve({ filter: /^vue$/ }, () => ({
          path: new URL(
            "../frontend/node_modules/vue/index.mjs",
            import.meta.url,
          ).href,
          external: true,
        }));
        b.onLoad({ filter: /CompletionAction\.vue$/ }, async () => ({
          contents: compileScript(
            parse(await fs.readFile(file, "utf8")).descriptor,
            { id: "completion", inlineTemplate: true },
          ).content,
          loader: "ts",
          resolveDir: new URL("../frontend/src/components/", import.meta.url)
            .pathname,
        }));
        b.onResolve({ filter: /Galaxy.*\.vue$/ }, () => ({
          path: "child",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /interaction\/motion$/ }, () => ({
          path: "motion",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /interaction\/completionFeedback$/ }, () => ({
          path: "feedback",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents:
            args.path === "motion"
              ? `export const motionAllowed=()=>globalThis.allowMotion();export const motionTiming={reorder:.3,completion:.4};`
              : args.path === "feedback"
                ? `export const completionFeedback=()=>globalThis.feedback();`
                : `export default {render(){return null}};`,
        }));
      },
    },
  ],
});
const Component = (
  await import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  )
).default;
const documentEvents = new EventTarget(),
  media = new EventTarget();
media.matches = false;
globalThis.document = Object.assign(documentEvents, {
  hidden: false,
  documentElement: { dataset: { interaction: "pointer" } },
});
globalThis.window = new EventTarget();
globalThis.matchMedia = () => media;
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.allowMotion = () =>
  !document.hidden &&
  !media.matches &&
  document.documentElement.dataset.interaction !== "keyboard";
let feedbacks = 0,
  cancels = 0;
globalThis.feedback = () => {
  feedbacks++;
  return () => cancels++;
};
let now = 0,
  serial = 0;
const timers = new Map();
globalThis.setTimeout = (fn, delay) => {
  const id = ++serial;
  timers.set(id, { fn, at: now + delay });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
globalThis.performance = { now: () => now };
async function advance(ms) {
  const end = now + ms;
  for (;;) {
    const entry = [...timers.entries()]
      .filter(([, t]) => t.at <= end)
      .sort((a, b) => a[1].at - b[1].at)[0];
    if (!entry) break;
    now = entry[1].at;
    timers.delete(entry[0]);
    entry[1].fn();
    await nextTick();
  }
  now = end;
  await nextTick();
}
const node = (type, text = "") => ({
  type,
  text,
  children: [],
  props: {},
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

let completed = 0,
  undone = 0;
const settled = [];
const props = reactive({
  task: { id: 1, key: "floor", status: "pending" },
  receipt: null,
  busy: false,
  disabled: false,
  demo: false,
  syncing: false,
});
const root = node("root");
const app = renderer.createApp({
  render: () =>
    h(Component, {
      ...props,
      onComplete: () => completed++,
      onUndo: () => undone++,
      onSettled: (id) => settled.push(id),
    }),
});
app.mount(root);
const button = () => root.children[0];
const classes = () => String(button().props.class).split(/\s+/);
const round = () => classes().includes("is-round");
const ready = () => classes().includes("is-ready");
async function reset() {
  props.task = { id: props.task.id + 1, key: "floor", status: "pending" };
  props.receipt = null;
  props.busy = false;
  props.disabled = false;
  props.syncing = false;
  document.hidden = false;
  media.matches = false;
  document.documentElement.dataset.interaction = "pointer";
  await nextTick();
}
async function click() {
  button().props.onClick();
  props.busy = true;
  await nextTick();
}
async function confirm() {
  props.task = { ...props.task, status: "completed" };
  props.receipt = { ...props.task };
  await nextTick();
}
await click();
assert.equal(round(), true);
await confirm();
await advance(299);
assert.equal(ready(), false);
await advance(1);
assert.equal(ready(), true);
assert.equal(feedbacks, 1);
await advance(400);
assert.equal(round(), false);
await advance(300);
assert.deepEqual(settled, [1]);
await reset();
await click();
props.busy = false;
await nextTick();
assert.equal(round(), false);
await advance(1200);
assert.equal(feedbacks, 1, "failed write never celebrates");
await reset();
await click();
document.hidden = true;
document.dispatchEvent(new Event("visibilitychange"));
await nextTick();
assert.equal(round(), false);
assert.equal(settled.length, 1, "hidden does not confirm pending write");
await confirm();
props.busy = false;
await nextTick();
document.hidden = false;
document.dispatchEvent(new Event("visibilitychange"));
await advance(1200);
assert.equal(
  feedbacks,
  1,
  "late receipt does not replay interrupted animation",
);
await reset();
await click();
await confirm();
document.hidden = true;
document.dispatchEvent(new Event("visibilitychange"));
await nextTick();
assert.equal(round(), false);
assert.equal(settled.length, 2, "confirmed receipt settles on interruption");
await advance(1200);
assert.equal(settled.length, 2);
assert.equal(feedbacks, 1);
await reset();
await click();
await confirm();
await advance(300);
assert.equal(feedbacks, 2);
const beforeKeyboardCancel = cancels;
document.documentElement.dataset.interaction = "keyboard";
window.dispatchEvent(new Event("ui-motion-change"));
await nextTick();
assert.equal(ready(), false);
assert.equal(round(), false);
assert.equal(cancels, beforeKeyboardCancel + 1);
await advance(1200);
assert.equal(settled.length, 3);
await reset();
await click();
await confirm();
await advance(700);
media.matches = true;
media.dispatchEvent(new Event("change"));
await nextTick();
assert.equal(ready(), false);
assert.equal(
  settled.length,
  4,
  "interruption during unfolding releases receipt",
);
await advance(400);
assert.equal(settled.length, 4, "no duplicate settled callback");
await reset();
props.disabled = true;
await nextTick();
const count = completed;
button().props.onClick();
assert.equal(completed, count, "disabled handler refuses synthetic click");
props.disabled = false;
props.task = { ...props.task, status: "completed" };
await nextTick();
button().props.onClick();
props.busy = true;
await nextTick();
assert.equal(undone, 1);
assert.equal(round(), false);
assert.equal(button().props["aria-label"], "正在撤销打卡");
props.busy = false;
await nextTick();
assert.equal(
  round(),
  false,
  "failed undo keeps completed status without celebration",
);
await reset();
await click();
await confirm();
const before = settled.length;
app.unmount();
await advance(1500);
assert.equal(
  settled.length,
  before,
  "unmounted component does not notify parent",
);
assert.equal(timers.size, 0);
console.log(
  "Completion state: success timing, failed write/undo, hidden pending/confirmed, keyboard/reduced interruption, unfolding, disabled guard and disposal passed (no visual assertions).",
);
