import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createHarness } from "./check-cloud-backend.mjs";
let assertions = 0;
const secrets = new Set();
const equal = (a, b, m) => {
  assertions++;
  assert.deepEqual(a, b, m || "values match");
};
const ok = (v, m) => {
  assertions++;
  assert(v, m);
};
const tests = [];
const test = (name, run) => tests.push({ name, run });
async function api(h, path, { status = 200, ...options } = {}) {
  const r = await h.request(path, options);
  equal(r.status, status, path.split("?")[0]);
  ok(r.headers.get("Cache-Control").includes("no-store"));
  const result = await r.json();
  for (const key of ["access_token", "recovery_code"])
    if (result[key]) secrets.add(result[key]);
  return result;
}
const create = (h) =>
  api(h, "/guest/create", {
    method: "POST",
    status: 201,
    data: { name: "恢复权限隔离验收", nickname: "创建者", members: ["室友"] },
  });
const configure = (h, r, version = 0, status = 200) =>
  api(h, "/dorms/recovery", {
    token: r.access_token,
    method: "POST",
    status,
    data: { expected_version: version },
  });
const recover = (h, r, code, status = 200) =>
  api(h, "/guest/recover", {
    method: "POST",
    status,
    data: { invite_code: r.invite_code, recovery_code: code },
  });
const settings = (h, r, token = r.access_token) =>
  api(
    h,
    `/chores/board?invite_code=${r.invite_code}&member_id=${r.member_id}`,
    { token },
  );
