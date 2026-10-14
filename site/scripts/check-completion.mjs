import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dorm-completion-"));
const originalFetch = globalThis.fetch;
let assertions = 0;
const eq = (a, b) => {
  assertions++;
  assert.deepEqual(a, b);
};
const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { onLine: true },
});
try {
  await build({
    stdin: {
      contents: 'export {completeChore} from "./completion.ts";',
      resolveDir: new URL("../../frontend/src/api/", import.meta.url).pathname,
    },
    define: { "import.meta.env.BASE_URL": '"/"' },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(directory, "completion.mjs"),
  });
  const { completeChore } = await import(
    pathToFileURL(path.join(directory, "completion.mjs"))
  );
  const receipt = {
    task: { id: 7, status: "completed", completed_at: "2026-10-14T10:00:00Z" },
    next_water: { id: 8, assignee_id: 2 },
    version: 3,
  };
  let calls = 0,
    accepted;
  globalThis.fetch = async (url, options) => {
    calls++;
    eq(url, "/chores/tasks/7/complete");
    eq(options.method, "PATCH");
    return Response.json(receipt);
  };
  eq(
    await completeChore(
      7,
      "test-member",
      (r) => {
        accepted = r;
      },
      async () => {
        throw new Error("refresh failed");
      },
    ),
    "pending",
  );
  eq(accepted, receipt);
  eq(calls, 1);
  eq(
    await completeChore(
      7,
      "test-member",
      () => {},
      async () => false,
    ),
    "pending",
  );
  eq(
    await completeChore(
      7,
      "test-member",
      () => {},
      async () => true,
    ),
    "synced",
  );
  globalThis.fetch = async () =>
    Response.json({ detail: { message: "不是你的任务" } }, { status: 403 });
  let acceptedDenied = false,
    syncDenied = false;
  await assert.rejects(
    () =>
      completeChore(
        7,
        "test-member",
        () => {
          acceptedDenied = true;
        },
        async () => {
          syncDenied = true;
          return true;
        },
      ),
    /不是你的任务/,
  );
  assertions++;
  eq(acceptedDenied, false);
  eq(syncDenied, false);
  globalThis.fetch = async () => {
    throw new TypeError("offline");
  };
  await assert.rejects(
    () =>
      completeChore(
        7,
        "test-member",
        () => {
          acceptedDenied = true;
        },
        async () => {
          syncDenied = true;
          return true;
        },
      ),
    /连接服务失败/,
  );
  assertions++;
  eq(acceptedDenied, false);
  eq(syncDenied, false);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        assertions,
        scope:
          "confirmed PATCH survives failed refresh; no automatic duplicate write; unconfirmed/denied writes do not mark complete",
      },
      null,
      2,
    ),
  );
} finally {
  globalThis.fetch = originalFetch;
  if (originalNavigator)
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete globalThis.navigator;
  await fs.rm(directory, { recursive: true, force: true });
}
