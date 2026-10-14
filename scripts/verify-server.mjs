import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyCloudflare } from "./verify-cloudflare.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
await verifyCloudflare(process.argv[2], {
  base: "/dorm-duty/",
  runtime: "node-server",
  storage: "sqlite",
  frontendDirectory: path.join(root, "frontend/dist-server"),
  workerFile: process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(root, "data/server-deploy/release/site/worker/index.js"),
  evidenceRoot: path.join(root, "docs/evidence/server"),
});
