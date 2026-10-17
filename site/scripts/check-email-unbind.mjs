// Isolated SQLite, injected mail only. No production credentials or email delivery.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createHarness } from "./check-cloud-backend.mjs";
import { handleApi } from "../worker/backend.mjs";
import runtime from "../runtime/email-runtime.cjs";
const h = await createHarness(),
  db = h.db.sqlite;
let now = Date.now(),
  cookie = "",
  sent = [],
  checks = 0;
const origin = "https://unbind.example.invalid";
const eq = (actual, expected) => {
  assert.deepEqual(actual, expected);
  checks++;
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const service = runtime.createEmailRuntime(h.db, {
  autoStart: false,
  now: () => new Date(now),
  send: async (message) => sent.push(message),
  config: {
    host: "smtp.example.invalid",
    port: 465,
    user: "fixture@example.invalid",
    password: "fixture-only",
    from: "fixture@example.invalid",
    publicOrigin: origin,
    otpSecret: "a".repeat(64),
  },
});
async function api(
  path,
  data,
  status = 200,
  token = "",
  session = cookie,
  headers = {},
) {
  const r = await service.wrap(
    new Request(origin + path, {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Dorm-Email": "1",
        Origin: origin,
        Cookie: session,
        "X-Dorm-Client": "fixture",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
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
  const body = await r.json();
  assert.equal(r.status, status, `${path}: ${JSON.stringify(body)}`);
  checks++;
  if (r.headers.get("Set-Cookie"))
    cookie = r.headers.get("Set-Cookie").split(";")[0];
  return body;
}
async function login(email) {
  const challenge = await api("/email/code", { email }, 202);
  await api("/email/verify", {
    email,
    challenge_id: challenge.challenge_id,
    code: sent.at(-1).text.match(/验证码是：(\d{6})/)[1],
    mail_enabled: true,
  });
  return cookie;
}
try {
  const ownerCookie = await login("owner@example.invalid");
  const created = await api(
    "/guest/create",
    { name: "身份纠错测试", nickname: "创建者", members: ["甲", "乙", "丙"] },
    201,
  );
  const dorm = created.dorm.id,
    invite = created.invite_code;
  cookie = "";
  const wrongCookie = await login("wrong@example.invalid");
  const wrong = await api(
    "/chores/claim",
    { invite_code: invite, nickname: "甲" },
    201,
  );
  const oldToken = wrong.access_token,
    member = wrong.member.user_id;
  cookie = "";
  const otherCookie = await login("other@example.invalid");
  const other = await api(
    "/chores/claim",
    { invite_code: invite, nickname: "乙" },
    201,
  );
  await api("/email/unbind", { dorm_id: dorm, member_id: member }, 409);
  await api("/email/unbind", { dorm_id: dorm, member_id: member }, 401, "", "");
  cookie = wrongCookie;
  await api(
    "/email/unbind",
    { dorm_id: dorm, member_id: member },
    403,
    "",
    cookie,
    { Origin: "https://evil.invalid" },
  );
  await api("/email/unbind", { dorm_id: String(dorm), member_id: member }, 422);
  await api("/chores/claim", { invite_code: invite, nickname: "乙" }, 403);
  await api("/chores/claim", { invite_code: invite, nickname: "丙" }, 403);
  // A second independent email session obtains its own room credential.
  now += 61000;
  cookie = "";
  const deviceTwoCookie = await login("wrong@example.invalid");
  const deviceTwo = await api("/email/enter", { dorm_id: dorm });
  cookie = wrongCookie;
  const at = new Date(now).toISOString();
  db.prepare(
    "INSERT INTO chore_push_subscriptions(dorm_id,user_id,endpoint,p256dh,auth,updated_at) VALUES (?,?,?,?,?,?)",
  ).run(dorm, member, "https://push.example.invalid/test", "key", "auth", at);
  const sub = db
    .prepare("SELECT id FROM chore_push_subscriptions WHERE user_id=?")
    .get(member).id;
  db.prepare(
    "INSERT INTO chore_push_jobs(dorm_id,user_id,subscription_id,subscription_revision,kind,next_attempt_at) VALUES (?,?,?,1,'test',?)",
  ).run(dorm, member, sub, at);
  db.prepare(
    "INSERT INTO chore_calendar_subscriptions(dorm_id,user_id,token_hash,enabled,created_at,updated_at) VALUES (?,?,?,1,?,?)",
  ).run(dorm, member, "f".repeat(64), at, at);
  const board = await api(
    `/chores/board?invite_code=${invite}&member_id=${member}`,
    null,
    200,
    oldToken,
  );
  const tables = [
    "users",
    "dormitories",
    "dorm_members",
    "chore_tasks",
    "chore_history_entries",
    "chore_history_audit",
  ];
  const before = tables.map((t) =>
    JSON.stringify(db.prepare(`SELECT * FROM ${t}`).all()),
  );
  await api(
    "/chores/remind",
    { target_member_id: member, task_id: board.today_tasks[0].id },
    201,
    created.access_token,
    ownerCookie,
  );
  const reminderId = db
    .prepare(
      "SELECT id FROM chore_reminders WHERE target_member_id=? ORDER BY id DESC",
    )
    .get(member).id;
  db.prepare(
    "INSERT INTO email_jobs(account_id,reminder_id,next_attempt_at,created_at) SELECT id,?,?,? FROM email_accounts WHERE email=?",
  ).run(reminderId, at, at, "wrong@example.invalid");
  await api("/email/unbind", { dorm_id: dorm, member_id: member });
  eq(
    db
      .prepare("SELECT status FROM email_jobs WHERE reminder_id=?")
      .get(reminderId).status,
    "cancelled",
  );
  eq((await api("/email/me")).logged_in, true);
  eq((await api("/email/me")).rooms.length, 0);
  eq((await api("/email/me", null, 200, "", deviceTwoCookie)).logged_in, true);
  for (const token of [oldToken, deviceTwo.access_token]) {
    eq(
      db
        .prepare("SELECT COUNT(*) n FROM email_grants WHERE token_hash=?")
        .get(hash(token)).n,
      0,
    );
    eq(
      db
        .prepare("SELECT COUNT(*) n FROM member_sessions WHERE token_hash=?")
        .get(hash(token)).n,
      0,
    );
    await api(
      `/chores/board?invite_code=${invite}&member_id=${member}`,
      null,
      428,
      token,
    );
    await api("/email/bind", { member_token: token }, 401);
  }
  eq(
    db
      .prepare("SELECT is_active FROM chore_push_subscriptions WHERE id=?")
      .get(sub).is_active,
    0,
  );
  eq(
    db
      .prepare("SELECT status FROM chore_push_jobs WHERE subscription_id=?")
      .get(sub).status,
    "cancelled",
  );
  eq(
    db
      .prepare(
        "SELECT token_hash FROM chore_calendar_subscriptions WHERE user_id=?",
      )
      .get(member).token_hash,
    null,
  );
  await service.drain();
  eq(sent.filter((m) => m.subject !== "轮到 · 邮箱验证码").length, 0);
  eq(
    tables.map((t) => JSON.stringify(db.prepare(`SELECT * FROM ${t}`).all())),
    before,
  );
  await api("/email/enter", { dorm_id: dorm }, 403);
  await api("/chores/claim", { invite_code: invite, nickname: "乙" }, 403);
  const corrected = await api(
    "/chores/claim",
    { invite_code: invite, nickname: "丙" },
    201,
  );
  eq(corrected.member.nickname, "丙");
  await api("/email/unbind", { dorm_id: dorm, member_id: member }, 409); // stale repeat cannot unlink the new identity
  eq((await api("/email/me")).rooms[0].nickname, "丙");
  await api(
    `/chores/board?invite_code=${invite}&member_id=${other.member.user_id}`,
    null,
    200,
    other.access_token,
    otherCookie,
  );
  now += 11 * 60000;
  await api(
    "/email/unbind",
    { dorm_id: dorm, member_id: corrected.member.user_id },
    401,
  );
  await login("wrong@example.invalid");
  await api("/email/unbind", {
    dorm_id: dorm,
    member_id: corrected.member.user_id,
  });
  // Creator role is never transferred by unlinking or claiming a name.
  cookie = ownerCookie;
  await login("owner@example.invalid");
  const owner = (await api("/email/me")).rooms[0];
  await api("/email/unbind", { dorm_id: dorm, member_id: owner.member_id });
  await api("/chores/claim", { invite_code: invite, nickname: "创建者" }, 403);
  eq(
    db.prepare("SELECT admin_user_id FROM dormitories WHERE id=?").get(dorm)
      .admin_user_id,
    owner.member_id,
  );
  eq(
    db
      .prepare("SELECT COUNT(*) n FROM sessions WHERE user_id=?")
      .get(owner.member_id).n,
    0,
  );
  eq(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  eq(db.prepare("PRAGMA foreign_key_check").all(), []);
  console.log(`邮箱身份解绑回归通过 ${checks} 项（隔离数据库与邮件）`);
} finally {
  await service.close();
  h.close();
}
