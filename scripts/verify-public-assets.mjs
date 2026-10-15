import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url),
  dist = new URL("frontend/dist-server/", root);
const origin = process.argv[2] || "https://8.148.190.114";
const base = origin.replace(/\/$/, "") + "/dorm-duty/";
const index = await fs.readFile(new URL("index.html", dist));
const routes = ["", "water", "calendar", "manifest.webmanifest", "sw.js"];
for (const file of await fs.readdir(new URL("assets/", dist)))
  if (/\.(?:js|css)$/.test(file)) routes.push("assets/" + file);
const checks = [];
for (const route of routes) {
  const res = await fetch(base + route, { signal: AbortSignal.timeout(20000) });
  assert.equal(res.status, 200, route);
  const actual = Buffer.from(await res.arrayBuffer());
  const expected = ["", "water", "calendar"].includes(route)
    ? index
    : await fs.readFile(new URL(route, dist));
  assert(actual.equals(expected), "deployed bytes differ: " + route);
  checks.push({
    route: route || "/",
    status: res.status,
    sha256: createHash("sha256").update(actual).digest("hex"),
  });
}
const health = await (await fetch(base + "health")).json();
assert.equal(health.runtime, "node-server");
assert.equal(health.storage, "sqlite");
const report = {
  date: new Date().toISOString(),
  origin,
  checks,
  health,
  status: "passed",
  scope: "current frontend build matches production bytes; no business writes",
};
await fs.writeFile(
  new URL(
    process.argv[3] || "docs/evidence/voluntary-rounds/public-assets.json",
    root,
  ),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: report.status,
    resources: checks.length,
    health: health.status,
  }),
);
