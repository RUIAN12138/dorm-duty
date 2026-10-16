import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
import runtime from "../runtime/email-runtime.cjs";

let checks = 0;
const eq = (a, b) => {
  checks++;
  assert.deepEqual(a, b);
};
const h = await createHarness();
let time = Date.now(),
  delivered = [],
  failSend = false;
const config = {
  host: "smtp.example.invalid",
  port: 465,
  user: "test@example.invalid",
  password: "fixture-only",
  from: "test@example.invalid",
  publicOrigin: "https://backend-test.example",
  otpSecret: "a".repeat(64),
};
const service = runtime.createEmailRuntime(h.db, {
  config,
  autoStart: false,
  now: () => new Date(time),
  send: async (message) => {
    if (failSend) throw new Error("fixture SMTP offline");
    delivered.push(message);
  },
});
let cookie = "";
async function api(p, data, status = 200, opts = {}) {
  const response = await service.wrap(
    new Request(config.publicOrigin + p, {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Dorm-Email": "1",
        Origin: config.publicOrigin,
        Cookie: opts.cookie ?? cookie,
        "X-Dorm-Client": "fixture-client",
        ...opts.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    }),
    (request) =>
      h.request(p, { method: request.method, data, token: opts.token }),
  );
  eq(response.status, status);
  if (response.headers.get("Set-Cookie"))
    cookie = response.headers.get("Set-Cookie").split(";")[0];
  return response.json();
}
async function login(email = "first@example.invalid", preferences = true) {
  const code = await api("/email/code", { email }, 202);
  const message = delivered.at(-1),
    digits = message.text.match(/验证码是：(\d{6})/)[1];
  await api("/email/verify", {
    email,
    code: digits,
    challenge_id: code.challenge_id,
    mail_enabled: preferences,
  });
  return { ...code, digits, email };
}
try {
  eq((await api("/email/config")).available, true);
  await api("/email/bind", { member_token: "f".repeat(64) }, 401);
  await api("/email/code", { email: "a@b.invalid\r\nBcc:evil@b.invalid" }, 422);
  await api("/email/code", { email: "a@b.invalid" }, 403, {
    headers: { Origin: "https://evil.invalid" },
  });
  await api("/email/code", { email: "a@b.invalid" }, 403, {
    headers: { "X-Dorm-Email": "" },
  });
  await api("/guest/create", { name: "未注册", nickname: "甲" }, 401);
  const first = await login("FIRST@example.invalid");
  const firstCookie = cookie;
  eq((await api("/email/me")).email, "first@example.invalid");
  eq(delivered[0].to, "first@example.invalid");
  const stored = h.db.sqlite
    .prepare("SELECT * FROM email_challenges WHERE id=?")
    .get(first.challenge_id);
  eq(stored.code_hash.length, 64);
  eq(stored.code_hash.includes(first.digits), false);
  await api(
    "/email/verify",
    {
      email: first.email,
      challenge_id: first.challenge_id,
      code: first.digits,
      mail_enabled: true,
    },
    401,
  );
  await api("/email/code", { email: "first@example.invalid" }, 429);
  // Old-device migration preserves user and task/history IDs; owner remains owner.
  const room = await h
    .request("/guest/create", {
      method: "POST",
      data: { name: "邮箱隔离宿舍", nickname: "甲", members: ["乙"] },
    })
    .then((r) => r.json());
  const before = h.db.sqlite
    .prepare("SELECT COUNT(*) AS n FROM duty_tasks")
    .get().n;
  await api("/email/bind", { member_token: room.access_token });
  eq(
    h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM duty_tasks").get().n,
    before,
  );
  eq((await api("/email/me")).rooms[0].member_id, room.member_id);
  const entered = await api("/email/enter", { dorm_id: room.dorm.id });
  eq(entered.is_creator, true);
  eq(
    (await h.request("/dorms/current", { token: entered.access_token })).status,
    200,
  );
  await api("/email/enter", { dorm_id: room.dorm.id + 100 }, 403);
  const creator = await api(
    "/chores/claim",
    { invite_code: room.invite_code, nickname: "甲" },
    201,
  );
  await api(
    "/chores/claim",
    { invite_code: room.invite_code, nickname: "乙" },
    403,
  );
  // Another verified account cannot claim the bound owner, nor infer a room's list.
  cookie = "";
  await login("second@example.invalid");
  const secondCookie = cookie;
  await api(
    "/chores/claim",
    { invite_code: room.invite_code, nickname: "甲" },
    403,
  );
  await api("/email/enter", { dorm_id: room.dorm.id }, 403);
  const member = await api(
    "/chores/claim",
    { invite_code: room.invite_code, nickname: "乙" },
    201,
  );
  eq(member.member.nickname, "乙");
  eq((await api("/email/me")).rooms[0].is_creator, 0);
  const ordinary = await api("/email/enter", { dorm_id: room.dorm.id });
  eq(ordinary.is_creator, false);
  eq(
    (await h.request("/dorms/current", { token: ordinary.access_token }))
      .status,
    401,
  );
  // Disable SMTP later: existing email-bound identities cannot fall back to a name.
  const offline = runtime.createEmailRuntime(h.db, { autoStart: false });
  const blocked = await offline.wrap(
    new Request(config.publicOrigin + "/chores/claim", {
      method: "POST",
      body: JSON.stringify({ invite_code: room.invite_code, nickname: "乙" }),
    }),
    () => {
      throw new Error("unbound dispatch");
    },
  );
  eq(blocked.status, 403);
  await offline.close();
  const board = await h
    .request(
      `/chores/board?invite_code=${room.invite_code}&member_id=${ordinary.member_id}`,
      { token: ordinary.access_token },
    )
    .then((r) => r.json());
  const task = board.today_tasks[0];
  const reminded = await h.request("/chores/remind", {
    method: "POST",
    token: creator.access_token,
    data: { target_member_id: ordinary.member_id, task_id: task.id },
  });
  eq(reminded.status, 201);
  await service.drain();
  eq(
    h.db.sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM email_jobs WHERE kind='reminder' AND status='accepted'",
      )
      .get().n,
    1,
  );
  eq(delivered.at(-1).to, "second@example.invalid");
  eq(delivered.at(-1).subject.includes(task.name), true);
  const sends = delivered.length;
  await service.drain();
  eq(delivered.length, sends);
  // Per-recipient test cooldown and preference cancellation.
  await api("/email/test", {}, 202);
  await api("/email/test", {}, 429);
  await service.drain();
  const beforeDisable = delivered.length;
  h.db.sqlite
    .prepare(
      "INSERT INTO email_jobs(account_id,kind,next_attempt_at,created_at) SELECT id,'test',?,? FROM email_accounts WHERE email='second@example.invalid'",
    )
    .run(new Date(time).toISOString(), new Date(time).toISOString());
  await api("/email/preferences", { mail_enabled: false });
  await service.drain();
  eq(delivered.length, beforeDisable);
  await api("/email/test", {}, 409);
  eq((await api("/email/me")).mail_enabled, false);
  time += 61000;
  await api("/email/preferences", { mail_enabled: true });
  failSend = true;
  await api("/email/test", {}, 202);
  await service.drain();
  eq(
    h.db.sqlite
      .prepare(
        "SELECT status,attempts FROM email_jobs ORDER BY id DESC LIMIT 1",
      )
      .get(),
    Object.assign(Object.create(null), { status: "pending", attempts: 1 }),
  );
  const retryCount = delivered.length;
  await service.drain();
  eq(delivered.length, retryCount);
  failSend = false;
  time += 61000;
  await service.drain();
  eq(
    h.db.sqlite
      .prepare("SELECT status FROM email_jobs ORDER BY id DESC LIMIT 1")
      .get().status,
    "accepted",
  );
  await api("/email/logout", {});
  eq((await api("/email/me")).logged_in, false);
  eq(
    (
      await h.request(
        `/chores/board?invite_code=${room.invite_code}&member_id=${ordinary.member_id}`,
        { token: ordinary.access_token },
      )
    ).status,
    401,
  );
  // Re-login on another device retrieves same member, without name impersonation.
  await login("second@example.invalid", false);
  eq((await api("/email/me")).mail_enabled, true); // existing preference not silently reset
  const resumed = await api("/email/enter", { dorm_id: room.dorm.id });
  eq(resumed.member_id, ordinary.member_id);
  const restoredCookie = cookie;
  // Five bad attempts consume the guessing budget; expired/resend codes fail.
  cookie = "";
  const attempt = await api(
    "/email/code",
    { email: "tries@example.invalid" },
    202,
  );
  const good = delivered.at(-1).text.match(/验证码是：(\d{6})/)[1];
  const bad = good === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++)
    await api(
      "/email/verify",
      {
        email: "tries@example.invalid",
        challenge_id: attempt.challenge_id,
        code: bad,
        mail_enabled: false,
      },
      401,
    );
  await api(
    "/email/verify",
    {
      email: "tries@example.invalid",
      challenge_id: attempt.challenge_id,
      code: good,
      mail_enabled: false,
    },
    401,
  );
  const expires = await api(
    "/email/code",
    { email: "expiry@example.invalid" },
    202,
  );
  const expiryCode = delivered.at(-1).text.match(/验证码是：(\d{6})/)[1];
  time += 600001;
  await api(
    "/email/verify",
    {
      email: "expiry@example.invalid",
      challenge_id: expires.challenge_id,
      code: expiryCode,
      mail_enabled: false,
    },
    401,
  );
  // Recent verification is needed before attaching a new room, before mutation.
  cookie = firstCookie;
  const roomCount = h.db.sqlite
    .prepare("SELECT COUNT(*) AS n FROM dormitories")
    .get().n;
  await api("/guest/create", { name: "过期验证", nickname: "甲" }, 401);
  eq(
    h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM dormitories").get().n,
    roomCount,
  );
  cookie = restoredCookie;
  const previousCookie = cookie;
  await login("second@example.invalid");
  eq(cookie !== previousCookie, true);
  eq(
    (await api("/email/me", null, 200, { cookie: previousCookie })).logged_in,
    false,
  );
  eq(
    (
      await h.request(
        `/chores/board?invite_code=${room.invite_code}&member_id=${resumed.member_id}`,
        { token: resumed.access_token },
      )
    ).status,
    200,
  );
  await api("/email/bind", { member_token: resumed.access_token });
  // SMTP refusal doesn't create a usable challenge, account, or session.
  failSend = true;
  await api("/email/code", { email: "failure@example.invalid" }, 503);
  eq(
    h.db.sqlite
      .prepare("SELECT consumed,ready FROM email_challenges WHERE email=?")
      .get("failure@example.invalid"),
    Object.assign(Object.create(null), { consumed: 1, ready: 0 }),
  );
  cookie = secondCookie;
  eq((await api("/email/me")).logged_in, false); // logged-out cookie stays revoked
  failSend = false;
  const reservation = h.db.sqlite.prepare(
    "INSERT INTO email_challenges(id,email,code_hash,client_hash,created_at,expires_at) VALUES (?,?,?,?,?,?)",
  );
  for (let i = 0; i < 100; i++)
    reservation.run(
      i.toString(16).padStart(64, "0"),
      `quota-${i}@example.invalid`,
      "a".repeat(64),
      "different-fixture-client",
      new Date(time).toISOString(),
      new Date(time + 600000).toISOString(),
    );
  const sentBeforeQuota = delivered.length;
  await api("/email/code", { email: "quota-check@example.invalid" }, 429);
  eq(delivered.length, sentBeforeQuota);
  console.log(
    `邮箱账号、迁移权限与邮件队列检查通过 ${checks} 项（隔离传输，未发送真实邮件）`,
  );
} finally {
  await service.close();
  h.close();
}
