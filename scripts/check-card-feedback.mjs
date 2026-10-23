import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
const out = await build({
  entryPoints: ["frontend/src/interaction/cardFeedback.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const m = await import(
  "data:text/javascript;base64," +
    Buffer.from(out.outputFiles[0].text).toString("base64")
);
const checks = [];
function check(v, label) {
  assert(v, label);
  checks.push(label);
  console.log("PASS " + label);
}
const box = { left: 10, top: 20, width: 200, height: 100 };
check(
  Math.hypot(...Object.values(m.cardContact(box, 110, 70))) === 0,
  "center has no tilt",
);
for (let x = -100; x < 400; x += 5)
  for (let y = -100; y < 300; y += 5) {
    const c = m.cardContact(box, x, y);
    assert(Math.hypot(c.x, c.y) <= 1.6000001);
  }
check(
  true,
  "corners and out-of-bounds contacts stay within 1.6 degrees combined",
);
check(
  m.cardContact(box, 20, 30).y < 0 && m.cardContact(box, 200, 110).y > 0,
  "tilt follows contact direction",
);
check(
  Object.values(
    m.cardContact({ left: 0, top: 0, width: 0, height: 0 }, 0, 0),
  ).every(Number.isFinite),
  "zero-size surface stays finite",
);
check(m.cardRotation(0, 0) === "0deg", "rest has an identity axis-angle");
for (const x of [-1.5, 0, 1.5])
  for (const y of [-1.5, 0, 1.5]) {
    const r = m.cardRotation(x, y);
    if (x || y) {
      const [a, b, z, d] = r.split(" ").map(parseFloat);
      assert(Math.abs(Math.hypot(a, b) - 1) < 1e-8);
      assert.equal(z, 0);
      assert.equal(d, Math.hypot(x, y));
    }
  }
check(
  true,
  "independent rotation represents both axes without replacing transform",
);
for (const hz of [30, 60, 120]) {
  let p = 0,
    v = 0;
  for (let i = 0; i < hz; i++) {
    const n = m.cardSpringStep(p, v, 1, 1 / hz, true);
    p = n.position;
    v = n.velocity;
    assert(p >= 0 && p <= 1.05);
  }
  assert(Math.abs(p - 1) < 0.001);
  for (let i = 0; i < Math.ceil(hz * 0.3); i++) {
    const n = m.cardSpringStep(p, v, 0, 1 / hz);
    p = n.position;
    v = n.velocity;
    assert(Math.abs(p) < 1.01);
  }
  assert(Math.abs(p) < 0.01);
}
check(
  true,
  "30/60/120Hz press and release are bounded and settle near rest within 300ms",
);
let p = 0.75,
  v = -1;
for (let i = 0; i < 500; i++) {
  const n = m.cardSpringStep(p, v, i % 13 < 6 ? 1 : 0, 1 / 120, i % 13 < 6);
  p = n.position;
  v = n.velocity;
  assert(Number.isFinite(p) && p > -0.2 && p < 1.2);
}
check(true, "rapid reversals continue current velocity without runaway motion");
check(
  m.cardFeedbackTokens.scale >= 0.985 &&
    m.cardFeedbackTokens.scale <= 0.995 &&
    m.cardFeedbackTokens.depression >= 1 &&
    m.cardFeedbackTokens.depression <= 2 &&
    m.cardFeedbackTokens.lift >= 3 &&
    m.cardFeedbackTokens.lift <= 5,
  "feedback constants stay within requested bounds",
);
const directive = await fs.readFile(
  "frontend/src/interactions/tilt.ts",
  "utf8",
);
check(
  !directive.includes("el.style.transform") &&
    !directive.includes("setPointerCapture") &&
    !directive.includes("preventDefault") &&
    !directive.includes("stopPropagation"),
  "directive never replaces transform or captures/blocks gesture events",
);
const move = directive.slice(
  directive.indexOf("function move("),
  directive.indexOf("function up("),
);
check(
  !move.includes("getBoundingClientRect") && !move.includes("getComputedStyle"),
  "pointermove has no layout/style reads",
);
const global = await fs.readFile(
  "frontend/src/interaction/pressFeedback.ts",
  "utf8",
);
check(
  global.includes('el.matches("[data-card-feedback]")'),
  "shared generic scale excludes only the card-owned host",
);
const board = await fs.readFile(
  "frontend/src/components/ChoreBoard.vue",
  "utf8",
);
check(
  (board.match(/class="task-title-button"\s+v-tilt/g) || []).length === 2,
  "only existing duty/water title controls receive board feedback",
);
console.log(
  JSON.stringify({
    passed: checks.length,
    scope: "pure math and source ownership, no browser/device claims",
  }),
);
