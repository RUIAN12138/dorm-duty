import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import {
  effectScope,
  ref,
  nextTick,
} from "../frontend/node_modules/vue/index.mjs";
const result = await build({
  stdin: {
    contents:
      "export * from './interaction/chatReplyText';export * from './interaction/chatQuickPrompts';export * from './composables/useChatReplyPresentation';",
    resolveDir: new URL("../frontend/src/", import.meta.url).pathname,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "pure",
      setup(b) {
        b.onResolve({ filter: /^vue$/ }, () => ({
          path: new URL(
            "../frontend/node_modules/vue/index.mjs",
            import.meta.url,
          ).href,
          external: true,
        }));
        b.onResolve({ filter: /interaction\/motion$/ }, () => ({
          path: "motion",
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
          contents:
            "export const motionAllowed=()=>globalThis.chatAnimationAllowed;",
        }));
      },
    },
  ],
});
const code = result.outputFiles[0].text;
const api = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const checks = [];
function check(ok, label) {
  assert(ok, label);
  checks.push(label);
  console.log("PASS " + label);
}
const sample =
  "点击设置进入任务轮序，选择需要调整的任务，然后长按成员整行上下拖动，最后点击保存轮序即可。";
assert.deepEqual(api.splitReplyText(sample), [
  "点击设置进入任务轮序，",
  "选择需要调整的任务，",
  "然后长按成员整行上下拖动，",
  "最后点击保存轮序即可。",
]);
check(true, "specified navigation answer splits into four natural clauses");
const samples = [
  sample,
  "你好。再见！下次见？",
  "  保留空格\n换行、逗号，以及全部字符。  ",
  "这句话没有标点但是必须完整保留并且优先按照自然词语而不是每隔二十个字符来分割。",
  "https://example.com/a-very-long-path?x=1&y=2",
  "A very long English sentence should preserve its words and punctuation, exactly as written.",
  "甲".repeat(20) + "。",
  "甲".repeat(20) + "！！！",
  "“先进入设置，然后长按这位室友的名字，拖到需要的位置后再保存。”",
  ...["👨‍👩‍👧‍👦", "👍🏽", "🇨🇳", "e\u0301", "1️⃣", "👩🏽‍💻", "क्‍ष"].map((c) =>
    ("这里" + c).repeat(20),
  ),
  "。".repeat(45),
];
for (const text of samples) {
  const chunks = api.splitReplyText(text);
  assert.equal(chunks.join(""), text);
  assert(chunks.every((c) => api.graphemes(c).length <= 20));
  const ends = new Set([0]);
  let offset = 0;
  for (const c of api.graphemes(text)) {
    offset += c.length;
    ends.add(offset);
  }
  offset = 0;
  for (const c of chunks) {
    offset += c.length;
    assert(ends.has(offset), "must end at complete grapheme");
  }
}
check(
  true,
  "mixed-language/whitespace/emoji/combining texts roundtrip exactly within 20 native graphemes",
);
const originalSegmenter = Intl.Segmenter;
try {
  Intl.Segmenter = undefined;
  const fallback = await import(
    "data:text/javascript;base64," +
      Buffer.from(code + "\n// fallback-check").toString("base64")
  );
  for (const c of ["👨‍👩‍👧‍👦", "👍🏽", "🇨🇳", "e\u0301", "1️⃣", "👩🏽‍💻"])
    assert.deepEqual(
      fallback.graphemes(c.repeat(3)),
      api.graphemes(c.repeat(3)),
    );
  check(
    true,
    "legacy fallback protects tested common ZWJ emoji, flags, modifiers and combining marks",
  );
} finally {
  Intl.Segmenter = originalSegmenter;
}

check(
  api
    .splitReplyText("甲".repeat(20) + "。")
    .every((c) => !/^[\p{Punctuation}\s]+$/u.test(c)),
  "closing punctuation stays with text when a content boundary can move",
);
assert.deepEqual(api.splitReplyMessages(["我在。", "你说。"]), [
  "我在。",
  "你说。",
]);
check(
  true,
  "naturally separate short source messages keep their own boundaries",
);
const legacy = Array.from(sample);
const hard = [];
for (let i = 0; i < legacy.length; i += 20)
  hard.push(legacy.slice(i, i + 20).join(""));
assert.deepEqual(api.splitReplyMessages(hard), api.splitReplyText(sample));
check(
  true,
  "legacy hard cuts within one response reconnect before semantic display splitting",
);
const user = { id: "user", role: "user", text: sample, fresh: true },
  assistant = { id: "answer", role: "assistant", text: sample, fresh: true };
