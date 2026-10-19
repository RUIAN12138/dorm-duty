import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import {
  reactive,
  ref,
  effectScope,
} from "../frontend/node_modules/vue/index.mjs";
const requests = [];
globalThis.markerRequest = (values) =>
  new Promise((resolve, reject) =>
    requests.push({ ...values, resolve, reject }),
  );
const result = await build({
  entryPoints: [
    new URL("../frontend/src/composables/useMarkerEditor.ts", import.meta.url)
      .pathname,
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "marker-fixture",
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
          contents: `export const choreRequest=(path,token,options)=>globalThis.markerRequest({path,token,body:JSON.parse(options.body)});`,
        }));
      },
    },
  ],
});
const { useMarkerEditor } = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);

const source = reactive({
  open: true,
  token: "a",
  memberId: 1,
  current: "pixel-01",
});
const busy = ref("");
let closed = 0;
const saved = [];
let editor;
const scope = effectScope();
scope.run(
  () =>
    (editor = useMarkerEditor(() => ({ ...source }), busy, {
      close: () => {
        closed++;
        source.open = false;
      },
      saved: (marker) => saved.push(marker),
    })),
);
assert.equal(editor.draft.value, "pixel-01");
editor.draft.value = "pixel-20";
let pending = editor.save();
await editor.save();
assert.equal(requests.length, 1, "prevent duplicate writes");
assert.deepEqual(requests[0].body, { marker_id: "pixel-20" });
requests[0].reject(Error("occupied"));
await pending;
assert.equal(editor.error.value, "occupied");
assert.equal(editor.draft.value, "pixel-20", "failure preserves choice");
assert.equal(busy.value, "");
pending = editor.save();
source.open = false;
source.open = true;
editor.draft.value = "pixel-30";
requests[1].resolve({});
await pending;
assert.deepEqual(
  saved,
  ["pixel-20"],
  "confirmed receipt uses submitted snapshot",
);
assert.equal(closed, 0, "old success does not close new draft");
assert.equal(editor.draft.value, "pixel-30");
pending = editor.save();
source.open = false;
source.open = true;
requests[2].reject(Error("late"));
await pending;
assert.equal(
  editor.error.value,
  "",
  "old failure does not contaminate new sheet",
);
pending = editor.save();
source.token = "b";
source.memberId = 2;
requests[3].resolve({});
await pending;
assert.equal(saved.length, 1, "old identity cannot receive new marker");
editor.draft.value = "pixel-40";
pending = editor.save();
requests[4].resolve({});
await pending;
assert.equal(closed, 1);
assert.equal(saved[1], "pixel-40");
source.open = true;
pending = editor.save();
scope.stop();
requests[5].resolve({});
await pending;
assert.equal(saved.length, 2, "unmounted editor ignores delayed write");
console.log(
  "Marker editor: submitted snapshot, duplicate prevention, retry, reopen, identity and disposal isolation passed.",
);
