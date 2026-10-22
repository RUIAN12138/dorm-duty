import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function checkScope(root, gate = "check") {
  if (!["check", "pr", "publish"].includes(gate)) throw Error("Unknown gate");
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const home = path.join(root, "openspec/changes");
  const entries = fs
    .readdirSync(home, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "archive");
  if (!entries.length) {
    if (gate !== "check")
      throw Error("No active acceptance record; gate closed");
    return { files: 0, changes: 0, digest: null, gate };
  }
  const manifests = entries.map((e) => {
    const file = path.join(home, e.name, "scope.json");
    if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink())
      throw Error(`Missing regular scope.json: ${e.name}`);
    const m = JSON.parse(fs.readFileSync(file, "utf8"));
    if (
      !/^[a-f0-9]{40}$/.test(m.base) ||
      !Array.isArray(m.allowed) ||
      !m.allowed.length
    )
      throw Error(`Invalid manifest: ${e.name}`);
    for (const p of m.allowed) {
      if (
        typeof p !== "string" ||
        !p ||
        p.startsWith("/") ||
        p.includes("\\") ||
        p.split("/").some((x) => x === ".." || x === ".") ||
        /[*?\[\]]/.test(p) ||
        ["frontend/", "scripts/", "site/", "deploy/", "native/"].includes(p)
      )
        throw Error(`Unsafe scope path: ${p}`);
    }
    return { name: e.name, ...m };
  });
  const bases = new Set(manifests.map((m) => m.base));
  if (bases.size !== 1)
    throw Error("Active changes must share one explicit batch baseline");
  const base = manifests[0].base;
  git("merge-base", "--is-ancestor", base, "HEAD");
  // No rename collapsing: both old and new paths must remain in scope.
  const files = [
    ...new Set(
      [
        ...git("diff", "--no-renames", "--name-only", "-z", base, "--").split(
          "\0",
        ),
        ...git(
          "diff",
          "--cached",
          "--no-renames",
          "--name-only",
          "-z",
          base,
          "--",
        ).split("\0"),
        ...git("ls-files", "--others", "--exclude-standard", "-z").split("\0"),
      ].filter(Boolean),
    ),
  ].sort();
  const allowed = manifests.flatMap((m) => m.allowed);
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    if (
      !allowed.some((p) =>
        p.endsWith("/") || p.endsWith("-") ? file.startsWith(p) : file === p,
      )
    )
      throw Error(`Out of scope: ${file}`);
    const full = path.join(root, file);
    let stat;
    try {
      stat = fs.lstatSync(full);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (stat?.isSymbolicLink())
      throw Error(`Changed symlink not allowed: ${file}`);
    let content = fs.existsSync(full)
      ? fs.readFileSync(full)
      : Buffer.from("<deleted>");
    if (/^openspec\/changes\/[^/]+\/scope\.json$/.test(file)) {
      const m = JSON.parse(content.toString());
      delete m.acceptance; // Avoid a circular digest, never ignore implementation.
      content = Buffer.from(JSON.stringify(m));
    }
    hash.update(file);
    hash.update("\0");
    hash.update(stat && stat.mode & 0o111 ? "executable" : "regular");
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  const digest = hash.digest("hex");
  if (gate !== "check") {
    if (!files.length)
      throw Error("No reviewable batch diff; do not reuse stale acceptance");
    for (const m of manifests) {
      const a = m.acceptance;
      if (
        a?.status !== "accepted" ||
        typeof a.userStatement !== "string" ||
        !a.userStatement.trim() ||
        a.acceptedDigest !== digest
      )
        throw Error(
          `User acceptance missing or stale: ${m.name}; digest=${digest}`,
        );
    }
  }
  return { changes: manifests.length, files: files.length, digest, gate };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args[0] !== "--gate" || args.length !== 2))
      throw Error(
        "Usage: node scripts/check-change-scope.mjs [--gate pr|publish]",
      );
    console.log(
      JSON.stringify(checkScope(process.cwd(), args[1] || "check"), null, 2),
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
