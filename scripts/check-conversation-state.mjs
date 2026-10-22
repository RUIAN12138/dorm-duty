import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { transform } from "../frontend/node_modules/esbuild/lib/main.js";
async function load(name) {
  const code = await fs.readFile(
    new URL("../frontend/src/interaction/" + name + ".ts", import.meta.url),
    "utf8",
  );
  const result = await transform(code, { loader: "ts", format: "esm" });
  return import(
    "data:text/javascript;base64," + Buffer.from(result.code).toString("base64")
  );
}
const { emptyNote, transitionNote, noteIntent } =
    await load("conversationNotes"),
  { createTapEnergy } = await load("tapEnergy");
const people = [
  { user_id: 1, nickname: "我" },
  { user_id: 2, nickname: "张三" },
  { user_id: 3, nickname: "李四" },
];
let state = emptyNote(),
  checks = 0;
function step(action, list = people) {
  const r = transitionNote(state, action, list, 1);
  state = r.state;
  return r;
}
function test(value) {
  assert(value);
  checks++;
}
for (const text of [
  "我要留言",
  "我要给张三留言",
  "给李四说一下",
  "我要给所有舍友留言",
])
  test(noteIntent(text) !== null);
test(noteIntent("怎么给张三留言") === null);
step({ type: "input", text: "我要给张三留言" });
test(state.phase === "content" && state.target === 2);
step({ type: "input", text: "晚点回来，帮我留门" });
test(state.phase === "confirm" && state.text === "晚点回来，帮我留门");
step({ type: "input", text: "确认发送" });
test(state.phase === "confirm");
step({ type: "edit", field: "target" });
step({ type: "choose", target: 3 });
test(
  state.phase === "confirm" &&
    state.text === "晚点回来，帮我留门" &&
    state.target === 3,
);
step({ type: "edit", field: "text" });
step({ type: "input", text: "改成十点回来" });
test(state.text === "改成十点回来" && state.phase === "confirm");
step({ type: "submit" });
test(state.phase === "sending");
const locked = JSON.stringify(state);
step({ type: "cancel" });
step({ type: "submit" });
test(JSON.stringify(state) === locked);
step({ type: "failure", error: "网络异常" });
test(state.phase === "failed" && state.text === "改成十点回来");
step({ type: "submit" });
step({ type: "success" });
test(state.phase === "sent");
state = emptyNote();
step({ type: "input", text: "给所有舍友留言：今天早点休息" });
test(state.target === "all" && state.phase === "confirm");
step({ type: "cancel" });
test(state.phase === "idle");
step({ type: "input", text: "我要给不存在的人留言" });
test(state.phase === "recipient" && state.target === null);
step({ type: "input", text: "李四" });
test(state.phase === "content" && state.target === 3);
step({ type: "input", text: "😀".repeat(121) });
test(state.phase === "content" && state.error);
step({ type: "input", text: "abc\u0000bad" });
test(state.phase === "content" && state.error);
step({ type: "input", text: "可以了" });
step(
  { type: "submit" },
  people.filter((p) => p.user_id !== 3),
);
test(
  state.phase === "recipient" &&
    state.target === null &&
    state.text === "可以了",
);
state = emptyNote();
step({ type: "input", text: "给我留言" });
test(state.phase === "recipient");
state = emptyNote();
step({ type: "input", text: "给张三留言" }, [
  ...people,
  { user_id: 4, nickname: "张三" },
]);
test(state.phase === "recipient");
state = emptyNote();
step({ type: "start", target: "all" }, [people[0]]);
test(state.phase === "recipient");
const e = createTapEnergy();
let strength = 0;
for (let i = 0; i < 30; i++) strength = e.tap(i * 65);
test(strength > 0.8 && strength <= 1);
test(e.sample(6000) < 0.005);
const next = e.tap(7000);
test(next < 0.005);
e.reset();
test(e.sample(8000) === 0);
console.log(
  JSON.stringify({
    status: "passed",
    checks,
    scope:
      "conversation transitions, exact recipient validation, confirmation gate, locked send and bounded time-decaying feedback",
  }),
);
