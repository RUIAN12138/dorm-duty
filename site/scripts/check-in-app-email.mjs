import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
import runtime from "../runtime/email-runtime.cjs";
const h = await createHarness();
let clock = Date.now(),
  sent = [],
  checks = 0;
const check = (v, label) => {
  assert(v, label);
  checks++;
};
const config = {
  host: "smtp.example.invalid",
  port: 465,
  user: "fixture@example.invalid",
  from: "fixture@example.invalid",
  password: "fixture-only",
  publicOrigin: "https://backend-test.example",
  otpSecret: "c".repeat(64),
};
const options = {
  config,
  autoStart: false,
  now: () => new Date(clock),
  send: async (message) => sent.push(message),
};
let service = runtime.createEmailRuntime(h.db, options);
try {
  const room = await (
    await h.request("/guest/create", {
      method: "POST",
      data: { name: "接收回执隔离", nickname: "甲", members: ["乙"] },
    })
  ).json();
  const other = await (
    await h.request("/chores/claim", {
      method: "POST",
      data: { invite_code: room.invite_code, nickname: "乙" },
    })
  ).json();
  const db = h.db.sqlite,
    at = () => new Date(clock).toISOString();
  const account = Number(
    db
      .prepare(
        "INSERT INTO email_accounts(email,mail_enabled,mail_enabled_at,created_at) VALUES ('receipt@example.invalid',1,?,?)",
      )
      .run(at(), at()).lastInsertRowid,
  );
  db.prepare(
    "INSERT INTO email_members(account_id,user_id,dorm_id,creator_verified,bound_at) VALUES (?,?,?,1,?)",
  ).run(account, room.member_id, room.dorm.id, at());
  let serial = 0;
  const note = () =>
    Number(
      db
        .prepare(
          "INSERT INTO chore_reminders(dorm_id,sender_id,sender_name_snapshot,target_member_id,task_name_snapshot,task_content_snapshot,created_at,mutation_key,source) VALUES (?,?,'乙',?,'抬水','没水了，记得抬水',?,?,'note')",
        )
        .run(
          room.dorm.id,
          other.member.user_id,
          room.member_id,
          at(),
          "receipt-" + ++serial,
        ).lastInsertRowid,
    );
  const ack = (id, token = room.access_token) =>
    h.request(`/chores/reminders/${id}/received`, { method: "PATCH", token });
  const job = (id) =>
    db.prepare("SELECT * FROM email_jobs WHERE reminder_id=?").get(id);
  const first = note();
  await service.drain();
  check(
    sent.length === 0 && job(first).status === "pending",
    "email waits for a foreground-delivery opportunity",
  );
  check(
    Date.parse(job(first).next_attempt_at) - clock === 20000,
    "default delivery grace is exactly 20 seconds",
  );
  check(
    (await ack(first, other.access_token)).status === 403,
    "another member cannot forge a delivery receipt",
  );
  check((await ack(first, "")).status === 401, "anonymous receipt is rejected");
  check(
    (await ack(first)).status === 200,
    "recipient can acknowledge an in-app message",
  );
  const original = db
    .prepare("SELECT * FROM chore_reminders WHERE id=?")
    .get(first);
  check(
    !!original.in_app_received_at && original.read_at === null,
    "delivery receipt never marks a message read",
  );
  check(
    (await ack(first)).status === 200,
    "delivery acknowledgement is idempotent",
  );
  check(
    db
      .prepare("SELECT in_app_received_at FROM chore_reminders WHERE id=?")
      .get(first).in_app_received_at === original.in_app_received_at,
    "first delivery time is retained",
  );
  clock += 21000;
  await service.drain();
  check(
    sent.length === 0 && job(first).status === "cancelled",
    "confirmed foreground delivery cancels pending email",
  );
  clock += 61000;
  const offline = note();
  await service.drain();
  check(
    sent.length === 0,
    "an unconfirmed notification does not bypass the grace",
  );
  clock += 21000;
  await service.drain();
  check(
    sent.length === 1 && job(offline).status === "accepted",
    "background/unconfirmed recipient still gets email",
  );
  check(
    sent[0].subject.includes("乙"),
    "email identifies the sending roommate",
  );
  await ack(offline);
  check(
    job(offline).status === "accepted",
    "already accepted email cannot be recalled or rewritten",
  );
  clock += 61000;
  const early = note();
  await ack(early);
  clock += 21000;
  await service.drain();
  check(
    sent.length === 1 && job(early).status === "cancelled",
    "receipt before email enqueue also suppresses delivery",
  );
  clock += 61000;
  const persisted = note();
  await service.drain();
  await ack(persisted);
  await service.close();
  service = runtime.createEmailRuntime(h.db, options);
  clock += 21000;
  await service.drain();
  check(
    sent.length === 1 && job(persisted).status === "cancelled",
    "suppression survives service restart",
  );
  check((await ack(99999999)).status === 404, "unknown messages are rejected");
  const stranger = await (
    await h.request("/guest/create", {
      method: "POST",
      data: { name: "另一个宿舍", nickname: "丙" },
    })
  ).json();
  check(
    (await ack(first, stranger.access_token)).status === 403,
    "cross-dormitory receipts are forbidden",
  );
  console.log(
    JSON.stringify({
      status: "passed",
      checks,
      scope: "isolated SQLite and fake SMTP; no real emails or accounts",
    }),
  );
} finally {
  await service.close();
  h.close();
}
