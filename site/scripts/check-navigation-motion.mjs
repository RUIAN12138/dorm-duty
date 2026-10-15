import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "dorm-nav-motion-"));
let assertions = 0;
function check(value, message) {
  assertions++;
  assert(value, message);
}
try {
  const file = path.join(temp, "motion.mjs");
  await build({
    entryPoints: [
      new URL("../../frontend/src/interaction/navMotion.ts", import.meta.url)
        .pathname,
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: file,
  });
  const { createNavMotion } = await import(pathToFileURL(file));
  let now = 0;
  let id = 0;
  const frames = new Map();
  const paints = [];
  const motion = createNavMotion(
    0,
    (position, velocity, settled) => {
      paints.push({ position, velocity, settled });
    },
    {
      request(callback) {
        frames.set(++id, callback);
        return id;
      },
      cancel(key) {
        frames.delete(key);
      },
    },
  );
  function advance(milliseconds = 1000 / 60) {
    now += milliseconds;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(now));
  }
  function settle() {
    let ticks = 0;
    while (frames.size && ticks++ < 80) advance();
    check(
      frames.size === 0,
      "spring settles rather than keeping a permanent frame loop",
    );
    check(paints.at(-1).settled, "resting state is exact");
    return ticks;
  }
  motion.move(2);
  check(paints.at(-1).position === 0, "selection does not teleport on a tap");
  for (let n = 0; n < 4; n++) advance();
  check(
    paints.at(-1).position > 0 && paints.at(-1).position < 2,
    "movement starts promptly",
  );
  const before = paints.at(-1);
  motion.move(0);
  check(
    paints.at(-1) === before,
    "rapid reversal does not reset the rendered position or velocity",
  );
  advance();
  check(
    Math.abs(paints.at(-1).position - before.position) < 0.3,
    "retargeting remains spatially continuous",
  );
  settle();
  check(
    paints.at(-1).position === 0,
    "reversal reaches the latest selected tab",
  );
  motion.track(1.35, 1000);
  motion.track(1.65, 1016);
  check(
    paints.at(-1).position === 1.65,
    "drag follows the pointer without animation lag",
  );
  motion.move(2);
  check(settle() < 35, "release snaps into place promptly");
  check(
    paints.at(-1).position === 2,
    "drag release selects the requested anchor",
  );
  motion.track(0.3, 2000);
  motion.move(2);
  settle();
  check(
    paints.at(-1).position === 2,
    "a cancelled drag returns to the current page",
  );
  motion.move(0);
  advance();
  motion.move(1, false);
  check(
    paints.at(-1).position === 1 && frames.size === 0,
    "keyboard and reduced-motion changes are immediate",
  );
  motion.move(2);
  advance();
  advance(500);
  check(
    paints.at(-1).position === 2 && frames.size === 0,
    "returning from a backgrounded frame does not replay stale motion",
  );
  check(
    paints.every(
      ({ position, velocity }) =>
        Number.isFinite(position) &&
        Number.isFinite(velocity) &&
        position >= -0.025 &&
        position <= 2.025,
    ),
    "all motion remains finite and inside the edge padding",
  );
  motion.move(0);
  const count = paints.length;
  motion.dispose();
  advance();
  motion.move(1);
  motion.track(1, 3000);
  check(
    frames.size === 0 && paints.length === count,
    "unmount cancels frames and ignores late updates",
  );
  console.log(
    JSON.stringify(
      {
        status: "passed",
        assertions,
        scope:
          "actual navigation spring: interruption, direct dragging, cancellation, reduced motion, backgrounding and disposal",
      },
      null,
      2,
    ),
  );
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
