import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
const compiled = await build({
  entryPoints: ["frontend/src/interaction/openExternalUrl.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
globalThis.window = { location: { href: "https://8.148.190.114/dorm-duty/" } };
const { normalizeExternalUrl, openExternalUrl } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
let checks = 0;
const eq = (a, b) => {
  assert.deepEqual(a, b);
  checks++;
};
for (const bad of [
  "javascript:alert(1)",
  "http://github.com/",
  "data:text/html,x",
  "https://name:secret@github.com/",
  "file:///tmp/a",
  "https://",
])
  eq(normalizeExternalUrl(bad), null);
eq(
  normalizeExternalUrl("/dorm-duty/vendor/emotion-ball/LICENSE.txt"),
  "https://8.148.190.114/dorm-duty/vendor/emotion-ball/LICENSE.txt",
);
const urls = [
  "https://github.com/sam70361/aora-bot",
  "https://github.com/RUIAN12138/dorm-duty",
  "https://8.148.190.114/dorm-duty/vendor/emotion-ball/LICENSE.txt",
];
let opened = [];
const location = {
  href: "",
  replace(url) {
    this.href = url;
  },
};
const popup = { opener: {}, location, close() {} };
window.open = (...args) => {
  opened.push(args);
  return popup;
};
for (const url of urls) {
  eq((await openExternalUrl(url)).via, "web");
}
eq(opened.length, 3);
window.open = () => null;
await assert.rejects(openExternalUrl(urls[0]), /打开|浏览器|复制|拦截/);
checks++;
// Android dedicated native reply does not touch push's onmessage callback.
const pushHandler = () => {};
window.DormNativePush = {
  onmessage: pushHandler,
  postMessage() {
    throw Error("wrong port");
  },
};
window.DormExternalUrl = {
  onmessage: null,
  postMessage(raw) {
    const request = JSON.parse(raw);
    eq(request.command, "openExternal");
    queueMicrotask(() =>
      this.onmessage({ data: JSON.stringify({ id: request.id, ok: true }) }),
    );
  },
};
eq((await openExternalUrl(urls[0])).via, "native");
eq(window.DormNativePush.onmessage, pushHandler);
window.DormExternalUrl.postMessage = function (raw) {
  const request = JSON.parse(raw);
  queueMicrotask(() =>
    this.onmessage({
      data: JSON.stringify({
        id: request.id,
        ok: false,
        message: "无法打开，复制链接",
      }),
    }),
  );
};
await assert.rejects(openExternalUrl(urls[0]), /复制/);
checks++;
delete window.DormExternalUrl;
// A Harmony shared port uses an independent message listener, not onmessage.
const listeners = new Set();
window.DormNativePush = {
  onmessage: pushHandler,
  addEventListener(t, fn) {
    listeners.add(fn);
  },
  removeEventListener(t, fn) {
    listeners.delete(fn);
  },
  postMessage(raw) {
    const request = JSON.parse(raw);
    queueMicrotask(() => {
      for (const fn of listeners)
        fn({ data: JSON.stringify({ id: request.id, ok: true }) });
    });
  },
};
eq((await openExternalUrl(urls[1])).via, "native");
eq(window.DormNativePush.onmessage, pushHandler);
eq(listeners.size, 0);
window.DormNativePush = { onmessage: pushHandler, postMessage() {} };
await assert.rejects(openExternalUrl(urls[0]), /更新|复制/);
checks++;
await fs.mkdir("data/tap-arbitration", { recursive: true });
await fs.writeFile(
  "data/tap-arbitration/external-unit.json",
  JSON.stringify({
    checks,
    platform: "mocked native bridge; not device acceptance",
  }),
);
console.log(
  "PASS " +
    checks +
    " external URL protocol, popup failure, native route, handler isolation and legacy shell checks",
);
