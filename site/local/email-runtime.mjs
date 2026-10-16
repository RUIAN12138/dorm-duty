import fs from "node:fs/promises";
import path from "node:path";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import nodemailer from "nodemailer";

const DAY = 86400000;
const secret = () => randomBytes(32).toString("hex");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const reply = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...headers,
    },
  });
const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};
function emailAddress(value) {
  if (typeof value !== "string") fail(422, "请输入有效的邮箱地址");
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(
      email,
    ) ||
    email.split("@")[0].length > 64 ||
    email.includes("..") ||
    email.startsWith(".") ||
    email.split("@")[0].endsWith(".")
  )
    fail(422, "请输入有效的邮箱地址");
  return email;
}
export function validateEmailConfig(value) {
  const { host, port, user, password, from, publicOrigin, otpSecret } =
    value || {};
  if (
    typeof host !== "string" ||
    !/^[a-zA-Z0-9.-]+$/.test(host) ||
    ![465, 587].includes(port) ||
    typeof user !== "string" ||
    !user ||
    /[\r\n]/.test(user) ||
    typeof password !== "string" ||
    !password ||
    /[\r\n]/.test(password) ||
    !/^[a-f0-9]{64}$/.test(otpSecret)
  )
    throw new Error("邮件配置格式无效");
  emailAddress(from);
  const origin = new URL(publicOrigin);
  if (origin.protocol !== "https:" || origin.origin !== publicOrigin)
    throw new Error("邮件站点地址必须是 HTTPS origin");
  return value;
}
export async function loadEmailConfig(directory) {
  try {
    const filename = path.join(directory, "email.json"),
      stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.mode & 0o077)
      throw new Error("邮件配置必须为权限 600 的普通文件");
    return validateEmailConfig(JSON.parse(await fs.readFile(filename, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error("邮件配置不可用，请检查格式和权限");
  }
}
export function createSmtpSender(config) {
  validateEmailConfig(config);
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: true,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
  return {
    async send(message) {
      const result = await transport.sendMail({
        from: { name: "轮到", address: config.from },
        ...message,
      });
      if (!result.accepted?.length) throw new Error("邮件服务未接受投递");
    },
    close() {
      transport.close();
    },
  };
}

// Node/SQLite runtime. The Cloudflare legacy deployment does not expose these routes.
export function createEmailRuntime(
  db,
  {
    config = null,
    send,
    now = () => new Date(),
    base = "/",
    autoStart = true,
    intervalMs = 10000,
  } = {},
) {
  const sql = db.sqlite;
  if (config) validateEmailConfig(config);
  const smtp = config && !send ? createSmtpSender(config) : null;
  const deliver = send || ((message) => smtp.send(message));
  const available = Boolean(config);
  const cookieName = "dorm_email_session";
  let running = null,
    stopped = false,
    timer;
  const stamp = () => now().toISOString();
  const transaction = (fn) => {
    sql.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      sql.exec("COMMIT");
      return result;
    } catch (error) {
      sql.exec("ROLLBACK");
      throw error;
    }
  };
  const cookie = (token, age = 30 * 86400) =>
    `${cookieName}=${token}; Path=${base}; HttpOnly; SameSite=Strict; Max-Age=${age}${config?.publicOrigin.startsWith("https:") ? "; Secure" : ""}`;
  function session(request) {
    const token = (request.headers.get("Cookie") || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    if (!/^[a-f0-9]{64}$/.test(token || "")) return null;
    return (
      sql
        .prepare(
          "SELECT a.*,s.token_hash AS session_hash,s.created_at AS verified_at,s.expires_at AS session_expires FROM email_sessions s JOIN email_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?",
        )
        .get(hash(token), stamp()) || null
    );
  }
  const required = (request) => {
    const who = session(request);
    if (!who) fail(401, "请先用邮箱验证码登录");
    return who;
  };
  async function input(request, fields) {
    const text = await request.text();
    if (text.length > 4096) fail(413, "提交内容过长");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      fail(422, "请检查提交内容");
    }
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).some((k) => !fields.includes(k))
    )
      fail(422, "请检查提交内容");
    return data;
  }
  function mutationOrigin(request) {
    // Custom header prevents cross-origin forms; the runtime never enables CORS.
    if (request.headers.get("X-Dorm-Email") !== "1")
      fail(403, "请从网站页面执行此操作");
    const origin = request.headers.get("Origin");
    if (
      origin &&
      origin !== (config?.publicOrigin || new URL(request.url).origin)
    )
      fail(403, "请求来源无效");
  }
  function memberToken(token) {
    if (!/^[a-f0-9]{64}$/i.test(token || "")) fail(401, "请先进入要绑定的宿舍");
    const digest = hash(token),
      at = stamp();
    const scoped = sql
      .prepare(
        `SELECT s.user_id,s.dorm_id,0 AS creator_verified FROM member_sessions s
      JOIN users u ON u.id=s.user_id JOIN dorm_members m ON m.user_id=s.user_id AND m.dorm_id=s.dorm_id AND m.is_active=1
      JOIN dormitories d ON d.id=s.dorm_id AND d.is_demo=0 WHERE s.token_hash=? AND s.expires_at>? AND u.current_dorm_id=s.dorm_id`,
      )
      .get(digest, at);
    const full =
      scoped ||
      sql
        .prepare(
          `SELECT s.user_id,u.current_dorm_id AS dorm_id,
      CASE WHEN m.role='admin' AND d.admin_user_id=s.user_id THEN 1 ELSE 0 END AS creator_verified FROM sessions s
      JOIN users u ON u.id=s.user_id JOIN dorm_members m ON m.user_id=u.id AND m.dorm_id=u.current_dorm_id AND m.is_active=1
      JOIN dormitories d ON d.id=m.dorm_id AND d.is_demo=0 WHERE s.token_hash=? AND s.expires_at>?`,
        )
        .get(digest, at);
    if (!full) fail(401, "当前宿舍身份已失效，请重新进入");
    return { ...full, token_hash: digest };
  }
  function bind(who, token) {
    if (now().getTime() - Date.parse(who.verified_at) > 10 * 60000)
      fail(401, "绑定身份前请重新验证邮箱");
    const member = memberToken(token);
    const owner = sql
      .prepare("SELECT admin_user_id FROM dormitories WHERE id=?")
      .get(member.dorm_id);
    if (owner.admin_user_id === member.user_id && !member.creator_verified)
      fail(403, "创建者请在持有管理权限的设备上绑定邮箱，或先恢复管理权限");
    const linked = sql
      .prepare(
        "SELECT * FROM email_members WHERE user_id=? OR (account_id=? AND dorm_id=?)",
      )
      .all(member.user_id, who.id, member.dorm_id);
    if (
      linked.some(
        (row) => row.account_id !== who.id || row.user_id !== member.user_id,
      )
    )
      fail(409, "该身份或当前邮箱已绑定其他成员");
    transaction(() => {
      sql
        .prepare(
          "INSERT INTO email_members(account_id,user_id,dorm_id,creator_verified,bound_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET creator_verified=MAX(creator_verified,excluded.creator_verified)",
        )
        .run(
          who.id,
          member.user_id,
          member.dorm_id,
          member.creator_verified,
          stamp(),
        );
      // Retain this proven device, revoke previous name-only impersonation sessions.
      sql
        .prepare(
          "DELETE FROM member_sessions WHERE user_id=? AND token_hash<>?",
        )
        .run(member.user_id, member.token_hash);
      sql
        .prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?")
        .run(member.user_id, member.token_hash);
      const fullSession = Number(
        Boolean(
          sql
            .prepare("SELECT 1 FROM sessions WHERE token_hash=?")
            .get(member.token_hash),
        ),
      );
      sql
        .prepare(
          `UPDATE ${fullSession ? "sessions" : "member_sessions"} SET expires_at=MIN(expires_at,?) WHERE token_hash=?`,
        )
        .run(who.session_expires, member.token_hash);
      sql
        .prepare(
          "INSERT INTO email_grants(token_hash,email_session_hash,full_session) VALUES (?,?,?) ON CONFLICT(token_hash) DO UPDATE SET email_session_hash=excluded.email_session_hash",
        )
        .run(member.token_hash, who.session_hash, fullSession);
    });
  }
  function rooms(who) {
    return sql
      .prepare(
        `SELECT d.id,d.name,d.invite_code,u.id AS member_id,u.nickname,mm.marker_id,
      CASE WHEN em.creator_verified=1 AND d.admin_user_id=u.id AND m.role='admin' THEN 1 ELSE 0 END AS is_creator
      FROM email_members em JOIN dormitories d ON d.id=em.dorm_id AND d.is_demo=0
      JOIN dorm_members m ON m.dorm_id=em.dorm_id AND m.user_id=em.user_id AND m.is_active=1
      JOIN users u ON u.id=em.user_id AND u.current_dorm_id=em.dorm_id
      LEFT JOIN member_marks mm ON mm.dorm_id=em.dorm_id AND mm.user_id=em.user_id WHERE em.account_id=? ORDER BY em.bound_at DESC`,
      )
      .all(who.id);
  }
  function grant(who, dormId) {
    const room = rooms(who).find((r) => r.id === dormId);
    if (!room) fail(403, "该邮箱没有这个宿舍的有效身份");
    const token = secret(),
      digest = hash(token),
      at = stamp(),
      expires = who.session_expires;
    const full = Number(room.is_creator);
    transaction(() => {
      // One generated session per email login and room; ordinary polls do not accumulate tokens.
      const old = sql
        .prepare(
          `SELECT g.token_hash,g.full_session FROM email_grants g LEFT JOIN member_sessions m ON m.token_hash=g.token_hash
        LEFT JOIN sessions s ON s.token_hash=g.token_hash WHERE g.email_session_hash=? AND COALESCE(m.user_id,s.user_id)=?`,
        )
        .all(who.session_hash, room.member_id);
      for (const row of old)
        sql
          .prepare(
            `DELETE FROM ${row.full_session ? "sessions" : "member_sessions"} WHERE token_hash=?`,
          )
          .run(row.token_hash);
      for (const row of old)
        sql
          .prepare("DELETE FROM email_grants WHERE token_hash=?")
          .run(row.token_hash);
      if (full)
        sql
          .prepare(
            "INSERT INTO sessions(token_hash,user_id,created_at,expires_at,kind) VALUES (?,?,?,?,'account')",
          )
          .run(digest, room.member_id, at, expires);
      else
        sql
          .prepare(
            "INSERT INTO member_sessions(token_hash,user_id,dorm_id,created_at,expires_at) VALUES (?,?,?,?,?)",
          )
          .run(digest, room.member_id, room.id, at, expires);
      sql
        .prepare(
          "INSERT INTO email_grants(token_hash,email_session_hash,full_session) VALUES (?,?,?)",
        )
        .run(digest, who.session_hash, full);
    });
    return {
      ...room,
      access_token: token,
      member: {
        user_id: room.member_id,
        nickname: room.nickname,
        marker_id: room.marker_id,
      },
      is_creator: Boolean(full),
    };
  }
  function logout(who, insideTransaction = false) {
    if (!who) return;
    const remove = () => {
      for (const row of sql
        .prepare("SELECT * FROM email_grants WHERE email_session_hash=?")
        .all(who.session_hash))
        sql
          .prepare(
            `DELETE FROM ${row.full_session ? "sessions" : "member_sessions"} WHERE token_hash=?`,
          )
          .run(row.token_hash);
      sql
        .prepare("DELETE FROM email_sessions WHERE token_hash=?")
        .run(who.session_hash);
    };
    if (insideTransaction) remove();
    else transaction(remove);
  }
  async function route(request) {
    const pathname = new URL(request.url).pathname,
      method = request.method;
    if (pathname === "/email/config" && method === "GET")
      return reply({ available, registration_required: available });
    if (pathname === "/email/me" && method === "GET") {
      const who = session(request);
      return reply(
        who
          ? {
              logged_in: true,
              email: who.email,
              mail_enabled: Boolean(who.mail_enabled),
              rooms: rooms(who),
            }
          : { logged_in: false },
      );
    }
    if (method !== "POST") fail(404, "接口不存在");
    mutationOrigin(request);
    if (pathname === "/email/code") {
      if (!available) fail(503, "邮箱服务尚未配置");
      const data = await input(request, ["email"]),
        email = emailAddress(data.email),
        at = stamp();
      // The direct Node listener is localhost behind nginx. Never trust X-Forwarded-For.
      // The caller supplies the socket address separately via a trusted server-only header.
      const client = createHmac("sha256", config.otpSecret)
        .update(request.headers.get("X-Dorm-Client") || "unknown")
        .digest("hex");
      const id = secret(),
        code = String(randomInt(0, 1000000)).padStart(6, "0");
      const digest = createHmac("sha256", config.otpSecret)
        .update(`${id}:${email}:${code}`)
        .digest("hex");
      transaction(() => {
        const recent = sql
          .prepare(
            "SELECT COUNT(*) AS n,MAX(created_at) AS last FROM email_challenges WHERE email=? AND created_at>?",
          )
          .get(email, new Date(now().getTime() - 3600000).toISOString());
        const ips = sql
          .prepare(
            "SELECT COUNT(*) AS n FROM email_challenges WHERE client_hash=? AND created_at>?",
          )
          .get(client, new Date(now().getTime() - 3600000).toISOString());
        const total = sql
          .prepare(
            "SELECT COUNT(*) AS n FROM email_challenges WHERE created_at>?",
          )
          .get(new Date(now().getTime() - 3600000).toISOString());
        if (
          recent.n >= 5 ||
          ips.n >= 30 ||
          total.n >= 100 ||
          (recent.last && now().getTime() - Date.parse(recent.last) < 60000)
        )
          fail(429, "验证码发送过于频繁，请稍后再试");
        sql
          .prepare("UPDATE email_challenges SET consumed=1 WHERE email=?")
          .run(email);
        sql
          .prepare(
            "INSERT INTO email_challenges(id,email,code_hash,client_hash,created_at,expires_at) VALUES (?,?,?,?,?,?)",
          )
          .run(
            id,
            email,
            digest,
            client,
            at,
            new Date(now().getTime() + 10 * 60000).toISOString(),
          );
      });
      try {
        await deliver({
          to: email,
          subject: "轮到 · 邮箱验证码",
          text: `你的验证码是：${code}\n\n10 分钟内有效，仅可使用一次。用于注册或登录轮到。\n如果不是你本人操作，请忽略此邮件。`,
        });
      } catch {
        sql
          .prepare("UPDATE email_challenges SET consumed=1 WHERE id=?")
          .run(id);
        fail(503, "验证码邮件暂时发送失败，请稍后再试");
      }
      sql.prepare("UPDATE email_challenges SET ready=1 WHERE id=?").run(id);
      return reply({ challenge_id: id, expires_in: 600, retry_after: 60 }, 202);
    }
    if (pathname === "/email/verify") {
      if (!available) fail(503, "邮箱服务尚未配置");
      const data = await input(request, [
          "email",
          "challenge_id",
          "code",
          "mail_enabled",
        ]),
        email = emailAddress(data.email);
      if (
        !/^[a-f0-9]{64}$/.test(data.challenge_id || "") ||
        !/^\d{6}$/.test(data.code || "") ||
        typeof data.mail_enabled !== "boolean"
      )
        fail(422, "请输入六位验证码");
      const record = sql
        .prepare("SELECT * FROM email_challenges WHERE id=? AND email=?")
        .get(data.challenge_id, email);
      const invalid = () => fail(401, "验证码错误或已失效，请重新获取");
      if (
        !record ||
        !record.ready ||
        record.consumed ||
        record.attempts >= 5 ||
        record.expires_at <= stamp()
      )
        invalid();
      sql
        .prepare("UPDATE email_challenges SET attempts=attempts+1 WHERE id=?")
        .run(record.id);
      const digest = createHmac("sha256", config.otpSecret)
        .update(`${record.id}:${email}:${data.code}`)
        .digest();
      if (!timingSafeEqual(digest, Buffer.from(record.code_hash, "hex")))
        invalid();
      const token = secret();
      transaction(() => {
        const used = sql
          .prepare(
            "UPDATE email_challenges SET consumed=1 WHERE id=? AND consumed=0 AND expires_at>?",
          )
          .run(record.id, stamp());
        if (!used.changes) invalid();
        const previous = session(request);
        if (previous && previous.email !== email) logout(previous, true);
        sql
          .prepare(
            "INSERT OR IGNORE INTO email_accounts(email,mail_enabled,mail_enabled_at,created_at) VALUES (?,?,?,?)",
          )
          .run(email, Number(data.mail_enabled), stamp(), stamp());
        const account = sql
          .prepare("SELECT id FROM email_accounts WHERE email=?")
          .get(email);
        sql
          .prepare(
            "INSERT INTO email_sessions(token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)",
          )
          .run(
            hash(token),
            account.id,
            stamp(),
            new Date(now().getTime() + 30 * DAY).toISOString(),
          );
        if (previous?.email === email) {
          sql
            .prepare(
              "UPDATE email_grants SET email_session_hash=? WHERE email_session_hash=?",
            )
            .run(hash(token), previous.session_hash);
          sql
            .prepare("DELETE FROM email_sessions WHERE token_hash=?")
            .run(previous.session_hash);
        }
      });
      return reply({ ok: true }, 200, { "Set-Cookie": cookie(token) });
    }
    const who = required(request);
    if (pathname === "/email/logout") {
      logout(who);
      return reply({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
    }
    if (pathname === "/email/bind") {
      const data = await input(request, ["member_token"]);
      bind(who, data.member_token);
      return reply({ ok: true });
    }
    if (pathname === "/email/enter") {
      const data = await input(request, ["dorm_id"]);
      return reply(grant(who, data.dorm_id));
    }
    if (pathname === "/email/preferences") {
      const data = await input(request, ["mail_enabled"]);
      if (typeof data.mail_enabled !== "boolean")
        fail(422, "请选择邮件提醒状态");
      if (Boolean(who.mail_enabled) === data.mail_enabled)
        return reply({ ok: true });
      sql
        .prepare(
          "UPDATE email_accounts SET mail_enabled=?,mail_enabled_at=? WHERE id=?",
        )
        .run(Number(data.mail_enabled), stamp(), who.id);
      if (!data.mail_enabled)
        sql
          .prepare(
            "UPDATE email_jobs SET status='cancelled' WHERE account_id=? AND status IN ('pending','sending')",
          )
          .run(who.id);
      return reply({ ok: true });
    }
    if (pathname === "/email/test") {
      if (!available || !who.mail_enabled) fail(409, "请先开启邮件提醒");
      const recent = sql
        .prepare(
          "SELECT id FROM email_jobs WHERE account_id=? AND kind='test' AND created_at>?",
        )
        .get(who.id, new Date(now().getTime() - 60000).toISOString());
      if (recent) fail(429, "测试邮件已提交，请稍后再试");
      sql
        .prepare(
          "INSERT INTO email_jobs(account_id,kind,next_attempt_at,created_at) VALUES (?,'test',?,?)",
        )
        .run(who.id, stamp(), stamp());
      kick();
      return reply({ queued: true }, 202);
    }
    fail(404, "接口不存在");
  }
  // Protect name claims even if SMTP is unavailable later. Existing proven devices
  // keep working during migration; email login restores only their linked identity.
  async function wrap(request, dispatch) {
    try {
      const p = new URL(request.url).pathname;
      if (p.startsWith("/email/")) return await route(request);
      if (
        request.method === "POST" &&
        (p === "/chores/claim" || p === "/guest/create")
      ) {
        let who = session(request);
        if (available || who) {
          mutationOrigin(request);
          who = required(request);
        }
        if (p === "/chores/claim") {
          const data = await request
            .clone()
            .json()
            .catch(() => ({}));
          const member = sql
            .prepare(
              `SELECT u.id,d.id AS dorm_id,d.admin_user_id FROM users u JOIN dorm_members m ON m.user_id=u.id AND m.is_active=1
            JOIN dormitories d ON d.id=m.dorm_id AND d.is_demo=0 WHERE d.invite_code=? AND u.nickname=?`,
            )
            .get(
              String(data.invite_code || "")
                .trim()
                .toUpperCase(),
              String(data.nickname || "").trim(),
            );
          if (member) {
            const existing = sql
              .prepare("SELECT account_id FROM email_members WHERE user_id=?")
              .get(member.id);
            if (existing && existing.account_id !== who?.id)
              fail(403, "此成员已绑定邮箱，请使用本人的邮箱登录");
            if (existing) return reply(grant(who, member.dorm_id), 201);
            if (
              who &&
              sql
                .prepare(
                  "SELECT 1 FROM email_members WHERE account_id=? AND dorm_id=?",
                )
                .get(who.id, member.dorm_id)
            )
              fail(403, "这个邮箱已绑定本宿舍其他身份，不能切换为室友");
            if (who && member.admin_user_id === member.id)
              fail(403, "创建者请先在原设备绑定邮箱，或恢复管理权限后再绑定");
          }
        }
        if (who && now().getTime() - Date.parse(who.verified_at) > 10 * 60000)
          fail(401, "加入或创建宿舍前请重新验证邮箱");
        const result = await dispatch(request);
        if (who && result.ok) {
          const data = await result.clone().json();
          try {
            bind(who, data.access_token);
          } catch (error) {
            const digest = hash(data.access_token);
            sql
              .prepare(
                `DELETE FROM ${p === "/guest/create" ? "sessions" : "member_sessions"} WHERE token_hash=?`,
              )
              .run(digest);
            throw error;
          }
        }
        return result;
      }
      if (available && new URL(request.url).pathname === "/auth/register")
        fail(409, "新账号请使用邮箱验证码注册");
      return await dispatch(request);
    } catch (error) {
      return reply(
        {
          detail: {
            message: error.status ? error.message : "邮箱操作失败，请稍后重试",
          },
        },
        error.status || 500,
      );
    }
  }
  function enqueue() {
    // Durable scan catches both manual and scheduled reminders without changing
    // their existing transaction or disturbing Web Push/native fanout.
    sql
      .prepare(
        `INSERT OR IGNORE INTO email_jobs(account_id,reminder_id,next_attempt_at,created_at)
      SELECT a.id,r.id,?,? FROM chore_reminders r JOIN email_members em ON em.user_id=r.target_member_id AND em.dorm_id=r.dorm_id
      JOIN email_accounts a ON a.id=em.account_id AND a.mail_enabled=1
      JOIN dorm_members m ON m.user_id=em.user_id AND m.dorm_id=em.dorm_id AND m.is_active=1
      JOIN users u ON u.id=em.user_id AND u.current_dorm_id=em.dorm_id
      JOIN dormitories d ON d.id=r.dorm_id AND d.is_demo=0
      WHERE r.created_at>=em.bound_at AND r.created_at>=a.mail_enabled_at AND r.created_at>?
      AND NOT EXISTS(SELECT 1 FROM email_jobs j WHERE j.account_id=a.id AND j.reminder_id=r.id)
      ORDER BY r.id LIMIT 256`,
      )
      .run(stamp(), stamp(), new Date(now().getTime() - DAY).toISOString());
  }
  function eligible(job) {
    const account = sql
      .prepare("SELECT * FROM email_accounts WHERE id=? AND mail_enabled=1")
      .get(job.account_id);
    if (!account) return null;
    if (job.kind === "test") return { account };
    const r = sql
      .prepare(
        `SELECT r.*,u.nickname,d.name AS dorm_name,t.key AS task_key,t.status AS task_status,c.enabled AS category_enabled,
      s.preference_version,s.task_ids,p.version AS plan_version,p.enabled AS plan_enabled FROM chore_reminders r
      JOIN email_members em ON em.user_id=r.target_member_id AND em.dorm_id=r.dorm_id AND em.account_id=?
      JOIN dorm_members m ON m.user_id=em.user_id AND m.dorm_id=em.dorm_id AND m.is_active=1
      JOIN users u ON u.id=em.user_id AND u.current_dorm_id=em.dorm_id JOIN dormitories d ON d.id=em.dorm_id AND d.is_demo=0
      LEFT JOIN chore_tasks t ON t.id=r.task_id LEFT JOIN chore_categories c ON c.dorm_id=t.dorm_id AND c.key=t.key
      LEFT JOIN chore_scheduled_reminders s ON s.reminder_id=r.id LEFT JOIN chore_reminder_preferences p ON p.id=s.preference_id
      WHERE r.id=? AND r.created_at>=em.bound_at AND r.created_at>=?`,
      )
      .get(job.account_id, job.reminder_id, account.mail_enabled_at);
    if (
      !r ||
      r.read_at ||
      (r.task_id && (r.task_status !== "pending" || !r.category_enabled))
    )
      return null;
    if (
      r.source === "scheduled" &&
      (!r.plan_enabled || r.plan_version !== r.preference_version)
    )
      return null;
    if (r.source === "scheduled") {
      const pending = sql
        .prepare(
          `SELECT t.name FROM chore_tasks t JOIN chore_categories c ON c.dorm_id=t.dorm_id AND c.key=t.key
        WHERE t.id IN (SELECT value FROM json_each(?)) AND t.dorm_id=? AND t.assignee_id=? AND t.status='pending' AND c.enabled=1 ORDER BY t.key`,
        )
        .all(r.task_ids || "[]", r.dorm_id, r.target_member_id);
      if (!pending.length) return null;
      r.task_content_snapshot =
        pending.map((t) => t.name).join("、") + "还没完成，做完记得打卡。";
    }
    return { account, reminder: r };
  }
  async function run() {
    if (!available) return;
    enqueue();
    const due = sql
      .prepare(
        "SELECT * FROM email_jobs WHERE (status='pending' AND next_attempt_at<=?) OR (status='sending' AND lease_until<?) ORDER BY id LIMIT 16",
      )
      .all(stamp(), stamp());
    for (const job of due) {
      if (stopped) break;
      const data = eligible(job);
      const daily = sql
        .prepare(
          "SELECT COUNT(*) AS n,MAX(accepted_at) AS last FROM email_jobs WHERE account_id=? AND kind='reminder' AND accepted_at>?",
        )
        .get(job.account_id, new Date(now().getTime() - DAY).toISOString());
      if (
        !data ||
        Date.parse(job.created_at) < now().getTime() - DAY ||
        (job.kind === "reminder" &&
          (daily.n >= 50 ||
            (daily.last && now().getTime() - Date.parse(daily.last) < 60000)))
      ) {
        sql
          .prepare(
            "UPDATE email_jobs SET status='cancelled',lease_until=NULL WHERE id=?",
          )
          .run(job.id);
        continue;
      }
      const claim = sql
        .prepare(
          "UPDATE email_jobs SET status='sending',attempts=attempts+1,lease_until=? WHERE id=? AND ((status='pending' AND next_attempt_at<=?) OR (status='sending' AND lease_until<?))",
        )
        .run(
          new Date(now().getTime() + 60000).toISOString(),
          job.id,
          stamp(),
          stamp(),
        );
      if (Number(claim.changes) !== 1) continue;
      const r = data.reminder;
      const subject = r
        ? `轮到 · ${r.task_name_snapshot}提醒`
        : "轮到 · 测试邮件";
      const text = r
        ? `${r.nickname}，${r.source === "scheduled" ? "你有未完成的值日。" : `${r.sender_name_snapshot}提醒你${r.task_name_snapshot}。`}\n\n${r.task_content_snapshot}\n\n宿舍：${r.dorm_name}`
        : "这是一条测试邮件。你已开启轮到邮件提醒。";
      try {
        await deliver({
          to: data.account.email,
          subject,
          text: `${text}\n\n打开轮到：${config.publicOrigin}${base}${r?.task_key === "water" ? "water" : ""}\n可在「邮箱账号 → 邮件提醒」中关闭。`,
          messageId: `<dorm-email-${job.id}@${new URL(config.publicOrigin).hostname}>`,
        });
        sql
          .prepare(
            "UPDATE email_jobs SET status='accepted',accepted_at=?,lease_until=NULL WHERE id=?",
          )
          .run(stamp(), job.id);
      } catch {
        const attempts = job.attempts + 1;
        sql
          .prepare(
            "UPDATE email_jobs SET status=?,next_attempt_at=?,lease_until=NULL WHERE id=?",
          )
          .run(
            attempts >= 4 ? "failed" : "pending",
            new Date(
              now().getTime() +
                [60000, 300000, 900000, 1800000][Math.min(attempts - 1, 3)],
            ).toISOString(),
            job.id,
          );
      }
    }
    // Keep anti-abuse counters for a day, never retain used codes indefinitely.
    sql
      .prepare("DELETE FROM email_challenges WHERE created_at<?")
      .run(new Date(now().getTime() - DAY).toISOString());
    for (const row of sql
      .prepare(
        "SELECT token_hash AS session_hash FROM email_sessions WHERE expires_at<=?",
      )
      .all(stamp()))
      logout(row);
  }
  function drain() {
    if (stopped) return Promise.resolve();
    if (!running)
      running = run().finally(() => {
        running = null;
      });
    return running;
  }
  function kick() {
    void drain().catch(() => console.error("邮件队列暂时处理失败，将稍后重试"));
  }
  if (autoStart && available) {
    timer = setInterval(kick, intervalMs);
    timer.unref();
    kick();
  }
  return {
    wrap,
    drain,
    available,
    async close() {
      stopped = true;
      clearInterval(timer);
      await running;
      smtp?.close();
    },
  };
}
