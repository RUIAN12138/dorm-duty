import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createECDH,
  randomBytes,
  createHmac,
  createDecipheriv,
  createPublicKey,
  verify,
} from "node:crypto";
import { createHarness } from "./check-cloud-backend.mjs";
import runtime from "../runtime/push-runtime.cjs";
import webpush from "web-push";
let assertions = 0;
const equal = (a, b, m) => {
  assertions++;
  assert.deepEqual(a, b, m);
};
const ok = (v, m) => {
  assertions++;
  assert(v, m);
};
const tests = [];
const test = (name, run) => tests.push({ name, run });
const device = (id) => {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    ecdh,
    endpoint: "https://web.push.apple.com/test-" + id,
    keys: {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
};
const serialized = (d) => ({ endpoint: d.endpoint, keys: d.keys });
async function api(h, p, { status = 200, ...opt } = {}) {
  const r = await h.request(p, opt);
  equal(r.status, status, p.split("?")[0]);
  return r.json();
}
async function fixture(h) {
  const r = await api(h, "/guest/create", {
    method: "POST",
    status: 201,
    data: { name: "系统推送隔离验收", nickname: "小林", members: ["小陈"] },
  });
  const owner = { id: r.member_id, token: r.access_token };
  const id = r.dorm.members.find((m) => m.user_id !== owner.id).user_id;
  const claimed = await api(h, "/chores/claim", {
    method: "POST",
    status: 201,
    data: {
      invite_code: r.invite_code,
      member_id: id,
      nickname: r.dorm.members.find((m) => m.user_id === id).nickname,
    },
  });
  const member = { id, token: claimed.access_token };
  h.env.PUSH_CONFIG = {
    available: true,
    public_key: webpush.generateVAPIDKeys().publicKey,
  };
  return {
    ...r,
    owner,
    member,
    board: async (p = member) =>
      api(h, `/chores/board?invite_code=${r.invite_code}&member_id=${p.id}`, {
        token: p.token,
      }),
  };
}
const subscribe = (h, p, d, status = 200) =>
  api(h, "/chores/push/subscribe", {
    method: "POST",
    token: p.token,
    status,
    data: serialized(d),
  });
const remind = async (h, r, key = "floor") => {
  const b = await r.board();
  return api(h, "/chores/remind", {
    method: "POST",
    status: 201,
    token: r.owner.token,
    data: {
      target_member_id: r.member.id,
      task_id: b.today_tasks.find((t) => t.key === key).id,
    },
  });
};
const jobs = (h) =>
  h.db.sqlite.prepare("SELECT * FROM chore_push_jobs ORDER BY id").all();
const subs = (h) =>
  h.db.sqlite
    .prepare("SELECT * FROM chore_push_subscriptions ORDER BY id")
    .all();
const newDelivery = (h, send, options = {}) =>
  runtime.createPushDelivery(h.db, send, options);
test("formal member config, subscription validation, idempotence and device ownership", async (h) => {
  const r = await fixture(h),
    d = device("own");
  await api(h, "/chores/push/config", { status: 401 });
  const config = await api(h, "/chores/push/config", { token: r.member.token });
  equal(config.available, true);
  ok(!("private_key" in config));
  await subscribe(h, r.member, d);
  await subscribe(h, r.member, d);
  equal(subs(h).length, 1);
  equal(subs(h)[0].revision, 1);
  for (const endpoint of [
    "http://web.push.apple.com/t",
    "https://127.0.0.1/t",
    "https://web.push.apple.com.evil.test/t",
    "https://web.push.apple.com:8443/t",
    "https://u:p@web.push.apple.com/t",
  ])
    await subscribe(h, r.member, { ...d, endpoint }, 422);
  await subscribe(
    h,
    r.member,
    { ...d, keys: { p256dh: "A".repeat(87), auth: d.keys.auth } },
    422,
  );
  await subscribe(
    h,
    r.owner,
    { ...d, keys: { ...d.keys, auth: randomBytes(16).toString("base64url") } },
    403,
  );
  await subscribe(h, r.owner, d);
  equal(subs(h)[0].user_id, r.owner.id);
  equal(subs(h)[0].revision, 2);
  await api(h, "/chores/push/unsubscribe", {
    method: "POST",
    token: r.member.token,
    data: { endpoint: d.endpoint },
    status: 403,
  });
  await api(h, "/chores/push/unsubscribe", {
    method: "POST",
    token: r.owner.token,
    data: { endpoint: d.endpoint },
  });
  equal(subs(h)[0].is_active, 0);
});
test("reminder and per-device jobs commit atomically, dedupe under concurrent reminders", async (h) => {
  const r = await fixture(h);
  await subscribe(h, r.member, device("a"));
  await subscribe(h, r.member, device("b"));
  await subscribe(h, r.owner, device("c"));
  const b = await r.board(),
    t = b.today_tasks[0];
  const send = () =>
    h.request("/chores/remind", {
      method: "POST",
      token: r.owner.token,
      data: { target_member_id: r.member.id, task_id: t.id },
    });
  const responses = await Promise.all([send(), send()]);
  equal(responses.map((x) => x.status).sort(), [201, 429]);
  equal(jobs(h).length, 2);
  ok(jobs(h).every((j) => j.user_id === r.member.id));
  const before = h.db.sqlite
    .prepare("SELECT version FROM chore_settings WHERE dorm_id=?")
    .get(r.dorm.id).version;
  h.db.sqlite.exec(
    "CREATE TRIGGER reject_push BEFORE INSERT ON chore_push_jobs BEGIN SELECT RAISE(ABORT,'test_only_failure'); END;",
  );
  await api(h, "/chores/remind", {
    method: "POST",
    token: r.owner.token,
    data: { target_member_id: r.member.id, task_id: b.today_tasks[1].id },
    status: 500,
  });
  equal(
    h.db.sqlite.prepare("SELECT count(*) AS n FROM chore_reminders").get().n,
    1,
  );
  equal(jobs(h).length, 2);
  equal(
    h.db.sqlite
      .prepare("SELECT version FROM chore_settings WHERE dorm_id=?")
      .get(r.dorm.id).version,
    before,
  );
  h.db.sqlite.exec("DROP TRIGGER reject_push");
});
function decrypt(details, d) {
  const b = details.body,
    salt = b.subarray(0, 16),
    length = b[20],
    sender = b.subarray(21, 21 + length),
    cipher = b.subarray(21 + length);
  const hmac = (key, msg) => createHmac("sha256", key).update(msg).digest();
  const authPrk = hmac(
    Buffer.from(d.keys.auth, "base64url"),
    d.ecdh.computeSecret(sender),
  );
  const info = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    d.ecdh.getPublicKey(),
    sender,
    Buffer.from([1]),
  ]);
  const ikm = hmac(authPrk, info),
    prk = hmac(salt, ikm);
  const expand = (text, n) =>
    hmac(
      prk,
      Buffer.concat([Buffer.from(text + "\0"), Buffer.from([1])]),
    ).subarray(0, n);
  const dec = createDecipheriv(
    "aes-128-gcm",
    expand("Content-Encoding: aes128gcm", 16),
    expand("Content-Encoding: nonce", 12),
  );
  dec.setAuthTag(cipher.subarray(-16));
  const plain = Buffer.concat([
    dec.update(cipher.subarray(0, -16)),
    dec.final(),
  ]);
  equal(plain.at(-1), 2);
  return plain.subarray(0, -1).toString();
}
test("real web-push encryption decrypts with receiver keys and VAPID signature verifies", async (h) => {
  const r = await fixture(h),
    d = device("encrypted");
  await subscribe(h, r.member, d);
  await remind(h, r);
  const vapid = webpush.generateVAPIDKeys();
  let received;
  const delivery = newDelivery(
    h,
    async (sub, payload, options) => {
      const details = webpush.generateRequestDetails(sub, payload, {
        ...options,
        vapidDetails: { ...vapid, subject: "https://8.148.190.114/dorm-duty/" },
      });
      ok(
        !details.body.includes(Buffer.from(payload)),
        "plaintext must not be transmitted",
      );
      equal(decrypt(details, d), payload);
      const jwt = details.headers.Authorization.match(/t=([^, ]+)/)[1],
        parts = jwt.split("."),
        p = Buffer.from(vapid.publicKey, "base64url");
      const key = createPublicKey({
        key: {
          kty: "EC",
          crv: "P-256",
          x: p.subarray(1, 33).toString("base64url"),
          y: p.subarray(33).toString("base64url"),
        },
        format: "jwk",
      });
      ok(
        verify(
          "sha256",
          Buffer.from(parts[0] + "." + parts[1]),
          { key, dsaEncoding: "ieee-p1363" },
          Buffer.from(parts[2], "base64url"),
        ),
      );
      const claims = JSON.parse(Buffer.from(parts[1], "base64url"));
      equal(claims.aud, "https://web.push.apple.com");
      received = JSON.parse(payload);
      return { statusCode: 201 };
    },
    { publicOrigin: "https://8.148.190.114" },
  );
  await delivery.drain();
  await delivery.close();
  equal(jobs(h)[0].status, "accepted");
  equal(received.title, "小林 提醒你地板");
  ok(received.body.startsWith("待办：地板。"));
  ok(received.body.includes("地板"), "encrypted body includes the actual task");
  equal(received.url, "/dorm-duty/");
  equal(received.web_push, 8030);
  equal(received.notification, {
    title: received.title,
    body: received.body,
    tag: received.tag,
    lang: "zh-CN",
    navigate: "https://8.148.190.114/dorm-duty/",
  });
});
test("roommate notes deliver without a task and stop after read acknowledgement", async (h) => {
  const r = await fixture(h);
  await subscribe(h, r.member, device("note"));
  const note = await api(h, "/chores/notes", {
    method: "POST",
    status: 201,
    token: r.owner.token,
    data: { target_member_id: r.member.id, text: "晚点回来，帮我留个门。" },
  });
  const received = [];
  const worker = newDelivery(h, async (_, payload) => {
    received.push(JSON.parse(payload));
    return { statusCode: 201 };
  });
  await worker.drain();
  equal(received.length, 1);
  equal(received[0].body, "晚点回来，帮我留个门。");
  equal(received[0].title, "小林 给你留言");
  await api(h, `/chores/reminders/${note.id}/read`, {
    method: "PATCH",
    token: r.member.token,
    data: {},
  });
  h.db.sqlite.exec(
    "UPDATE chore_push_jobs SET status='pending',attempts=0,lease=NULL,lease_until=NULL,next_attempt_at='2000-01-01T00:00:00Z'",
  );
  await worker.drain();
  equal(received.length, 1);
  equal(jobs(h)[0].status, "cancelled");
  await worker.close();
});
test("notification center body preserves custom content and has a useful empty-content fallback", async (h) => {
  const r = await fixture(h);
  await subscribe(h, r.member, device("body"));
  const note = await remind(h, r);
  const received = [];
  const worker = newDelivery(h, async (_, p) => {
    received.push(JSON.parse(p));
    return { statusCode: 201 };
  });
  for (const [content, expected] of [
    ["扫地后拖地，清理床底。", "待办：地板。扫地后拖地，清理床底。"],
    ["   ", "待办：地板。完成后记得打卡。"],
    ["长".repeat(500), "待办：地板。" + "长".repeat(154)],
  ]) {
    h.db.sqlite
      .prepare("UPDATE chore_reminders SET task_content_snapshot=? WHERE id=?")
      .run(content, note.id);
    h.db.sqlite.exec(
      "UPDATE chore_push_jobs SET status='pending',attempts=0,lease=NULL,lease_until=NULL,next_attempt_at='2000-01-01T00:00:00Z'",
    );
    await worker.drain();
    equal(received.at(-1).body, expected);
    equal(received.at(-1).title, "小林 提醒你地板");
    ok(received.at(-1).body.length <= 160);
    ok(
      !("web_push" in received.at(-1)),
      "no declarative format without an explicit HTTPS origin",
    );
  }
  await worker.close();
});
test("declarative water reminder uses a trusted prefixed HTTPS destination", async (h) => {
  for (const publicOrigin of [
    "http://8.148.190.114",
    "https://user:pass@example.test",
    "https://example.test/path",
    "https://example.test/",
  ]) {
    assertions++;
    assert.throws(() => newDelivery(h, () => {}, { publicOrigin }));
  }
  assertions++;
  assert.throws(() => newDelivery(h, () => {}, { base: "//other.test/" }));
  const r = await fixture(h);
  await subscribe(h, r.owner, device("water-content"));
  const b = await r.board(r.owner);
  await api(h, "/chores/remind", {
    method: "POST",
    status: 201,
    token: r.member.token,
    data: { target_member_id: r.owner.id, task_id: b.water_task.id },
  });
  let received;
  const worker = newDelivery(
    h,
    async (_, p) => {
      received = JSON.parse(p);
      return { statusCode: 201 };
    },
    { publicOrigin: "https://8.148.190.114" },
  );
  await worker.drain();
  await worker.close();
  equal(
    received.notification.navigate,
    "https://8.148.190.114/dorm-duty/water",
  );
  equal(received.notification.title, "小陈 提醒你抬水");
  equal(received.notification.body, received.body);
  ok(received.body.startsWith("待办：抬水。"));
  equal(jobs(h)[0].status, "accepted");
});
test("expired subscriptions deactivate; provider failures retry with persistent backoff", async (h) => {
  const r = await fixture(h),
    d = device("expired");
  await subscribe(h, r.member, d);
  await remind(h, r);
  let clock = new Date(),
    calls = 0;
  const first = newDelivery(
    h,
    async () => {
      calls++;
      throw { statusCode: 503 };
    },
    { now: () => clock },
  );
  await first.drain();
  equal(jobs(h)[0].status, "pending");
  equal(jobs(h)[0].attempts, 1);
  await first.drain();
  equal(calls, 1);
  await first.close();
  clock = new Date(clock.getTime() + 16000);
  const restarted = newDelivery(
    h,
    async () => {
      calls++;
      throw { statusCode: 410 };
    },
    { now: () => clock },
  );
  await restarted.drain();
  await restarted.close();
  equal(calls, 2);
  equal(jobs(h)[0].status, "failed");
  equal(subs(h)[0].is_active, 0);
  await subscribe(h, r.member, d, 410);
});
test("read, completed, paused, departed and rebound recipients do not receive stale pushes", async (h) => {
  for (const reason of ["read", "completed", "paused", "departed", "rebound"]) {
    const r = await fixture(h),
      d = device(reason);
    await subscribe(h, r.member, d);
    const note = await remind(h, r);
    if (reason === "read")
      await api(h, `/chores/reminders/${note.id}/read`, {
        method: "PATCH",
        token: r.member.token,
        data: {},
      });
    if (reason === "completed")
      await api(h, `/chores/tasks/${note.task_id}/complete`, {
        method: "PATCH",
        token: r.member.token,
        data: {},
      });
    if (reason === "paused")
      h.db.sqlite
        .prepare(
          "UPDATE chore_categories SET enabled=0 WHERE dorm_id=? AND key='floor'",
        )
        .run(r.dorm.id);
    if (reason === "departed")
      h.db.sqlite
        .prepare(
          "UPDATE dorm_members SET is_active=0 WHERE dorm_id=? AND user_id=?",
        )
        .run(r.dorm.id, r.member.id);
    if (reason === "rebound") await subscribe(h, r.owner, d);
    let calls = 0;
    const worker = newDelivery(h, async () => {
      calls++;
      return { statusCode: 201 };
    });
    await worker.drain();
    await worker.close();
    equal(calls, 0, reason);
    equal(jobs(h).at(-1).status, "cancelled", reason);
  }
});
test("test notifications are bound to the current device and rate limited", async (h) => {
  const r = await fixture(h),
    d = device("test");
  await subscribe(h, r.member, d);
  await api(h, "/chores/push/test", {
    method: "POST",
    token: r.owner.token,
    data: { endpoint: d.endpoint },
    status: 403,
  });
  await api(h, "/chores/push/test", {
    method: "POST",
    token: r.member.token,
    data: { endpoint: d.endpoint },
    status: 202,
  });
  await api(h, "/chores/push/test", {
    method: "POST",
    token: r.member.token,
    data: { endpoint: d.endpoint },
    status: 429,
  });
  equal(jobs(h).length, 1);
  let payload;
  const worker = newDelivery(h, async (_, p) => {
    payload = JSON.parse(p);
    return { statusCode: 201 };
  });
  await worker.drain();
  await worker.close();
  equal(payload.title, "轮到 · 测试通知");
  equal(
    payload.body,
    "小陈，这是一条测试提醒。示例：室友提醒你抬水，抬完后记得打卡。",
  );
  equal(jobs(h)[0].status, "accepted");
});
test("expired lease recovers after process interruption; parallel senders claim once", async (h) => {
  const r = await fixture(h);
  await subscribe(h, r.member, device("lease"));
  await remind(h, r);
  h.db.sqlite
    .prepare(
      "UPDATE chore_push_jobs SET status='sending',lease='old-process',lease_until='2000-01-01T00:00:00Z'",
    )
    .run();
  let calls = 0;
  const send = async () => {
    calls++;
    return { statusCode: 201 };
  };
  const a = newDelivery(h, send),
    b = newDelivery(h, send);
  await Promise.all([a.drain(), b.drain()]);
  await a.close();
  await b.close();
  equal(calls, 1);
  equal(jobs(h)[0].status, "accepted");
});
test("app-owned private keys remain identical across runtime restarts", async (h) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dorm-push-test-"));
  try {
    const a = await runtime.createPushRuntime(h.db, dir, { enabled: true });
    equal(a.config.available, true);
    await a.close();
    const original = await fs.readFile(path.join(dir, "webpush-vapid.json"));
    equal(
      (await fs.stat(path.join(dir, "webpush-vapid.json"))).mode & 0o777,
      0o600,
    );
    const b = await runtime.createPushRuntime(h.db, dir, { enabled: true });
    equal(a.config.public_key, b.config.public_key);
    await b.close();
    equal(await fs.readFile(path.join(dir, "webpush-vapid.json")), original);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
const results = [];
for (const { name, run } of tests) {
  const h = await createHarness(),
    before = assertions;
  try {
    await run(h);
    results.push({ name, status: "passed", assertions: assertions - before });
  } catch (e) {
    results.push({
      name,
      status: "failed",
      reason: String(e.message).split("\n")[0],
    });
  } finally {
    await h.flush();
    h.close();
  }
}
const report = {
  date: new Date().toISOString(),
  runtime: process.version,
  scope:
    "isolated SQLite; actual encryption; injected provider responses; no phone delivery claimed",
  assertions,
  passed: results.filter((r) => r.status === "passed").length,
  failed: results.filter((r) => r.status === "failed").length,
  tests: results,
};
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
