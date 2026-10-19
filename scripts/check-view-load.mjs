import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import { effectScope, nextTick } from "../frontend/node_modules/vue/index.mjs";
let mounted;
const result = await build({
  entryPoints: ["frontend/src/components/useLoad.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "view-fixture",
      setup(b) {
        b.onResolve({ filter: /^file:/ }, (args) => ({
          path: args.path,
          external: true,
        }));
        b.onResolve({ filter: /^vue$/ }, () => ({
          path: "vue",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: `export {ref,onScopeDispose} from ${JSON.stringify(new URL("../frontend/node_modules/vue/index.mjs", import.meta.url).href)};export const onMounted=callback=>globalThis.mountLoad(callback);`,
        }));
      },
    },
  ],
});
globalThis.mountLoad = (callback) => (mounted = callback);
const { useLoad } = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const calls = [];
let form;
const scope = effectScope();
scope.run(
  () =>
    (form = useLoad(
      (signal) =>
        new Promise((resolve, reject) =>
          calls.push({ signal, resolve, reject }),
        ),
    )),
);
const first = mounted();
const second = form.refresh();
assert.equal(calls[0].signal.aborted, true);
calls[0].reject(Error("late"));
await first;
assert.equal(
  form.loading.value,
  true,
  "old finally does not stop current spinner",
);
assert.equal(form.error.value, "");
calls[1].reject(Error("current"));
await second;
assert.equal(form.error.value, "current");
assert.equal(form.loading.value, false);
const retry = form.refresh();
assert.equal(form.error.value, "");
calls[2].resolve();
await retry;
const last = form.refresh();
scope.stop();
assert.equal(calls[3].signal.aborted, true);
calls[3].reject(Error("late disposal"));
await last;
assert.equal(form.error.value, "");
await form.refresh();
assert.equal(calls.length, 4);
await nextTick();
console.log(
  "View load: supersession cancellation, stale errors/finally, retry and scope disposal passed.",
);
