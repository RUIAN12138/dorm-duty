import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dorm-nudge-"));
let assertions = 0;
const eq = (a, b) => {
  assertions++;
  assert.deepEqual(a, b);
};
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, v),
};
try {
  await build({
    stdin: {
      contents:
        'export {waterNudge,lastWaterNudge,waterNudgeTime} from "./waterNudge.ts"; export {ApiError} from "./index.ts";',
      resolveDir: new URL("../../frontend/src/api/", import.meta.url).pathname,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(directory, "nudge.mjs"),
  });
  const { waterNudge, lastWaterNudge, waterNudgeTime, ApiError } = await import(
    pathToFileURL(path.join(directory, "nudge.mjs"))
  );
  let calls = 0,
    time = 100000,
    release;
  const gate = new Promise((r) => (release = r));
  const send = async () => {
    calls++;
    await gate;
    return { created_at: new Date(time - 1000).toISOString() };
  };
  const first = waterNudge("burst", send, () => time);
  const burst = await Promise.all(
    Array.from({ length: 200 }, () => waterNudge("burst", send, () => time)),
  );
  eq(calls, 1);
  eq(
    burst.every((x) => x === "sending"),
    true,
  );
  release();
  eq(await first, "sent");
  const originalTime = new Date(time - 1000).toISOString();
  eq(lastWaterNudge("burst"), originalTime);
  eq(await waterNudge("burst", send, () => time), "recent");
  eq(lastWaterNudge("burst"), originalTime);
  eq(calls, 1);
  const restored = await import(
    pathToFileURL(path.join(directory, "nudge.mjs")).href + "?restored"
  );
  eq(await restored.waterNudge("burst", send, () => time), "recent");
  eq(restored.lastWaterNudge("burst"), originalTime);
  eq(calls, 1);
  time += 60000;
  eq(await waterNudge("burst", send, () => time), "sent");
  eq(calls, 2);
  eq(lastWaterNudge("burst"), new Date(time - 1000).toISOString());
  await assert.rejects(
    () =>
      waterNudge(
        "failure",
        async () => {
          throw new Error("network");
        },
        () => time,
      ),
    /network/,
  );
  assertions++;
  eq(lastWaterNudge("failure"), null);
  eq(
    await waterNudge(
      "failure",
      async () => {
        calls++;
      },
      () => time,
    ),
    "sent",
  );
  let limitedCalls = 0;
  eq(
    await waterNudge(
      "limited",
      async () => {
        limitedCalls++;
        throw new ApiError(429, "cooldown");
      },
      () => time,
    ),
    "recent",
  );
  eq(
    await waterNudge(
      "limited",
      async () => {
        limitedCalls++;
      },
      () => time,
    ),
    "recent",
  );
  eq(limitedCalls, 1);
  eq(
    lastWaterNudge("limited"),
    null,
    "429 without a receipt must not invent a send time",
  );
  time += 60000;
  eq(
    await waterNudge(
      "burst",
      async () => {
        throw new ApiError(429, "cooldown");
      },
      () => time,
    ),
    "recent",
  );
  eq(lastWaterNudge("burst"), new Date(time - 60000 - 1000).toISOString());
  storage.set("dorm-water-nudge-receipt-v1:corrupt", "invalid date");
  eq(lastWaterNudge("corrupt"), null);
  eq(lastWaterNudge("another-member"), null);
  eq(
    waterNudgeTime("2026-10-14T06:32:08Z", new Date("2026-10-14T07:00:00Z")),
    "27分钟前已提醒",
  );
  eq(
    waterNudgeTime("2026-10-13T16:00:00Z", new Date("2026-10-14T07:00:00Z")),
    "15小时前已提醒",
  );
  eq(
    waterNudgeTime("2026-10-13T15:59:59Z", new Date("2026-10-14T07:00:00Z")),
    "15小时前已提醒",
  );
  const receiptTime = "2026-10-14T06:32:08Z";
  for (const [milliseconds, caption] of [
    [-1000, "刚刚已提醒"],
    [0, "刚刚已提醒"],
    [59999, "刚刚已提醒"],
    [60000, "1分钟前已提醒"],
    [180000, "3分钟前已提醒"],
    [3599999, "59分钟前已提醒"],
    [3600000, "1小时前已提醒"],
    [86400000, "1天前已提醒"],
  ]) {
    eq(
      waterNudgeTime(
        receiptTime,
        new Date(Date.parse(receiptTime) + milliseconds),
      ),
      caption,
    );
  }
  eq(waterNudgeTime("invalid date"), "");
  // Another task/member must not inherit an unrelated reminder's cooldown.
  eq(
    await waterNudge(
      "another-member",
      async () => {
        calls++;
      },
      () => time,
    ),
    "sent",
  );
  console.log(
    JSON.stringify(
      {
        assertions,
        status: "passed",
        scope:
          "200 concurrent taps, persisted server receipt, stable time on repeat/429, retry after failure, identity isolation, relative minute/hour/day boundaries",
      },
      null,
      2,
    ),
  );
} finally {
  delete globalThis.localStorage;
  await fs.rm(directory, { recursive: true, force: true });
}
