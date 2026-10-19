import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import { reactive, effectScope } from "../frontend/node_modules/vue/index.mjs";
const requests = [];
globalThis.historyRequest = (value) =>
  new Promise((resolve, reject) =>
    requests.push({ ...value, resolve, reject }),
  );
const result = await build({
  entryPoints: [
    new URL(
      "../frontend/src/composables/useHistoryMutation.ts",
      import.meta.url,
    ).pathname,
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "history-fixture",
      setup(b) {
        b.onResolve({ filter: /^vue$/ }, () => ({
          path: new URL(
            "../frontend/node_modules/vue/index.mjs",
            import.meta.url,
          ).href,
          external: true,
        }));
        b.onResolve({ filter: /api\/chores$/ }, () => ({
          path: "chores",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: `export const choreRequest=(path,token,options)=>globalThis.historyRequest({path,token,method:options.method,body:JSON.parse(options.body)});`,
        }));
      },
    },
  ],
});
const { useHistoryMutation } = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);

const source = reactive({
  open: true,
  token: "a",
  memberId: 1,
  blocked: false,
  version: 7,
  recordId: 12,
  revision: 2,
  member: 1,
  key: "floor",
  reason: "修正时间",
  when: "2026-10-18T12:00",
  today: "2026-10-19",
});
let mutation,
  closed = 0,
  saved = 0;
const confirmations = [];
const scope = effectScope();
scope.run(
  () =>
    (mutation = useHistoryMutation(() => ({ ...source }), {
      confirm: () =>
        new Promise((resolve, reject) =>
          confirmations.push({ resolve, reject }),
        ),
      saved: () => saved++,
      close: () => {
        closed++;
        source.open = false;
      },
    })),
);
source.when = "2026-02-30T12:00";
await mutation.save();
assert.equal(requests.length, 0);
assert.match(mutation.error.value, /有效/);
source.when = "2026-10-20T12:00";
await mutation.save();
assert.equal(requests.length, 0);
source.when = "2026-10-18T12:00";
let pending = mutation.save();
await mutation.save();
assert.equal(requests.length, 1);
source.version = 8;
source.when = "2026-10-17T12:00";
assert.equal(requests[0].body.version, 7);
assert.equal(requests[0].body.completed_at, "2026-10-18T12:00:00+08:00");
requests[0].reject(Error("conflict"));
await pending;
assert.equal(mutation.error.value, "conflict");
assert.equal(source.reason, "修正时间");
pending = mutation.save(true);
await mutation.save(true);
assert.equal(confirmations.length, 1, "lock while confirming");
source.open = false;
source.open = true;
confirmations[0].resolve();
await pending;
assert.equal(requests.length, 1, "closing while confirming cancels deletion");
pending = mutation.save();
source.open = false;
source.open = true;
source.recordId = 13;
requests[1].resolve({});
await pending;
assert.equal(saved, 1);
assert.equal(closed, 0, "old success cannot close another draft");
pending = mutation.save();
source.open = false;
source.open = true;
requests[2].reject(Error("late"));
await pending;
assert.equal(mutation.error.value, "");
pending = mutation.save(true);
confirmations[1].resolve();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(requests[3].method, "DELETE");
assert.equal(requests[3].body.id, 13);
source.token = "b";
requests[3].resolve({});
await pending;
assert.equal(saved, 1, "old identity cannot receive success");
source.blocked = true;
await mutation.save();
assert.equal(requests.length, 4);
source.blocked = false;
pending = mutation.save();
scope.stop();
requests[4].resolve({});
await pending;
assert.equal(saved, 1);
console.log(
  "History mutation: valid dates, immutable version/payload, conflict retention, confirmation lock/cancel, reopen/record/identity/disposal isolation passed.",
);