const projected = api.projectChatItems([user, assistant]);
check(
  projected[0].text === sample &&
    projected.filter((p) => p.role === "user").length === 1,
  "long user input is never split",
);
check(
  JSON.stringify(api.projectChatItems([assistant])) ===
    JSON.stringify(api.projectChatItems([{ ...assistant }])),
  "reload projection and IDs are deterministic",
);
check(
  projected
    .filter((p) => p.role === "assistant")
    .map((p) => p.text)
    .join("") === assistant.text && assistant.text === sample,
  "display projection never mutates original message text",
);
for (const width of [320, 390, 430, 768]) {
  let previous = [];
  for (let i = 0; i < 60; i++) {
    const selected = api.pickQuickPrompts(width, previous);
    assert.equal(selected.length, width < 420 ? 2 : 3);
    assert.equal(new Set(selected).size, selected.length);
    assert(selected.every((p) => api.CHAT_QUESTIONS.includes(p)));
    if (previous.length) assert.notDeepEqual(selected, previous);
    if (width < 420 && previous.length)
      assert.notEqual([...selected].sort().join(), [...previous].sort().join());
    previous = selected;
  }
}
check(
  true,
  "random entries use only the existing library, width count and nonrepeating subsets/order",
);
const once = api.pickQuickPrompts(390, [], () => 0);
check(
  JSON.stringify(api.pickQuickPrompts(390, once, () => 0)) !==
    JSON.stringify(once) &&
    api.pickQuickPrompts(430, [], () => NaN).length === 3,
  "constant and invalid random sources cannot hang or repeat the previous ordered selection",
);
check(
  [0, 1, 10, 20, 50].every((n) => {
    const d = api.replyReadingDelay("甲".repeat(n));
    return d >= 150 && d <= 250;
  }),
  "reading delay is bounded at 150–250ms",
);
// Real Vue state, fake clock: no wall-clock timing races or business transport.
globalThis.chatAnimationAllowed = true;
const realSet = globalThis.setTimeout,
  realClear = globalThis.clearTimeout;
let clock = 0,
  serial = 0;
const timers = new Map();
globalThis.setTimeout = (fn, delay) => {
  const id = ++serial;
  timers.set(id, { fn, at: clock + delay });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
const tick = async () => {
  const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
  if (!next) return;
  timers.delete(next[0]);
  clock = next[1].at;
  next[1].fn();
  await nextTick();
};
try {
  const raw = ref([]);
  let presentation;
  const scope = effectScope();
  scope.run(
    () => (presentation = api.useChatReplyPresentation(() => raw.value)),
  );
  raw.value = [assistant];
  await nextTick();
  check(
    presentation.displayedItems.value.length === 1,
    "first new assistant bubble appears immediately",
  );
  const visible = [presentation.displayedItems.value[0].text];
  while (presentation.displayedItems.value.length < 4) {
    await tick();
    visible.push(presentation.displayedItems.value.at(-1).text);
  }
  check(
    visible.join("") === sample,
    "fresh bubbles reveal in semantic source order one at a time",
  );
  raw.value.push({ id: "new-user", role: "user", text: "下一句话" });
  await nextTick();
  check(
    presentation.displayedItems.value.at(-1).id === "new-user",
    "new user message is immediately visible without duplicating pending replies",
  );
  raw.value = [{ ...assistant, id: "old", fresh: false }];
  await nextTick();
  check(
    presentation.displayedItems.value.length === 4,
    "historical response is projected fully without pacing or replay",
  );
  raw.value = [{ ...assistant, id: "pending" }];
  await nextTick();
  raw.value = [];
  await nextTick();
  await tick();
  check(
    presentation.displayedItems.value.length === 0,
    "clear cancels queued pieces and prevents message resurrection",
  );
  raw.value = [{ ...assistant, id: "close" }];
  await nextTick();
  presentation.flush();
  check(
    presentation.displayedItems.value.length === 4,
    "close flush preserves the complete source reply for reopening",
  );
  globalThis.chatAnimationAllowed = false;
  raw.value = [{ ...assistant, id: "reduced" }];
  await nextTick();
  check(
    presentation.displayedItems.value.length === 4,
    "reduced motion displays all parts immediately",
  );
  const ids = presentation.displayedItems.value.map((p) => p.id);
  check(
    new Set(ids).size === ids.length,
    "each rendered bubble has a unique stable source-derived identity",
  );
  scope.stop();
  check(timers.size === 0, "disposal releases every pending reveal timer");
} finally {
  globalThis.setTimeout = realSet;
  globalThis.clearTimeout = realClear;
}
console.log(
  JSON.stringify({
    passed: checks.length,
    checks,
    scope: "pure/state tests, no device or production operations",
  }),
);
