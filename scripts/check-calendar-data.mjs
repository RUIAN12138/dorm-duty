import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import {
  reactive,
  effectScope,
  nextTick,
} from "../frontend/node_modules/vue/index.mjs";
const vueUrl = new URL(
  "../frontend/node_modules/vue/index.mjs",
  import.meta.url,
).href;
const result = await build({
  stdin: {
    contents: `export {useChoreActivity} from './composables/useChoreActivity';export {mergeCalendarRecords,indexCalendarRecords} from './interaction/calendarRecords';`,
    resolveDir: new URL("../frontend/src", import.meta.url).pathname,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "isolated-read",
      setup(b) {
        b.onResolve({ filter: /^vue$/ }, () => ({
          path: vueUrl,
          external: true,
        }));
        b.onResolve({ filter: /api\/chores$/ }, () => ({
          path: "chores",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents:
            "export const choreRequest=(...args)=>globalThis.activityRequest(...args);",
        }));
      },
    },
  ],
});
const { useChoreActivity, mergeCalendarRecords, indexCalendarRecords } =
  await import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
const requests = [];
globalThis.activityRequest = (path, token, { signal }) =>
  new Promise((resolve, reject) =>
    requests.push({ path, token, signal, resolve, reject }),
  );
const tick = async () => {
  await nextTick();
  await new Promise((r) => setImmediate(r));
};
const source = reactive({
  invite: "ROOM",
  token: "member-one",
  version: 1,
  today: "2026-10-19",
  active: false,
});
const scope = effectScope();
let resource;
scope.run(() => {
  resource = useChoreActivity(() => ({ ...source }));
});
await tick();
assert.equal(requests.length, 0, "grid and list do not fetch statistics");
source.active = true;
await tick();
assert.equal(requests.length, 1);
const same = resource.refresh();
const sameAgain = resource.refresh();
assert.equal(same, sameAgain, "concurrent same-version refresh shares request");
assert.equal(requests.length, 1);
const snapshot = {
  today: source.today,
  start: source.today,
  daily: [],
  recent_records: [],
  recent_truncated: false,
};
requests[0].resolve(snapshot);
assert.equal(await same, true);
assert.deepEqual(JSON.parse(JSON.stringify(resource.activity.value)), snapshot);
source.active = false;
source.active = true;
await tick();
assert.equal(
  requests.length,
  1,
  "returning to same-version stats uses cached data",
);
source.active = false;
source.version = 2;
await tick();
assert.equal(requests.length, 1, "hidden stats defer version refresh");
source.active = true;
await tick();
assert.equal(requests.length, 2);
assert.ok(resource.activity.value, "refresh retains visible data");
requests[1].reject(Error("temporary failure"));
await tick();
assert.equal(resource.error.value, "temporary failure");
assert.ok(resource.activity.value, "failure retains previous snapshot");
const retry = resource.refresh();
await tick();
assert.equal(requests.length, 3);
source.version = 3;
await tick();
assert.equal(requests.length, 4);
assert.equal(requests[2].signal.aborted, true);
requests[3].resolve({ ...snapshot, today: "newer" });
await tick();
requests[2].resolve({ ...snapshot, today: "older" });
await retry;
await tick();
assert.equal(
  resource.activity.value.today,
  "newer",
  "late obsolete response cannot overwrite newer data",
);
source.token = "member-two";
await tick();
assert.equal(
  resource.activity.value,
  null,
  "identity change immediately clears old snapshot",
);
assert.equal(requests[4].token, "member-two");
source.active = false;
assert.equal(requests[4].signal.aborted, true);
requests[4].resolve(snapshot);
await tick();
assert.equal(
  resource.activity.value,
  null,
  "hidden cancelled response is ignored",
);
source.active = true;
await tick();
const last = requests.at(-1);
scope.stop();
assert.equal(last.signal.aborted, true);
last.resolve(snapshot);
await tick();
assert.equal(
  resource.activity.value,
  null,
  "disposed component ignores late data",
);
const record = (id, date, time, name = "task") => ({
  id,
  key: "floor",
  name,
  assignee_id: 1,
  assignee_name: "A",
  marker_id: "pixel-01",
  completed_date: date,
  completed_at: time,
});
const old = record(1, "2026-09-30", "2026-09-30T10:00:00Z", "old");
const corrected = {
  ...old,
  name: "corrected",
  completed_date: "2026-10-01",
  completed_at: "2026-10-01T10:00:00Z",
};
const adjacent = record(2, "2026-11-01", "2026-11-01T10:00:00Z");
const merged = mergeCalendarRecords([corrected], {
  "2026-09": [old],
  "2026-11": [adjacent],
});
assert.equal(
  merged.length,
  2,
  "overlapping snapshots do not duplicate records",
);
assert.equal(merged.find((r) => r.id === 1).name, "corrected");
const dates = indexCalendarRecords(merged);
assert.equal(
  dates.get("2026-09-30"),
  undefined,
  "corrected date does not leave a stale calendar mark",
);
assert.equal(
  dates.get("2026-11-01")[0].id,
  2,
  "preloaded neighboring month available to list and drawer",
);
assert.equal(merged[0].id, 2, "stable newest-first ordering");
console.log(
  "Calendar data: lazy reads, in-flight dedupe, version cache, retained data, retry, stale response, identity isolation, disposal and neighboring-month records passed.",
);
