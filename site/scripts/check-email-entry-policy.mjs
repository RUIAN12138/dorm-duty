// Isolated SQLite and injected mail only. Never reads deployed credentials.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createHarness } from "./check-cloud-backend.mjs";
import { handleApi } from "../worker/backend.mjs";
import { ensureLocalDemo } from "../local/database.mjs";
import runtime from "../runtime/email-runtime.cjs";
const h = await createHarness(),
  db = h.db.sqlite;
let clock = Date.now(),
  cookie = "",
  service,
  sent = [];
let checks = 0;
const eq = (a, b) => {
  checks++;
  assert.deepEqual(a, b);
};
const digest = (token) => createHash("sha256").update(token).digest("hex");
const config = {
  host: "smtp.example.invalid",
  port: 465,
  user: "fixture@example.invalid",
  from: "fixture@example.invalid",
  password: "fixture-only",
  publicOrigin: "https://backend-test.example",
  otpSecret: "e".repeat(64),
};
const options = {
  config,
  autoStart: false,
  now: () => new Date(clock),
  send: async (message) => sent.push(message),
};
async function api(p, data, status = 200, token, useCookie = true) {
  const r = await service.wrap(
    new Request(config.publicOrigin + p, {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Dorm-Email": "1",
        Origin: config.publicOrigin,
        Cookie: useCookie ? cookie : "",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    }),
    (request, emailCreator) =>
      handleApi(
        request,
        { ...h.env, EMAIL_CREATOR: emailCreator },
        { waitUntil() {} },
      ),
  );
  eq(r.status, status);
  if (r.headers.has("Set-Cookie"))
    cookie = r.headers.get("Set-Cookie").split(";")[0];
  return r.json();
}
async function login() {
  const c = await api(
    "/email/code",
    { email: "migration@example.invalid" },
    202,
  );
  await api("/email/verify", {
    email: "migration@example.invalid",
    challenge_id: c.challenge_id,
    code: sent.at(-1).text.match(/验证码是：(\d{6})/)[1],
    mail_enabled: true,
  });
}
try {
  const demo = ensureLocalDemo(h.db);
  const room = await h
    .request("/guest/create", {
      method: "POST",
      data: { name: "旧身份迁移", nickname: "旧创建者", members: ["室友"] },
    })
    .then((r) => r.json());
  const at = new Date(clock).toISOString(),
    expires = new Date(clock + 86400000).toISOString();
  db.prepare(
    "INSERT INTO email_accounts(email,mail_enabled_at,created_at) VALUES ('migration@example.invalid',?,?)",
  ).run(at, at);
  const account = db.prepare("SELECT id FROM email_accounts").get().id;
  db.prepare(
    "INSERT INTO email_members(account_id,user_id,dorm_id,creator_verified,bound_at) VALUES (?,?,?,1,?)",
  ).run(account, room.member_id, room.dorm.id, at);
  db.prepare(
    "INSERT INTO email_sessions(token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)",
  ).run(digest("a".repeat(64)), account, at, expires);
  db.prepare("INSERT INTO email_grants VALUES (?,?,1)").run(
    digest(room.access_token),
    digest("a".repeat(64)),
  );
  const counts = () =>
    Object.fromEntries(
      [
        "users",
        "dormitories",
        "dorm_members",
        "duty_tasks",
        "email_members",
      ].map((t) => [t, db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]),
    );
  const before = counts();
  service = runtime.createEmailRuntime(h.db, options);
  eq(db.prepare("SELECT COUNT(*) AS n FROM email_sessions").get().n, 0);
  eq(db.prepare("SELECT COUNT(*) AS n FROM email_grants").get().n, 0);
  eq(counts(), before);
  eq(
    db
      .prepare("SELECT COUNT(*) AS n FROM sessions WHERE token_hash=?")
      .get(digest(room.access_token)).n,
    1,
  );
  await api(
    `/guest/dorm?invite_code=${room.invite_code}`,
    null,
    428,
    room.access_token,
  );
  await api(
    `/chores/board?invite_code=${room.invite_code}&member_id=${room.member_id}`,
    null,
    428,
    room.access_token,
  );
  await api("/auth/me", null, 428, room.access_token);
  await api("/auth/login", { username: "anything", password: "anything" }, 409);
  await api(`/guest/dorm?invite_code=${demo}`);
  await api("/guest/dorm");
  await login();
  const linked = await api("/email/enter", { dorm_id: room.dorm.id });
  eq(linked.is_creator, true);
  // App/native requests may carry a scoped Bearer without the WebView cookie.
  await api(
    `/chores/board?invite_code=${room.invite_code}&member_id=${room.member_id}`,
    null,
    200,
    linked.access_token,
    false,
  );
  await api("/auth/me", null, 200, linked.access_token, false);
  const liveCookie = cookie;
  await service.close();
  service = runtime.createEmailRuntime(h.db, options);
  eq((await api("/email/me")).logged_in, true);
  eq(cookie, liveCookie); // restart does not repeat the cutover
  const roomCount = counts();
  db.exec(
    "CREATE TRIGGER fail_email_link BEFORE INSERT ON email_members BEGIN SELECT RAISE(ABORT,'fixture link failure'); END",
  );
  await api("/guest/create", { name: "不能留下孤立宿舍", nickname: "甲" }, 500);
  eq(counts(), roomCount);
  db.exec("DROP TRIGGER fail_email_link");
  await api(
    "/guest/create",
    {
      name: "伪造创建者",
      nickname: "甲",
      EMAIL_CREATOR: { accountId: account },
    },
    422,
  );
  eq(counts(), roomCount);
  // Revocation after validation but before the atomic batch cannot orphan a room.
  const originalBatch = h.db.batch.bind(h.db);
  h.db.batch = async (statements) => {
    h.db.batch = originalBatch;
    db.prepare("DELETE FROM email_sessions WHERE account_id=?").run(account);
    return originalBatch(statements);
  };
  await api(
    "/guest/create",
    { name: "并发退出不能建宿舍", nickname: "甲" },
    401,
  );
  eq(counts(), roomCount);
  clock += 61000;
  await login();
  // An old creator with a recovery code verifies email first; recovery links
  // that account in the same flow and preserves the existing room/member IDs.
  const recoveryRoom = await h
    .request("/guest/create", {
      method: "POST",
      data: { name: "恢复后直接关联邮箱", nickname: "创建者" },
    })
    .then((r) => r.json());
  const recovery = await h
    .request("/dorms/recovery", {
      method: "POST",
      token: recoveryRoom.access_token,
      data: { expected_version: 0 },
    })
    .then((r) => r.json());
  const recovered = await api(
    "/guest/recover",
    {
      invite_code: recoveryRoom.invite_code,
      recovery_code: recovery.recovery_code,
    },
    200,
  );
  eq(recovered.dorm.id, recoveryRoom.dorm.id);
  eq(
    db
      .prepare("SELECT creator_verified FROM email_members WHERE user_id=?")
      .get(recoveryRoom.member_id).creator_verified,
    1,
  );
  await api("/auth/me", null, 200, recovered.access_token, false);
  // Another account cannot bind this member with a valid old proof.
  clock += 61000;
  const c = await api(
    "/email/code",
    { email: "intruder@example.invalid" },
    202,
  );
  await api("/email/verify", {
    email: "intruder@example.invalid",
    challenge_id: c.challenge_id,
    code: sent.at(-1).text.match(/验证码是：(\d{6})/)[1],
    mail_enabled: false,
  });
  await api("/email/bind", { member_token: room.access_token }, 409);
  await service.close();
  service = runtime.createEmailRuntime(h.db, { autoStart: false });
  eq((await api("/email/config")).registration_required, true);
  await api(
    `/guest/dorm?invite_code=${room.invite_code}`,
    null,
    428,
    room.access_token,
  );
  await api(
    "/guest/create",
    { name: "不能无邮箱绕过", nickname: "甲" },
    401,
    undefined,
    false,
  );
  await api("/email/code", { email: "offline@example.invalid" }, 503);
  console.log(`邮箱强制迁移、原生凭证、重启与创建原子性检查通过 ${checks} 项`);
} finally {
  await service?.close();
  h.close();
}
