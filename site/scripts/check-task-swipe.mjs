import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "dorm-task-swipe-"));
const originalNow = Date.now;
let now = 1000,
  checks = 0;
Date.now = () => now;
const eq = (a, b, message) => {
  checks++;
  assert.deepEqual(a, b, message);
};
try {
  await build({
    entryPoints: [
      new URL("../../frontend/src/interaction/taskSwipe.ts", import.meta.url)
        .pathname,
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(temp, "swipe.mjs"),
  });
  const { createTaskSwipe } = await import(
    pathToFileURL(path.join(temp, "swipe.mjs"))
  );
  await build({
    entryPoints: [
      new URL("../../frontend/src/interaction/gestures.ts", import.meta.url)
        .pathname,
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(temp, "gestures.mjs"),
  });
  const { createVelocityTracker, rubberBand } = await import(
    pathToFileURL(path.join(temp, "gestures.mjs"))
  );
  const velocity = createVelocityTracker(0, 0);
  velocity.add(30, 30);
  velocity.add(60, 60);
  velocity.add(61, 61);
  eq(
    velocity.read(70),
    1,
    "drawer flick uses recent travel instead of one event",
  );
  velocity.add(50, 81);
  eq(
    velocity.read(85) < 0,
    true,
    "reversing the drawer cancels downward momentum",
  );
  eq(
    velocity.read(200),
    0,
    "holding still releases without stale flick velocity",
  );
  eq(
    Math.abs(rubberBand(-100)) < Math.abs(rubberBand(-1000)),
    true,
    "edge resistance stays monotonic",
  );
  eq(Math.abs(rubberBand(-1000)) < 64, true, "over-pull remains bounded");
  const offsets = [],
    steps = [];
  let capture = null;
  const target = {
    hasPointerCapture: (id) => capture === id,
    setPointerCapture: (id) => (capture = id),
    releasePointerCapture: () => (capture = null),
  };
  const event = (x = 100, y = 100, id = 1) => ({
    pointerId: id,
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: target,
    preventDefault() {},
  });
  const swipe = createTaskSwipe(
    (value, dragging) => offsets.push([value, dragging]),
    (direction) => steps.push(direction),
  );
  swipe.down(event());
  swipe.up(event());
  eq(steps, [], "tap does not switch");
  eq(capture, null);
  eq(
    swipe.suppressesClick({ detail: 1 }),
    false,
    "ordinary title tap still opens details",
  );
  swipe.down(event());
  swipe.move(event(103, 120));
  swipe.up(event(103, 180));
  eq(steps, [], "vertical drag remains scrolling");
  eq(capture, null);
  swipe.down(event());
  swipe.move(event(45));
  eq(capture, 1);
  eq(offsets.at(-1), [-9.9, true]);
  swipe.down(event(250, 100, 2));
  swipe.move(event(300, 100, 2));
  swipe.up(event(300, 100, 2));
  eq(steps, [], "secondary pointer cannot finish swipe");
  swipe.cancel(event(300, 100, 2));
  eq(capture, 1, "secondary pointer cancellation cannot cancel active swipe");
  swipe.up(event(40));
  eq(steps, [1], "left advances");
  eq(capture, null);
  eq(offsets.at(-1), [0, false]);
  eq(
    swipe.suppressesClick({ detail: 1 }),
    true,
    "drag-generated click cannot open detail",
  );
  eq(swipe.suppressesClick({ detail: 0 }), false, "keyboard remains usable");
  now += 351;
  eq(swipe.suppressesClick({ detail: 1 }), false);
  swipe.down(event());
  swipe.move(event(115));
  swipe.up(event(115));
  eq(steps, [1], "short swipe snaps back");
  swipe.down(event());
  swipe.move(event(170));
  swipe.up(event(170));
  eq(steps, [1, -1], "right goes back");
  swipe.down(event());
  swipe.move(event(-900));
  eq(offsets.at(-1), [-20, true], "visual displacement bounded");
  swipe.cancel();
  swipe.up(event(-900));
  eq(steps, [1, -1], "cancel does not select");
  eq(capture, null);
  swipe.down({ ...event(), button: 2 });
  swipe.move(event(0));
  swipe.up(event(0));
  eq(steps, [1, -1], "secondary mouse button ignored");
  swipe.down(event());
  swipe.move(event(52));
  swipe.up(event(52));
  eq(steps, [1, -1, 1], "48px threshold is inclusive");
  swipe.down(event());
  swipe.move(event(150, 160));
  swipe.up(event(180, 190));
  eq(steps, [1, -1, 1], "diagonal vertical intent does not switch");
  process.stdout.write(
    JSON.stringify(
      {
        status: "passed",
        assertions: checks,
        scope:
          "actual task swipe handler; touch intent, capture, cancellation and click suppression",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  Date.now = originalNow;
  await fs.rm(temp, { recursive: true, force: true });
}
