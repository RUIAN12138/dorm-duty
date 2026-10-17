import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composeFiles = ["docker-compose.yml", "docker-compose.https.yml"];

function servicesOf(source) {
  const services = [];
  let inServices = false;
  let current = null;
  for (const line of source.split(/\r?\n/)) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }
    if (inServices && /^\S/.test(line)) break;
    const match = inServices && line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (match) {
      current = { name: match[1], lines: [] };
      services.push(current);
    } else if (current) current.lines.push(line);
  }
  return services;
}

for (const file of composeFiles) {
  const source = await readFile(resolve(root, file), "utf8");
  const services = servicesOf(source);
  assert(services.length > 0, `${file} has no services`);
  for (const service of services) {
    const block = service.lines.join("\n");
    assert(
      block && /^    profiles:\s*\[\s*["']legacy["']\s*\]\s*$/m.test(block),
      `${file}:${service.name} must use the legacy profile`,
    );
  }
}

const docker = spawnSync("docker", ["compose", "config", "--services"], {
  cwd: root,
  encoding: "utf8",
});
if (!docker.error) {
  assert.equal(docker.status, 0, docker.stderr || "Docker Compose config failed");
  assert.equal(docker.stdout.trim(), "", "default Compose exposes legacy services");
  console.log("Web architecture isolation passed with Docker Compose CLI.");
} else {
  console.log("Web architecture isolation passed statically; Docker is unavailable.");
}