test("only a creator session may read or generate recovery credentials", async (h) => {
  const r = await create(h);
  equal(await api(h, "/dorms/recovery", { token: r.access_token }), {
    configured: false,
    version: 0,
    updated_at: null,
  });
  for (const method of ["GET", "POST"]) {
    await api(h, "/dorms/recovery", {
      method,
      status: 401,
      ...(method === "POST" ? { data: { expected_version: 0 } } : {}),
    });
    for (const id of r.dorm.members.map((m) => m.user_id)) {
      const claimed = await api(h, "/chores/claim", {
        method: "POST",
        status: 201,
        data: { invite_code: r.invite_code, member_id: id, nickname: r.dorm.members.find(m => m.user_id === id).nickname },
      });
      await api(h, "/dorms/recovery", {
        method,
        token: claimed.access_token,
        status: 401,
        ...(method === "POST" ? { data: { expected_version: 0 } } : {}),
      });
    }
  }
  const generated = await configure(h, r);
  ok(/^[a-f0-9]{64}$/.test(generated.recovery_code));
  const row = h.db.sqlite.prepare("SELECT * FROM creator_recovery").get();
  equal(
    row.code_hash,
    createHash("sha256").update(generated.recovery_code).digest("hex"),
  );
  ok(!JSON.stringify(row).includes(generated.recovery_code));
  const read = await api(h, "/dorms/recovery", { token: r.access_token });
  equal(Object.keys(read).sort(), ["configured", "updated_at", "version"]);
  equal(read.version, 1);
  equal(read.configured, true);
  await api(h, "/dorms/recovery", {
    method: "POST",
    token: r.access_token,
    status: 422,
    data: { expected_version: 1, dorm_id: r.dorm.id },
  });
});
test("recovering preserves membership, marks and completed history and restores actual administrator actions", async (h) => {
  const r = await create(h),
    b = await settings(h, r);
  await api(h, `/chores/tasks/${b.today_tasks[0].id}/complete`, {
    method: "PATCH",
    token: r.access_token,
    data: {},
  });
  const snapshot = () =>
    JSON.stringify({
      members: h.db.sqlite
        .prepare("SELECT * FROM dorm_members ORDER BY id")
        .all(),
      marks: h.db.sqlite
        .prepare("SELECT * FROM member_marks ORDER BY id")
        .all(),
      completed: h.db.sqlite
        .prepare(
          "SELECT * FROM chore_tasks WHERE status='completed' ORDER BY id",
        )
        .all(),
    });
  const before = snapshot(),
    generated = await configure(h, r);
  const grouped = generated.recovery_code
    .toUpperCase()
    .match(/.{4}/g)
    .join("-");
  const recovered = await recover(h, r, grouped);
  equal(recovered.member_id, r.member_id);
  equal(recovered.dorm.id, r.dorm.id);
  equal(recovered.dorm.members, r.dorm.members);
  ok(recovered.access_token !== r.access_token);
  const dorm = await api(h, "/dorms/current", {
    token: recovered.access_token,
  });
  equal(dorm.is_admin, true);
  const board = await settings(h, r, recovered.access_token);
  equal(board.is_creator, true);
  await api(h, "/chores/settings", {
    method: "PATCH",
    token: recovered.access_token,
    data: {
      version: board.version,
      categories: [{ key: "floor", content: "清理地板" }],
    },
  });
  equal(snapshot(), before);
  const again = await recover(h, r, generated.recovery_code);
  ok(again.access_token !== recovered.access_token);
  equal((await api(h, "/auth/me", { token: r.access_token })).id, r.member_id);
  equal(
    (await api(h, "/auth/me", { token: again.access_token })).id,
    r.member_id,
  );
});
test("wrong code, wrong dorm, unconfigured dorm and invalid input reveal no administrator credentials", async (h) => {
  const a = await create(h),
    b = await create(h),
    generated = await configure(h, a);
  const wrong = await recover(h, a, "0".repeat(64), 403);
  equal(await recover(h, b, generated.recovery_code, 403), wrong);
  equal(
    await recover(
      h,
      { ...a, invite_code: "NOTREAL1" },
      generated.recovery_code,
      403,
    ),
    wrong,
  );
  for (const code of [
    "",
    "bad",
    "f".repeat(63),
    "a".repeat(129),
    { code: generated.recovery_code },
  ])
    await recover(h, a, code, 422);
  equal(
    (await api(h, "/dorms/recovery", { token: b.access_token })).configured,
    false,
  );
  equal(h.db.sqlite.prepare("SELECT count(*) AS n FROM sessions").get().n, 2);
});
test("concurrent generation uses compare-and-swap and rotation invalidates the prior code", async (h) => {
  const r = await create(h);
  const parallel = () =>
    Promise.all(
      [0, 1].map(() =>
        h.request("/dorms/recovery", {
          method: "POST",
          token: r.access_token,
          data: { expected_version: 0 },
        }),
      ),
    );
  const responses = await parallel();
  equal(responses.map((x) => x.status).sort(), [200, 409]);
  const result = await responses.find((x) => x.status === 200).json();
  secrets.add(result.recovery_code);
  equal(
    h.db.sqlite.prepare("SELECT revision FROM creator_recovery").get().revision,
    1,
  );
  const rotated = await configure(h, r, 1);
  equal(rotated.version, 2);
  ok(rotated.recovery_code !== result.recovery_code);
  await recover(h, r, result.recovery_code, 403);
  await recover(h, r, rotated.recovery_code);
  await configure(h, r, 1, 409);
  equal(
    (await api(h, "/dorms/recovery", { token: r.access_token })).version,
    2,
  );
});
test("departed, demoted, transferred and demo creators cannot regain obsolete authority", async (h) => {
  for (const condition of [
    "departed",
    "demoted",
    "transferred",
    "demo",
    "different_room",
  ]) {
    const r = await create(h),
      key = await configure(h, r),
      member = r.dorm.members.find((m) => m.user_id !== r.member_id);
    if (condition === "departed")
      h.db.sqlite
        .prepare(
          "UPDATE dorm_members SET is_active=0 WHERE dorm_id=? AND user_id=?",
        )
        .run(r.dorm.id, r.member_id);
    if (condition === "demoted")
      h.db.sqlite
        .prepare(
          "UPDATE dorm_members SET role='member' WHERE dorm_id=? AND user_id=?",
        )
        .run(r.dorm.id, r.member_id);
    if (condition === "transferred")
      h.db.sqlite
        .prepare("UPDATE dormitories SET admin_user_id=? WHERE id=?")
        .run(member.user_id, r.dorm.id);
    if (condition === "demo")
      h.db.sqlite
        .prepare("UPDATE dormitories SET is_demo=1 WHERE id=?")
        .run(r.dorm.id);
    if (condition === "different_room")
      h.db.sqlite
        .prepare("UPDATE users SET current_dorm_id=NULL WHERE id=?")
        .run(r.member_id);
    const before = h.db.sqlite
      .prepare("SELECT count(*) AS n FROM sessions")
      .get().n;
    await recover(h, r, key.recovery_code, 403);
    equal(
      h.db.sqlite.prepare("SELECT count(*) AS n FROM sessions").get().n,
      before,
    );
  }
});
test("logout between authorization and generation write cannot rotate the existing credential", async (h) => {
  const r = await create(h),
    key = await configure(h, r),
    original = h.db.prepare.bind(h.db);
  h.db.prepare = (sql) => {
    const s = original(sql),
      bind = s.bind.bind(s);
    s.bind = (...args) => {
      const bound = bind(...args);
      if (sql.startsWith("INSERT INTO creator_recovery")) {
        const run = bound.run.bind(bound);
        bound.run = async () => {
          h.db.sqlite
            .prepare("DELETE FROM sessions WHERE user_id=?")
            .run(r.member_id);
          return run();
        };
      }
      return bound;
    };
    return s;
  };
  await configure(h, r, 1, 409);
  h.db.prepare = original;
  equal(
    h.db.sqlite.prepare("SELECT revision FROM creator_recovery").get().revision,
    1,
  );
  await recover(h, r, key.recovery_code);
});
const results = [];
test("recovery returns the current room when the creator owns an inactive historical room", async (h) => {
  const old = await create(h);
  h.db.sqlite
    .prepare("UPDATE dorm_members SET is_active=0 WHERE user_id=?")
    .run(old.member_id);
  h.db.sqlite
    .prepare("UPDATE users SET current_dorm_id=NULL WHERE id=?")
    .run(old.member_id);
  const next = await api(h, "/dorms", {
    method: "POST",
    status: 201,
    token: old.access_token,
    data: { name: "新的宿舍" },
  });
  const key = await configure(h, old);
  const result = await recover(
    h,
    { ...old, invite_code: next.invite_code },
    key.recovery_code,
  );
  equal(result.dorm.id, next.id);
  equal(result.invite_code, next.invite_code);
});
test("invite rotation keeps the room recovery key but rejects the former invite", async (h) => {
  const r = await create(h),
    key = await configure(h, r);
  const rotated = await api(h, "/dorms/current/invite-code/rotate", {
    method: "POST",
    token: r.access_token,
  });
  await recover(h, r, key.recovery_code, 403);
  const result = await recover(
    h,
    { ...r, invite_code: rotated.invite_code },
    key.recovery_code,
  );
  equal(result.dorm.id, r.dorm.id);
  equal(
    (await api(h, "/dorms/recovery", { token: result.access_token })).version,
    1,
  );
});
test("additive recovery migration preserves existing completion rows", async (h) => {
  h.db.sqlite.exec("DROP TABLE creator_recovery");
  const r = await create(h),
    board = await settings(h, r);
  await api(h, `/chores/tasks/${board.today_tasks[0].id}/complete`, {
    method: "PATCH",
    token: r.access_token,
    data: {},
  });
  const query =
    "SELECT * FROM chore_tasks WHERE status='completed' ORDER BY id";
  const before = h.db.sqlite.prepare(query).all();
  h.db.sqlite.exec(
    await readFile(
      new URL("../drizzle/0005_creator_recovery.sql", import.meta.url),
      "utf8",
    ),
  );
  equal(h.db.sqlite.prepare(query).all(), before);
  equal(h.db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  const key = await configure(h, r);
  await recover(h, r, key.recovery_code);
  equal(h.db.sqlite.prepare(query).all(), before);
});
for (const entry of tests) {
  const h = await createHarness(),
    before = assertions;
  try {
    await entry.run(h);
    results.push({
      name: entry.name,
      status: "passed",
      assertions: assertions - before,
    });
  } catch (e) {
    let reason = String(e.message);
    for (const secret of secrets)
      reason = reason.split(secret).join("[redacted]");
    results.push({
      name: entry.name,
      status: "failed",
      reason: reason.slice(0, 650),
    });
  } finally {
    h.close();
  }
}
console.log(
  JSON.stringify(
    {
      scope:
        "isolated SQLite; recovery authorization and history preservation; no production credentials",
      assertions,
      passed: results.filter((x) => x.status === "passed").length,
      failed: results.filter((x) => x.status === "failed").length,
      tests: results,
    },
    null,
    2,
  ),
);
if (results.some((x) => x.status === "failed")) process.exitCode = 1;
