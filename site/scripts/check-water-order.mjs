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

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "dorm-water-order-"));
const source = new URL(
  "../../frontend/src/components/SortableMembers.vue",
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
let frames = new Map(),
  frameId = 0;
globalThis.requestAnimationFrame = (fn) => {
  frames.set(++frameId, fn);
  return frameId;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
let app;
try {
  const { descriptor } = parse(await fs.readFile(source, "utf8"), {
    filename: source.pathname,
  });
  const compiled = compileScript(descriptor, {
    id: "water-order-test",
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
        name: "test-components",
        setup(b) {
          b.onResolve({ filter: /^vue$/ }, () => ({
            path: vue,
            external: true,
          }));
          b.onResolve({ filter: /MemberMark\.vue$/ }, () => ({
            path: "mark",
            namespace: "mock",
          }));
          b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
            contents: "export default {render(){return null}}",
          }));
        },
      },
    ],
  });
  const Component = (
    await import(pathToFileURL(path.join(temp, "component.mjs")))
  ).default;
  const state = reactive({
    order: [1, 2, 3, 4, 5, 6],
    active: true,
    disabled: false,
  });
  const commits = [];
  const root = node("root");
  app = renderer.createApp(
    defineComponent({
      setup: () => () =>
        h(Component, {
          modelValue: state.order,
          members: state.order.map((id) => ({
            user_id: id,
            nickname: "室友" + id,
            marker_id: "pixel-1",
          })),
          active: state.active,
          disabled: state.disabled,
          "onUpdate:modelValue": (value) => {
            commits.push(value);
            state.order = value;
          },
        }),
    }),
  );
  app.mount(root);
  await flush();
  const button = (id) =>
    all(root).find(
      (el) => el.props["data-testid"] === "order-drag-water-" + id,
    );
  const rows = () => all(root).filter((el) => el.type === "li");
  const ids = () => rows().map((el) => Number(text(el).match(/室友(\d)/)[1]));
  let captured = null;
  const scroll = {
    scrollTop: 0,
    scrollHeight: 900,
    clientHeight: 500,
    getBoundingClientRect: () => ({ top: 0, bottom: 500 }),
  };
  const target = {
    setPointerCapture: (id) => (captured = id),
    hasPointerCapture: (id) => captured === id,
    releasePointerCapture: () => (captured = null),
    closest: () => scroll,
  };
  const event = (y = 100, id = 1) => ({
    pointerId: id,
    isPrimary: true,
    button: 0,
    clientY: y,
    currentTarget: target,
    preventDefault() {},
    stopPropagation() {},
  });
  const start = async (id, y = 100) => {
    button(id).props.onPointerdown(event(y));
    await new Promise((r) => setTimeout(r, 280));
    await flush();
  };
  await start(2);
  eq(
    rows()
      .find((el) => text(el).includes("室友2"))
      .props.class.includes("dragging"),
    true,
    "hold lifts row",
  );
  button(2).props.onPointermove(event(316));
  await flush();
  eq(ids(), [1, 3, 4, 5, 2, 6], "moving across three slots makes room");
  eq(commits.length, 0, "preview does not persist before release");
  button(2).props.onPointerup(event(316));
  await flush();
  eq(state.order, [1, 3, 4, 5, 2, 6], "drop commits full permutation");
  eq(captured, null, "capture released");
  eq(frames.size, 0, "frame loop stopped");
  await start(6, 400);
  button(6).props.onPointermove(event(40));
  await flush();
  eq(ids(), [6, 1, 3, 4, 5, 2], "dragging upward crosses all preceding rows");
  button(6).props.onPointercancel(event(40));
  await flush();
  eq(ids(), [1, 3, 4, 5, 2, 6], "pointer cancellation restores draft");
  eq(commits.length, 1, "cancel never saves");
  button(1).props.onPointerdown(event());
  button(1).props.onPointermove(event(120));
  await new Promise((r) => setTimeout(r, 280));
  await flush();
  eq(
    rows().some((el) => el.props.class.includes("dragging")),
    false,
    "moving before hold cancels",
  );
  await start(3);
  button(3).props.onPointermove(event(450, 99));
  await flush();
  eq(ids(), [1, 3, 4, 5, 2, 6], "second pointer ignored");
  state.active = false;
  await flush();
  eq(frames.size, 0, "closing sheet cleans animation");
  eq(captured, null, "closing releases capture");
  eq(commits.length, 1);
  state.active = true;
  await flush();
  button(2).props.onKeydown[1]({ key: "ArrowDown", preventDefault() {} });
  await flush();
  eq(state.order, [1, 3, 4, 5, 6, 2], "keyboard down changes one position");
  state.disabled = true;
  await flush();
  button(1).props.onPointerdown(event());
  await new Promise((r) => setTimeout(r, 280));
  await flush();
  eq(captured, null, "saving disables gestures");
  state.disabled = false;
  await flush();
  await start(6, 470);
  const job = [...frames.values()][0];
  frames.clear();
  job();
  await flush();
  eq(scroll.scrollTop > 0, true, "edge drag scrolls sheet");
  app.unmount();
  app = null;
  eq(frames.size, 0, "unmount cancels pending frame");
  eq(captured, null, "unmount releases capture");
  process.stdout.write(JSON.stringify({ ok: true, checks }, null, 2) + "\n");
} finally {
  app?.unmount();
  await fs.rm(temp, { recursive: true, force: true });
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
}
