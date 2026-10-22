import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL(
        "../node_modules/@fission-ai/openspec/bin/openspec.js",
        import.meta.url,
      ),
    ),
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    env: { ...process.env, OPENSPEC_TELEMETRY: "0", DO_NOT_TRACK: "1" },
  },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
