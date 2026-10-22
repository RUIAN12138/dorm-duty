import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { checkScope } from "./check-change-scope.mjs";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "dorm-scope-"));
const git = (...a) =>
  execFileSync("git", a, { cwd: root, stdio: "pipe" }).toString().trim();
const write = (p, s) => {
  fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
  fs.writeFileSync(path.join(root, p), s);
};
let checks = 0;
function test(label, fn) {
  fn();
  checks++;
  console.log("PASS " + label);
}
try {
  git("init");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  write("feature.txt", "old");
  git("add", ".");
  git("commit", "-m", "fixture");
  const m = {
    base: git("rev-parse", "HEAD"),
    allowed: ["feature.txt", "openspec/"],
    acceptance: { status: "pending" },
  };
  const save = () =>
    write("openspec/changes/test/scope.json", JSON.stringify(m));
  save();
  write("feature.txt", "new");
  test("allowed working and untracked artifacts", () =>
    assert.equal(checkScope(root).files, 2));
  test("PR requires actual acceptance record", () =>
    assert.throws(() => checkScope(root, "pr"), /acceptance missing/));
  test("publish requires actual acceptance record", () =>
    assert.throws(() => checkScope(root, "publish"), /acceptance missing/));
  write("hidden-stage.txt", "staged only");
  git("add", "hidden-stage.txt");
  fs.rmSync(path.join(root, "hidden-stage.txt"));
  test("staged out-of-scope content cannot hide behind a deleted working file", () =>
    assert.throws(() => checkScope(root), /Out of scope/));
  git("reset", "--", "hidden-stage.txt");
  write("unrelated.txt", "x");
  test("untracked scope violation rejected", () =>
    assert.throws(() => checkScope(root), /Out of scope/));
  git("add", "unrelated.txt");
  git("commit", "-m", "unrelated");
  test("committing cannot hide scope violation", () =>
    assert.throws(() => checkScope(root), /Out of scope/));
  git("rm", "unrelated.txt");
  git("commit", "-m", "remove unrelated");
  m.acceptance = {
    status: "accepted",
    userStatement: "fixture only",
    acceptedDigest: checkScope(root).digest,
  };
  save();
  test("acceptance binds current content", () =>
    assert.equal(checkScope(root, "pr").gate, "pr"));
  write("feature.txt", "changed again");
  test("changed content invalidates approval", () =>
    assert.throws(() => checkScope(root, "publish"), /stale/));
  fs.rmSync(path.join(root, "feature.txt"));
  fs.symlinkSync("/tmp", path.join(root, "feature.txt"));
  test("changed symlinks rejected", () =>
    assert.throws(() => checkScope(root), /symlink/));
  fs.rmSync(path.join(root, "feature.txt"));
  write("feature.txt", "new");
  m.allowed = ["../"];
  save();
  test("path traversal rejected", () =>
    assert.throws(() => checkScope(root), /Unsafe/));
  fs.rmSync(path.join(root, "openspec/changes/test"), { recursive: true });
  test("missing acceptance records fail closed for publishing", () =>
    assert.throws(() => checkScope(root, "publish"), /gate closed/));
  console.log(`${checks} scope gate checks passed (temporary fixture only)`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
