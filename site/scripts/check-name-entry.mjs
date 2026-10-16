import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
const h = await createHarness();
let checks = 0;
const eq = (a, b, label) => {
  checks++;
  assert.deepEqual(a, b, label);
};
async function api(path, data, status = 200, token) {
  const r = await h.request(path, {
    ...(data ? { method: "POST", data } : {}),
    token,
  });
  eq(r.status, status, path.split("?")[0]);
  return r.json();
}
try {
  const r = await api(
    "/guest/create",
    { name: "姓名入口验收", nickname: "甲", members: ["乙", "丙"] },
    201,
  );
  const p = r.dorm.members.find((m) => m.nickname === "乙");
  const url = `/guest/dorm?invite_code=${r.invite_code}`;
  eq(
    (await api(url)).members,
    [],
    "invitation alone never reveals names or IDs",
  );
  eq((await api(url, null, 200, r.access_token)).members.length, 3);
  const count = () =>
    h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM member_sessions").get().n;
  const before = count();
  for (const [input, status] of [
    [{ member_id: p.user_id }, 422],
    [{ nickname: "错名字" }, 403],
    [{ nickname: "乙", member_id: r.member_id }, 403],
    [{ nickname: "乙 ", marker_id: "not-a-mark" }, 422],
  ])
    await api(
      "/chores/claim",
      { invite_code: r.invite_code, ...input },
      status,
    );
  eq(count(), before, "failed name checks never grant sessions");
  const c = await api(
    "/chores/claim",
    { invite_code: r.invite_code, nickname: " 乙 " },
    201,
  );
  eq(c.member.user_id, p.user_id);
  eq(c.is_creator, false);
  eq((await api(url, null, 200, c.access_token)).members.length, 3);
  const tasks = `/guest/tasks?invite_code=${r.invite_code}&member_id=${p.user_id}`;
  await api(tasks, null, 401);
  await api(tasks, null, 200, c.access_token);
  const other = await api(
    "/guest/create",
    { name: "别的宿舍", nickname: "乙" },
    201,
  );
  await api(url, null, 403, other.access_token);
  const claimOwner = await api(
    "/chores/claim",
    { invite_code: r.invite_code, nickname: "甲" },
    201,
  );
  eq(
    claimOwner.is_creator,
    false,
    "knowing creator name cannot grant creator permissions",
  );
  await api("/dorms/current", null, 401, claimOwner.access_token);
  await api(
    "/guest/create",
    { name: "重名宿舍", nickname: "甲", members: ["甲"] },
    422,
  );
  h.db.sqlite
    .prepare("UPDATE users SET nickname=? WHERE id=?")
    .run("乙", r.member_id);
  await api(
    "/chores/claim",
    { invite_code: r.invite_code, nickname: "乙" },
    409,
  );
  h.db.sqlite
    .prepare(
      "UPDATE dorm_members SET is_active=0 WHERE dorm_id=? AND user_id=?",
    )
    .run(r.dorm.id, p.user_id);
  await api(url, null, 401, c.access_token);
  console.log(
    JSON.stringify({
      status: "passed",
      checks,
      scope:
        "exact server-side name entry, private roster, scoped identity, stale membership and duplicate handling",
    }),
  );
} finally {
  await h.close();
}
