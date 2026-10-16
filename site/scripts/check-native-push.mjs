import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
import { createNativeSender } from "../../scripts/native-push-provider.mjs";
import runtime from "../runtime/push-runtime.cjs";
const h = await createHarness();
let checks = 0;
function eq(a, b) {
  checks++;
  assert.deepEqual(a, b);
}
async function api(path, token, data, status = 200) {
  const response = await h.request(path, {
    token,
    method: data ? "POST" : "GET",
    ...(data ? { data } : {}),
  });
  eq(response.status, status);
  return response.json();
}
try {
  const room = await api(
    "/guest/create",
    null,
    { name: "安装版隔离测试", nickname: "甲", members: ["乙"] },
    201,
  );
  const owner = room.access_token,
    mid = room.dorm.members.find((m) => m.user_id !== room.member_id).user_id;
  const member = (
    await api(
      "/chores/claim",
      null,
      { invite_code: room.invite_code, member_id: mid, nickname: room.dorm.members.find(m => m.user_id === mid).nickname },
      201,
    )
  ).access_token;
  await api("/chores/native/config", null, null, 401);
  eq(await api("/chores/native/config", member), {
    android: false,
    harmony: false,
  });
  const device = {
    platform: "android",
    registration_id: "native-reg-1234",
    device_id: "1".repeat(64),
    device_secret: "2".repeat(64),
  };
  await api("/chores/native/subscribe", member, device, 503);
  h.env.NATIVE_PUSH_CONFIG = { android: true, harmony: true };
  await api("/chores/native/subscribe", member, device);
  await api("/chores/native/subscribe", member, device);
  const sub = () =>
    h.db.sqlite
      .prepare("SELECT * FROM chore_push_subscriptions WHERE provider='jpush'")
      .get();
  eq(sub().revision, 1);
  eq(sub().user_id, mid);
  eq(sub().p256dh, "");
  eq(sub().auth, "");
  await api(
    "/chores/native/subscribe",
    owner,
    { ...device, device_secret: "3".repeat(64) },
    403,
  );
  await api("/chores/native/test", owner, device, 403);
  await api(
    "/chores/native/subscribe",
    owner,
    { ...device, device_id: "3".repeat(64) },
    403,
  );
  await api(
    "/chores/native/subscribe",
    member,
    { ...device, registration_id: "https://127.0.0.1/anything" },
    422,
  );
  await api("/chores/native/test", member, device, 202);
  await api("/chores/native/test", member, device, 429);
  let sent = 0;
  const delivery = runtime.createPushDelivery(h.db, async (s, payload) => {
    sent++;
    eq(s.provider, "jpush");
    eq(s.platform, "android");
    eq(JSON.parse(payload).title, "轮到 · 测试通知");
    return { statusCode: 201 };
  });
  await delivery.drain();
  eq(sent, 1);
  eq(
    h.db.sqlite.prepare("SELECT status FROM chore_push_jobs").get().status,
    "accepted",
  );
  await delivery.close();
  const b = await api(
    `/chores/board?invite_code=${room.invite_code}&member_id=${mid}`,
    member,
  );
  await api(
    "/chores/remind",
    owner,
    { target_member_id: mid, task_id: b.today_tasks[0].id },
    201,
  );
  eq(
    h.db.sqlite
      .prepare(
        "SELECT count(*) as n FROM chore_push_jobs WHERE kind='reminder'",
      )
      .get().n,
    1,
  );
  await api("/chores/native/subscribe", owner, device);
  eq(sub().revision, 2);
  eq(sub().user_id, room.member_id);
  const stale = runtime.createPushDelivery(h.db, async () => {
    throw new Error("stale device must not send");
  });
  await stale.drain();
  await stale.close();
  eq(
    h.db.sqlite
      .prepare("SELECT status FROM chore_push_jobs WHERE kind='reminder'")
      .get().status,
    "cancelled",
  );
  await api("/chores/native/unsubscribe", member, device, 403);
  await api("/chores/native/unsubscribe", owner, device);
  eq(sub().is_active, 0);
  await api("/chores/native/test", owner, device, 409);
  await api("/chores/native/subscribe", member, {
    ...device,
    platform: "harmony",
    device_id: "4".repeat(64),
    registration_id: "harmony-reg-1234",
  });
  const credentials = {
    android: { appKey: "a".repeat(24), masterSecret: "b".repeat(32) },
    harmony: { appKey: "c".repeat(24), masterSecret: "d".repeat(32) },
  };
  for (const platform of ["android", "harmony"]) {
    let value;
    const send = createNativeSender(credentials, async (url, options) => {
      eq(url, "https://api.jpush.cn/v3/push");
      eq(options.redirect, "error");
      value = JSON.parse(options.body);
      return new Response(JSON.stringify({ msg_id: "test-message" }), {
        status: 200,
      });
    });
    await send(
      { platform, endpoint: `jpush:${platform}:reg-123456` },
      JSON.stringify({
        title: "值日提醒",
        body: "地板",
        url: "/dorm-duty/",
        tag: "test",
      }),
    );
    eq(value.audience, { registration_id: ["reg-123456"] });
    eq(value.platform, [platform === "harmony" ? "hmos" : "android"]);
    eq(
      value.notification[platform === "harmony" ? "hmos" : "android"].title,
      "值日提醒",
    );
  }
  const failed = createNativeSender(
    credentials,
    async () =>
      new Response(JSON.stringify({ error: { code: 1011 } }), { status: 400 }),
  );
  await assert.rejects(
    () =>
      failed(
        { platform: "android", endpoint: "jpush:android:reg-123456" },
        '{"title":"t","body":"b"}',
      ),
    (error) => error.statusCode === 410,
  );
  checks++;
  console.log(
    JSON.stringify(
      {
        runtime: process.version,
        checks,
        status: "passed",
        scope:
          "isolated native binding, revision, CAS queue, targeted provider payload; no real device or provider credentials",
      },
      null,
      2,
    ),
  );
} finally {
  await h.close();
}
