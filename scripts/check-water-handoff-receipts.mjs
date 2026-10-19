import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
const out = await build({
  entryPoints: [
    new URL("../frontend/src/interaction/waterHandoff.ts", import.meta.url)
      .pathname,
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const code = out.outputFiles[0].text;
const map = new Map();
globalThis.localStorage = {
  getItem: (k) => map.get(k) || null,
  setItem: (k, v) => map.set(k, v),
};
async function load(suffix = "") {
  return import(
    "data:text/javascript;base64," +
      Buffer.from(code + "\n//" + suffix).toString("base64")
  );
}
const { consumeWaterHandoff: consume } = await load();
const event = (sequence = 1, completed_at = "2026-10-19T02:00:00.000Z") => ({
  id: sequence,
  sequence,
  from_member_id: 1,
  completed_at,
});
assert.equal(consume("room:1", null), false);
assert.equal(
  consume("room:1", event()),
  true,
  "initiator plays successful receipt",
);
assert.equal(consume("room:1", event()), false, "polling does not replay");
assert.equal(
  consume("room:2", event()),
  true,
  "another member first opens the updated water page",
);
assert.equal(
  consume("room:2", event()),
  false,
  "member revisits without replay",
);
const reloaded = await load("reload");
assert.equal(
  reloaded.consumeWaterHandoff("room:2", event()),
  false,
  "reload persists seen receipt",
);
assert.equal(consume("room:1", null), false, "undo alone has no handoff");
assert.equal(
  consume("room:1", event(1, "2026-10-19T02:01:00.000Z")),
  true,
  "same task completed again after undo",
);
assert.equal(
  consume("room:2", event(1, "2026-10-19T02:01:00.000Z")),
  true,
  "others see redo receipt once",
);
assert.equal(
  consume("room:1", event()),
  false,
  "stale response cannot replay earlier timestamp",
);
assert.equal(consume("room:1", event(2)), true, "next turn plays");
assert.equal(
  consume("room:1", event(1, "2026-10-19T02:02:00.000Z")),
  false,
  "rollback to older sequence cannot replay",
);
assert.equal(
  consume("other-room:1", event()),
  true,
  "different dorms independent",
);
assert.equal(consume("bad", { ...event(), completed_at: "invalid" }), false);
globalThis.localStorage = {
  getItem() {
    throw Error("disabled");
  },
  setItem() {
    throw Error("disabled");
  },
};
assert.equal(consume("no-storage", event()), true);
assert.equal(consume("no-storage", event()), false, "in-memory fallback");
console.log(
  "Water handoff receipts: first encounter, per-member/dorm, persistence, polling, undo/redo, stale response and unavailable storage passed.",
);
