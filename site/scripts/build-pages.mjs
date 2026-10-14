import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "pages-dist");
const frontend = resolve(root, "../frontend/dist");
const worker = await readFile(resolve(root, "worker/index.js"));
const index = await readFile(resolve(frontend, "index.html"));
const sw = await readFile(resolve(frontend, "sw.js"));
const manifest = await readFile(resolve(frontend, "manifest.webmanifest"));
const config = JSON.parse(await readFile(resolve(root, "wrangler.pages.json")));
const originalConfig = JSON.parse(
  await readFile(resolve(root, "wrangler.json")),
);
assert.equal(
  config.d1_databases[0].database_id,
  originalConfig.d1_databases[0].database_id,
  "Pages must reuse the existing cloud database",
);
assert.equal(
  config.vars.DEFAULT_DORM_INVITE_CODE,
  originalConfig.vars.DEFAULT_DORM_INVITE_CODE,
);
// Only this script's generated directory is replaced. No local database is read.
await rm(dist, { recursive: true, force: true });
await cp(frontend, dist, { recursive: true });
await writeFile(resolve(dist, "_worker.js"), worker);
await writeFile(
  resolve(dist, "_routes.json"),
  JSON.stringify(
    {
      version: 1,
      include: ["/*"],
      exclude: ["/assets/*", "/marks/*", "/icons/*"],
    },
    null,
    2,
  ) + "\n",
);
// The exact existing Worker serves APIs, SPA deep links and the SW headers.
// Only public static directories bypass it to avoid needless Function requests.
const hash = (value) => createHash("sha256").update(value).digest("hex");
await mkdir(resolve(root, ".wrangler"), { recursive: true });
const release = resolve(root, ".wrangler/pages-release");
await mkdir(release, { recursive: true });
await writeFile(
  resolve(release, "wrangler.json"),
  JSON.stringify(
    { ...config, pages_build_output_dir: "../../pages-dist" },
    null,
    2,
  ) + "\n",
);
await writeFile(
  resolve(dist, "../.wrangler/pages-package.json"),
  JSON.stringify(
    {
      built_at: new Date().toISOString(),
      status: "prepared, not deployed or network-accepted",
      project: config.name,
      database_id: config.d1_databases[0].database_id,
      worker_sha256: hash(worker),
      index_sha256: hash(index),
      sw_sha256: hash(sw),
      manifest_sha256: hash(manifest),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Pages package prepared: ${dist}; existing Worker and D1 retained.`,
);
