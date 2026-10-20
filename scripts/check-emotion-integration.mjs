// Engine logic and SVG output in a memory host; not browser or motion visual QA.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
class Element {
  constructor(tag) {
    this.tag = tag;
    this.attributes = {};
    this.style = {};
    this.children = [];
    this.parentNode = null;
  }
  setAttribute(k, v) {
    assert.ok(
      !/NaN|Infinity/.test(String(v)),
      `${this.tag}.${k} must be finite`,
    );
    this.attributes[k] = String(v);
  }
  getAttribute(k) {
    return this.attributes[k] ?? null;
  }
  appendChild(el) {
    this.children.push(el);
    el.parentNode = this;
    return el;
  }
  removeChild(el) {
    this.children = this.children.filter((x) => x !== el);
    el.parentNode = null;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
}
let now = 0,
  next = 0;
const frames = new Map();
const context = vm.createContext({
  console,
  performance: { now: () => now },
  document: { createElementNS: (_, tag) => new Element(tag) },
  setInterval,
  clearInterval,
  requestAnimationFrame: (cb) => {
    frames.set(++next, cb);
    return next;
  },
  cancelAnimationFrame: (id) => frames.delete(id),
});
context.window = context;
for (const name of ["rings", "emotions", "ball", "engine"])
  vm.runInContext(
    fs.readFileSync(`frontend/public/vendor/emotion-ball/${name}.js`, "utf8"),
    context,
  );
const catalog = context.EmotionBall.config.list();
assert.equal(catalog.length, 32);
assert.equal(new Set(catalog.map((e) => e.id)).size, 32);
const host = new Element("div");
const ball = context.EmotionBall.create(host, {
  autostart: false,
  lite: false,
});
const step = () => {
  now += 16;
  const batch = [...frames.values()];
  frames.clear();
  batch.forEach((cb) => cb(now));
};
ball.setActive(true);
for (const emotion of catalog) {
  assert.equal(ball.setEmotion(emotion.id), true);
  assert.equal(ball.emotionId, emotion.id);
  for (let n = 0; n < 200; n++) step();
  ball.setGaze(0.8, -0.6);
  ball.setActive(false);
  ball.renderStatic();
  step();
  assert.equal(frames.size, 0);
  ball.setActive(true);
}
ball.destroy();
step();
assert.equal(host.children.length, 0);
assert.equal(frames.size, 0);
// Load app policy with a stub Vue ref so this stays a logic-only check.
const result = await build({
  entryPoints: ["frontend/src/interaction/companion.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "ref",
      setup(b) {
        b.onResolve({ filter: /^vue$/ }, () => ({
          path: "vue",
          namespace: "stub",
        }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents: "export const ref = value => ({value});",
        }));
      },
    },
  ],
});
globalThis.window = { EMOTION_SEED: context.EMOTION_SEED };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const policy = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
for (const e of catalog)
  assert.ok(policy.emotionUses[e.id], `scenario exists: ${e.id}`);
assert.deepEqual(
  [0, 24999, 25000, 45000, 70000, 100000].map(policy.ambientEmotion),
  ["02", "02", "04", "15", "06", "00"],
);
assert.equal(policy.errorEmotion("网络离线"), "12");
assert.equal(policy.errorEmotion("版本冲突"), "20");
assert.equal(policy.errorEmotion("身份失效"), "38");
assert.equal(policy.errorEmotion("保存失败"), "34");
console.log(
  "Emotion integration passed: 32 original states, finite SVG output, pause/resume, destroy cleanup, scenario coverage and idle/error policy. Memory host only.",
);
const speechBuild = await build({
  entryPoints: ["frontend/src/interaction/companionSpeech.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const speech = await import(
  "data:text/javascript;base64," +
    Buffer.from(speechBuild.outputFiles[0].text).toString("base64")
);
assert.deepEqual(
  speech.speechPages("😀".repeat(60)).map((p) => Array.from(p).length),
  [20, 20],
);
assert.deepEqual(speech.speechPages("   "), []);
let contextSeen;
speech.setCompanionReplyProvider(async (context) => {
  contextSeen = context;
  return "一".repeat(60);
});
const reply = await speech.companionReply(
  "duty",
  "tip",
  new AbortController().signal,
);
assert.deepEqual(Object.keys(contextSeen).sort(), ["intent", "scene"]);
assert.equal(speech.speechPages(reply).length, 2);
speech.setCompanionReplyProvider(null);
console.log(
  "Companion speech passed: 20 characters per page, 40 total, two pages maximum, no authentication fields in the model adapter.",
);
