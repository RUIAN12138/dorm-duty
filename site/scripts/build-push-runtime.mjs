import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
await build({
  entryPoints: [
    fileURLToPath(new URL("../../scripts/push-runtime.mjs", import.meta.url)),
  ],
  outfile: fileURLToPath(
    new URL("../runtime/push-runtime.cjs", import.meta.url),
  ),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  minify: false,
  logLevel: "warning",
});
await fs.copyFile(new URL("../node_modules/web-push/LICENSE",import.meta.url),new URL("../runtime/WEB_PUSH_LICENSE",import.meta.url));
console.log("已构建服务器系统推送运行模块");
