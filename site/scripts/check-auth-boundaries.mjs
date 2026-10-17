// Disposable SQLite + injected mail. Never reads production secrets or sends mail.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createHarness } from "./check-cloud-backend.mjs";
import { handleApi } from "../worker/backend.mjs";
import runtime from "../runtime/email-runtime.cjs";
const h = await createHarness(),
  db = h.db.sqlite;
let now = Date.now(),
  checks = 0,
  cookie = "",
  sent = [];
const eq = (a, b, label) => {
  assert.deepEqual(a, b, label);
  checks++;
};
const hash = (t) => createHash("sha256").update(t).digest("hex");
const origin = "https://auth-test.example";
async function legacy(path, data, token = "", ip = "fixture") {
  return handleApi(
    new Request(origin + path, {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Dorm-Client": ip,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    }),
    h.env,
    { now: () => new Date(now), waitUntil() {} },
  );
}
let email;
try {
  const credentials = {
    username: "boundary_account",
    password: "FixturePasswordOnly!",
  };
  const first = await legacy("/auth/register", {
    ...credentials,
    nickname: "甲",
  });
  const repeated = await legacy("/auth/register", {
    ...credentials,
    nickname: "不同",
  });
  eq(first.status, 201);
  eq(repeated.status, 201);
  eq(
    await first.json(),
    await repeated.json(),
    "anonymous register replies do not reveal existence",
  );
  for (let n = 0; n < 5; n++)
    eq(
      (
        await legacy(
          "/auth/login",
          { ...credentials, password: "wrong-password" },
          "",
          `ip-${n}`,
        )
      ).status,
      401,
    );
  eq(
    (await legacy("/auth/login", credentials, "", "fresh-ip")).status,
    429,
    "account throttle survives changing IP",
  );
  now += 16 * 60000;
  eq(
    (await legacy("/auth/login", credentials)).status,
    200,
    "cooldown expires",
  );
  for (let n = 0; n < 60; n++)
    eq(
      (
        await legacy(
          "/auth/login",
          { username: `missing_${n}`, password: "wrong-password" },
          "",
          "one-ip",
        )
      ).status,
      401,
    );
  eq(
    (
      await legacy(
        "/auth/login",
        { username: "missing_end", password: "wrong-password" },
        "",
        "one-ip",
      )
    ).status,
    429,
    "IP throttle survives changing names",
  );
  const owner = await legacy("/guest/create", {
    name: "隔离会话",
    nickname: "甲",
    members: ["乙"],
  }).then((r) => r.json());
  const expires = db
    .prepare("SELECT expires_at FROM sessions WHERE token_hash=?")
    .get(hash(owner.access_token)).expires_at;
  eq((await legacy("/auth/me", null, owner.access_token)).status, 200);
  eq(
    db
      .prepare("SELECT expires_at FROM sessions WHERE token_hash=?")
      .get(hash(owner.access_token)).expires_at,
    expires,
    "auth/me never slides expiry",
  );
  now += 91 * 86400000;
  eq(
    (await legacy("/auth/me", null, owner.access_token)).status,
    401,
    "absolute expiry enforced",
  );
  // Logout accepts expired tokens and removes rows, not merely client state.
  eq((await legacy("/auth/logout", {}, owner.access_token)).status, 200);
  eq(
    db
      .prepare("SELECT COUNT(*) n FROM sessions WHERE token_hash=?")
      .get(hash(owner.access_token)).n,
    0,
  );
  now = Date.now();
  email = runtime.createEmailRuntime(h.db, {
    autoStart: false,
    now: () => new Date(now),
    config: {
      host: "smtp.example.invalid",
      port: 465,
      user: "test@example.invalid",
      from: "test@example.invalid",
      password: "fixture",
      publicOrigin: origin,
      otpSecret: "f".repeat(64),
    },
    send: async (m) => sent.push(m),
  });
  async function call(p, data, token = "") {
    const response = await email.wrap(
      new Request(origin + p, {
        method: data ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          "X-Dorm-Email": "1",
          "X-Dorm-Client": "fixture-email",
          Cookie: cookie,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
      }),
      (r, emailCreator) =>
        handleApi(
          r,
          { ...h.env, EMAIL_CREATOR: emailCreator },
          { waitUntil() {} },
        ),
    );
    if (response.headers.has("Set-Cookie"))
      cookie = response.headers.get("Set-Cookie").split(";")[0];
    return response;
  }
  const address = "boundary@example.invalid";
  async function code() {
    return (await call("/email/code", { email: address })).json();
  }
  const challenge = await code();
  const digits = sent.at(-1).text.match(/验证码是：(\d{6})/)[1];
  const verify = {
    email: address,
    challenge_id: challenge.challenge_id,
    code: digits,
    mail_enabled: false,
  };
  const digest = db
    .prepare("SELECT code_hash FROM email_challenges WHERE id=?")
    .get(challenge.challenge_id).code_hash;
  for (const corrupt of ["", "00", "z".repeat(64)]) {
    db.prepare("UPDATE email_challenges SET code_hash=? WHERE id=?").run(
      corrupt,
      challenge.challenge_id,
    );
    eq(
      (await call("/email/verify", verify)).status,
      401,
      "corrupt digest is unauthorized, never 500",
    );
  }
  db.prepare("UPDATE email_challenges SET code_hash=? WHERE id=?").run(
    digest,
    challenge.challenge_id,
  );
  now += 61000;
  await code();
  eq(
    (await call("/email/verify", verify)).status,
    200,
    "resend does not invalidate an already delivered valid code",
  );
  const room = await call("/guest/create", {
    name: "邮箱退出",
    nickname: "甲",
  }).then((r) => r.json());
  const grant = await call("/email/enter", { dorm_id: room.dorm.id }).then(
    (r) => r.json(),
  );
  // First auth endpoint works even after gate validity is gone; second revokes all same-cookie grants.
  eq((await call("/auth/logout", {}, room.access_token)).status, 200);
  eq((await call("/email/logout", {})).status, 200);
  eq(
    db
      .prepare("SELECT COUNT(*) n FROM sessions WHERE token_hash IN (?,?)")
      .get(hash(room.access_token), hash(grant.access_token)).n,
    0,
  );
  eq((await call("/auth/me", null, grant.access_token)).status, 428);
  eq((await call("/email/me")).status, 200);
  eq((await call("/email/me").then((r) => r.json())).logged_in, false);
  eq(
    (await call("/email/logout", {})).status,
    200,
    "repeated logout is idempotent and clears expired cookie",
  );
  eq((await call("/auth/logout", {}, "f".repeat(64))).status, 200);
  eq(
    (await call("/auth/login", credentials)).status,
    409,
    "email-required production disables legacy login",
  );
  console.log(`认证边界回归通过 ${checks} 项（隔离数据库/注入邮件）`);
} finally {
  await email?.close();
  h.close();
}
