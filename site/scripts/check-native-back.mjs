import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dorm-back-"));
let assertions = 0;
const eq = (a, b) => {
  assertions++;
  assert.deepEqual(a, b);
};
globalThis.window = {};
try {
  await build({
    stdin: {
      contents: 'export * from "./nativeBack.ts";',
      resolveDir: new URL("../../frontend/src/interactions/", import.meta.url)
        .pathname,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(directory, "back.mjs"),
  });
  const { installNativeBack, registerNativeBack, handleNativeBack } =
    await import(pathToFileURL(path.join(directory, "back.mjs")));
  const cleanup = installNativeBack();
  eq(window.DormNativeBack(), false);
  const calls = [];
  const removeMenu = registerNativeBack(() => calls.push("menu"));
  const removeDetails = registerNativeBack(() => calls.push("details"));
  eq(window.DormNativeBack(), true);
  eq(calls, ["details"]);
  removeDetails();
  removeDetails();
  eq(handleNativeBack(), true);
  eq(calls, ["details", "menu"]);
  removeMenu();
  eq(handleNativeBack(), false);
  cleanup();
  eq(window.DormNativeBack, undefined);
  let dispose;
  dispose = registerNativeBack(() => dispose());
  eq(handleNativeBack(), true);
  eq(handleNativeBack(), false);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        assertions,
        scope:
          "topmost sheet consumes back; empty stack falls through; close/unmount removes handler",
      },
      null,
      2,
    ),
  );
} finally {
  delete globalThis.window;
  await fs.rm(directory, { recursive: true, force: true });
}
