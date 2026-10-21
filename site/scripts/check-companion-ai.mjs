import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import emailModule from "../runtime/email-runtime.cjs";
import { createHarness } from "./check-cloud-backend.mjs";
import {
  createCompanionRuntime,
  shortMessages,
} from "../../scripts/companion-ai.mjs";
const h = await createHarness();
const checks = [];
let time = new Date(),
  calls = 0,
  result = { messages: ["你好呀，我是球球。"], emotion: "10", reminder: null },
  fetchMode = "ok",
  gateResolve;
const check = (v, s) => {
  assert(v, s);
  checks.push(s);
};
const room = await (
  await h.request("/guest/create", {
    method: "POST",
    data: { name: "AI隔离", nickname: "甲", members: ["乙"] },
  })
).json();
const members = room.dorm.members,
  claims = [];
for (const [i, m] of members.entries()) {
  const claim = await (
    await h.request("/chores/claim", {
      method: "POST",
      data: { invite_code: room.invite_code, nickname: m.nickname },
    })
  ).json();
  claims.push(claim.access_token);
  h.db.sqlite
    .prepare(
      "INSERT INTO email_accounts(email,mail_enabled_at,created_at) VALUES(?,?,?)",
    )
    .run(`ai-${i}@example.invalid`, time.toISOString(), time.toISOString());
  const id = h.db.sqlite
    .prepare("SELECT id FROM email_accounts WHERE email=?")
    .get(`ai-${i}@example.invalid`).id;
  h.db.sqlite
    .prepare(
      "INSERT INTO email_members(account_id,user_id,dorm_id,bound_at) VALUES(?,?,?,?)",
    )
    .run(id, m.user_id, room.dorm.id, time.toISOString());
}
const config = {
  base_url: "https://open.bigmodel.cn/api/paas/v4",
  model: "glm-4.7-flash",
  asr_model: "glm-asr-2512",
  api_key: "private-fixture-key",
};
const runtime = createCompanionRuntime(h.db, {
  config,
  env: h.env,
  autoStart: false,
  now: () => time,
  dispatch: (r) =>
    h.request(new URL(r.url).pathname + new URL(r.url).search, {
      token: r.headers.get("Authorization")?.slice(7),
    }),
  fetcher: async (url, options) => {
    calls++;
    check(
      options.headers.Authorization === "Bearer private-fixture-key",
      "provider credential stays only in upstream request",
    );
    if (fetchMode === "hold") await new Promise((r) => (gateResolve = r));
    if (fetchMode === "fail")
      return new Response("private provider error", { status: 401 });
    if (url.endsWith("/audio/transcriptions"))
      return Response.json({ text: "明天八点提醒我" });
    const payload = JSON.parse(options.body);
    check(
      !JSON.stringify(payload).includes(room.invite_code) &&
        !JSON.stringify(payload).includes(claims[0]) &&
        !JSON.stringify(payload).includes("@example.invalid"),
      "model context excludes invite/token/email",
    );
    check(
      payload.thinking.type === "disabled" && payload.model === "glm-4.7-flash",
      "requested model and non-reasoning output",
    );
    return Response.json({
      choices: [{ message: { content: JSON.stringify(result) } }],
    });
  },
});
async function call(path, body, member = 0, method = "POST") {
  const data = {
    invite: room.invite_code,
    member_id: members[member].user_id,
    ...body,
  };
  const url =
    "https://test.invalid/chores/companion/" +
    path +
    (method === "GET" ? "?" + new URLSearchParams(data) : "");
  const r = await runtime.route(
    new Request(url, {
      method,
      headers: {
        Authorization: "Bearer " + claims[member],
        "Content-Type": "application/json",
      },
      body: method === "GET" ? undefined : JSON.stringify(data),
    }),
  );
  return { status: r.status, ...(await r.json()) };
}
try {
  check(
    shortMessages(["球".repeat(47)]).every((x) => Array.from(x).length <= 20),
    "output length enforced by server",
  );
  const id = randomUUID();
  let r = await call("chat", { text: "你好", request_id: id });
  check(
    r.status === 200 && r.messages.length === 1,
    "valid chat persists reply",
  );
  const before = calls;
  await call("chat", { text: "你好", request_id: id });
  check(calls === before, "same request id does not charge model twice");
  check(
    (await call("state", {}, 1, "GET")).messages.length === 0,
    "another member cannot read chat",
  );
  check(
    (await call("state", { member_id: members[1].user_id }, 0, "GET"))
      .status === 401,
    "cannot impersonate another member",
  );
  result = {
    messages: ["已经安排好了"],
    emotion: "invalid",
    reminder: {
      target_id: members[1].user_id,
      due_at: new Date(time.getTime() + 60000).toISOString(),
      text: "记得抬水",
    },
  };
  r = await call("chat", {
    text: "一分钟后提醒乙抬水",
    request_id: randomUUID(),
  });
  check(
    r.status === 200 && r.reminder && r.emotion === "02",
    "valid suggestion only becomes proposal with whitelisted emotion",
  );
  const action = r.reminder.id;
  check(
    !r.messages.some((x) => /安排好了/.test(x)),
    "model cannot falsely claim execution",
  );
  check(
    h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM chore_reminders").get().n ===
      0,
    "proposal does not send notification",
  );
  check(
    (await call("reminder", { id: action, action: "confirm" }, 1)).status ===
      404,
    "other member cannot confirm proposal",
  );
  check(
    (await call("reminder", { id: action, action: "confirm" })).status ===
      "pending",
    "explicit confirmation persists schedule",
  );
  await call("reminder", { id: action, action: "confirm" });
  time = new Date(time.getTime() + 61000);
  await runtime.tick();
  await runtime.tick();
  check(
    h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM chore_reminders").get().n ===
      1,
    "due reminder delivered once despite duplicate confirms and ticks",
  );
  const notice = h.db.sqlite.prepare("SELECT * FROM chore_reminders").get();
  check(
    notice.sender_name_snapshot === "甲" &&
      notice.target_member_id === members[1].user_id &&
      notice.source === "note",
    "reminder preserves real sender and routes through existing notification outbox",
  );
  result.reminder.due_at = new Date(time.getTime() + 60000).toISOString();
  r = await call("chat", { text: "再次提醒", request_id: randomUUID() });
  await call("reminder", { id: r.reminder.id, action: "confirm" });
  await call("reminder", { id: r.reminder.id, action: "cancel" });
  time = new Date(time.getTime() + 61000);
  await runtime.tick();
  check(
    h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM chore_reminders").get().n ===
      1,
    "cancelled reminders never send",
  );
  result.reminder.target_id = { invalid: "object" };
  r = await call("chat", { text: "无效对象", request_id: randomUUID() });
  check(
    r.status === 200 && !r.reminder,
    "malformed model target is rejected without SQL errors",
  );
  time = new Date(time.getTime() + 61000);
  result.reminder.target_id = 999999;
  r = await call("chat", { text: "提醒", request_id: randomUUID() });
  check(!r.reminder, "cross-dorm or invalid target rejected");
  fetchMode = "fail";
  r = await call("chat", { text: "失败", request_id: randomUUID() });
  check(
    r.status === 502 && !JSON.stringify(r).includes("private"),
    "upstream error is sanitized and not persisted as success",
  );
  fetchMode = "hold";
  const pending = call("chat", { text: "慢请求", request_id: randomUUID() });
  while (!gateResolve) await new Promise((r) => setTimeout(r, 1));
  r = await call("chat", { text: "重复", request_id: randomUUID() });
  check(r.status === 409, "concurrent chat per identity is bounded");
  fetchMode = "ok";
  gateResolve();
  await pending;
  check(
    (await call("history", {}, 0, "DELETE")).cleared,
    "member can clear own conversation",
  );
  check(
    (await call("state", {}, 0, "GET")).messages.length === 0,
    "cleared chat stays cleared",
  );
  const denied = await runtime.route(
    new Request("https://test.invalid/chores/companion/chat", {
      method: "POST",
      headers: {
        Origin: "https://other.invalid",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
  );
  check(denied.status === 403, "cross-origin mutation rejected");
  check(
    (
      await call("transcribe", {
        audio: Buffer.from("not-wave").toString("base64"),
      })
    ).status === 400,
    "malformed audio never reaches provider",
  );
  const wav = Buffer.alloc(3244);
  wav.write("RIFF");
  wav.writeUInt32LE(3236, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(3200, 40);
  check(
    (await call("transcribe", { audio: wav.toString("base64") })).text ===
      "明天八点提醒我",
    "bounded valid WAV returns transcript without creating chat or reminder",
  );
  const malformed = await runtime.route(
    new Request("https://test.invalid/chores/companion/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    }),
  );
  check(malformed.status === 400, "null JSON is safely rejected");
  time = new Date(time.getTime() + 61000);
  fetchMode = "hold";
  gateResolve = undefined;
  const revoked = call("chat", {
    text: "解绑期间的消息",
    request_id: randomUUID(),
  });
  while (!gateResolve) await new Promise((r) => setTimeout(r, 1));
  h.db.sqlite
    .prepare("DELETE FROM email_members WHERE user_id=?")
    .run(members[0].user_id);
  fetchMode = "ok";
  gateResolve();
  check(
    (await revoked).status === 428,
    "revoked identity cannot persist an in-flight answer",
  );
  h.db.sqlite
    .prepare(
      "INSERT INTO email_members(account_id,user_id,dorm_id,bound_at) VALUES(?,?,?,?)",
    )
    .run(1, members[0].user_id, room.dorm.id, time.toISOString());

  const empty = createCompanionRuntime(h.db, { autoStart: false });
  check(
    (
      await empty.route(
        new Request(
          "https://test.invalid/chores/companion/state?" +
            new URLSearchParams({
              invite: room.invite_code,
              member_id: String(members[0].user_id),
            }),
          { headers: { Authorization: "Bearer " + claims[0] } },
        ),
      )
    ).status === 200,
    "state remains readable without provider",
  );
  await empty.close();
  const email = emailModule.createEmailRuntime(h.db, {
    autoStart: false,
    requireRegistration: true,
    now: () => time,
  });
  const stateRequest = () =>
    new Request(
      "https://test.invalid/chores/companion/state?" +
        new URLSearchParams({
          invite: room.invite_code,
          member_id: String(members[0].user_id),
        }),
      { headers: { Authorization: "Bearer " + claims[0] } },
    );
  check(
    (await email.wrap(stateRequest(), (r) => runtime.route(r))).status === 428,
    "email admission gate also protects new chat endpoints",
  );
  const hash = (t) => createHash("sha256").update(t).digest("hex");
  h.db.sqlite
    .prepare(
      "INSERT INTO email_sessions(token_hash,account_id,created_at,expires_at) VALUES(?,?,?,?)",
    )
    .run(
      hash("fixture-email"),
      1,
      time.toISOString(),
      new Date(time.getTime() + 3600000).toISOString(),
    );
  h.db.sqlite
    .prepare(
      "INSERT INTO email_grants(token_hash,email_session_hash,full_session) VALUES(?,?,0)",
    )
    .run(hash(claims[0]), hash("fixture-email"));
  check(
    (await email.wrap(stateRequest(), (r) => runtime.route(r))).status === 200,
    "valid email grant admits the intended member chat",
  );
  h.db.sqlite
    .prepare("DELETE FROM email_sessions WHERE token_hash=?")
    .run(hash("fixture-email"));
  check(
    (await email.wrap(stateRequest(), (r) => runtime.route(r))).status === 428,
    "email logout revokes chat access without relying on UI state",
  );
  await email.close();
  console.log(
    JSON.stringify({ status: "passed", checks: checks.length, items: checks }),
  );
} finally {
  await runtime.close();
  h.close();
}
