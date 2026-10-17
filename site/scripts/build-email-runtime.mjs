import { build } from "esbuild";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
await build({
  absWorkingDir: fileURLToPath(new URL("../", import.meta.url)),
  entryPoints: [
    fileURLToPath(new URL("../local/email-runtime.mjs", import.meta.url)),
  ],
  outfile: fileURLToPath(
    new URL("../runtime/email-runtime.cjs", import.meta.url),
  ),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  logLevel: "warning",
});
await fs.copyFile(
  new URL("../node_modules/nodemailer/LICENSE", import.meta.url),
  new URL("../runtime/NODEMAILER_LICENSE", import.meta.url),
);
console.log("已构建邮箱账号和邮件提醒运行模块");
