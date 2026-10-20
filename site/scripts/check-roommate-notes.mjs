import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
const h = await createHarness();
let checks = 0;
async function call(route, options = {}, status = 200) {
  const r = await h.request(route, options);
  assert.equal(r.status, status, route);
  checks++;
  return r.json();
}
try {
  const room = await call(
    "/guest/create",
    {
      method: "POST",
      data: { name: "留言隔离验收", nickname: "甲", members: ["乙", "丙"] },
    },
    201,
  );
  const target = room.dorm.members.find((m) => m.user_id !== room.member_id);
  const recipient = await call(
    "/chores/claim",
    {
      method: "POST",
      data: {
        invite_code: room.invite_code,
        member_id: target.user_id,
        nickname: target.nickname,
      },
    },
    201,
  );
  const options = {
    method: "POST",
    token: room.access_token,
    data: { target_member_id: target.user_id, text: "晚点回来，帮我留个门。" },
  };
  const note = await call("/chores/notes", options, 201);
  assert.equal(note.source, "note");
  assert.equal(note.task_id, null);
  assert.equal(note.body, options.data.text);
  const board = await call(
    `/chores/board?invite_code=${room.invite_code}&member_id=${target.user_id}`,
    { token: recipient.access_token },
  );
  assert.ok(
    board.reminders.some((r) => r.id === note.id && r.source === "note"),
  );
  const own = await call(
    `/chores/board?invite_code=${room.invite_code}&member_id=${room.member_id}`,
    { token: room.access_token },
  );
  assert.ok(!own.reminders.some((r) => r.id === note.id));
  await call("/chores/notes", options, 429);
  await call(
    "/chores/notes",
    { ...options, data: { target_member_id: room.member_id, text: "自己" } },
    422,
  );
  await call(
    "/chores/notes",
    {
      ...options,
      data: { target_member_id: target.user_id, text: "😀".repeat(121) },
    },
    422,
  );
  await call(
    "/chores/notes",
    {
      ...options,
      data: { target_member_id: target.user_id, text: "\u0000bad" },
    },
    422,
  );
  await call(
    "/chores/notes",
    { ...options, data: { target_member_id: target.user_id, text: "   " } },
    422,
  );
  const other = await call(
    "/guest/create",
    { method: "POST", data: { name: "另一宿舍", nickname: "丁", members: [] } },
    201,
  );
  await call(
    "/chores/notes",
    { ...options, data: { target_member_id: other.member_id, text: "跨宿舍" } },
    403,
  );
  await call("/chores/notes", { method: "POST", data: options.data }, 401);
  await call(
    `/chores/reminders/${note.id}/read`,
    { method: "PATCH", token: room.access_token, data: {} },
    403,
  );
  await call(
    `/chores/reminders/${note.id}/read`,
    { method: "PATCH", token: recipient.access_token, data: {} },
    200,
  );
  const read = await call(
    `/chores/board?invite_code=${room.invite_code}&member_id=${target.user_id}`,
    { token: recipient.access_token },
  );
  assert.ok(read.reminders.find((r) => r.id === note.id).read_at);
  const group = await call(
    "/guest/create",
    {
      method: "POST",
      data: {
        name: "群发验收",
        nickname: "发送者",
        members: ["接收甲", "接收乙"],
      },
    },
    201,
  );
  const groupOptions = {
    method: "POST",
    token: group.access_token,
    data: { target_member_id: "all", text: "今晚一起打扫。" },
  };
  const broadcast = await call("/chores/notes", groupOptions, 201);
  assert.equal(broadcast.recipients, 2);
  assert.equal(new Set(broadcast.reminders.map((n) => n.id)).size, 2);
  assert(
    broadcast.reminders.every(
      (n) =>
        n.sender_name === "发送者" &&
        n.body === groupOptions.data.text &&
        n.target_member_id !== group.member_id,
    ),
  );
  for (const person of group.dorm.members.filter(
    (m) => m.user_id !== group.member_id,
  )) {
    const claim = await call(
      "/chores/claim",
      {
        method: "POST",
        data: {
          invite_code: group.invite_code,
          member_id: person.user_id,
          nickname: person.nickname,
        },
      },
      201,
    );
    const delivered = await call(
      `/chores/board?invite_code=${group.invite_code}&member_id=${person.user_id}`,
      { token: claim.access_token },
    );
    assert.equal(
      delivered.reminders.filter((n) =>
        broadcast.reminders.some((b) => b.id === n.id),
      ).length,
      1,
    );
  }
  await call("/chores/notes", groupOptions, 429);
  assert.equal(
    h.db.sqlite
      .prepare("SELECT COUNT(*) n FROM chore_reminders WHERE dorm_id=?")
      .get(group.dorm.id).n,
    2,
    "retries never partially duplicate a broadcast",
  );
  await call(
    "/chores/notes",
    {
      ...groupOptions,
      data: {
        target_member_id: group.dorm.members.find(
          (m) => m.user_id !== group.member_id,
        ).user_id,
        text: "重复",
      },
    },
    429,
  );
  await call(
    "/chores/notes",
    { ...groupOptions, token: other.access_token },
    422,
  );
  await call("/chores/notes", { ...groupOptions, token: undefined }, 401);
  await call(
    "/chores/notes",
    {
      ...groupOptions,
      data: { target_member_id: [group.member_id], text: "不能指定数组跨宿舍" },
    },
    422,
  );
  console.log(
    `Roommate notes passed: ${checks} API checks, recipient isolation, cooldown, Unicode length, invalid text, auth and read receipts.`,
  );
} finally {
  h.close();
}
