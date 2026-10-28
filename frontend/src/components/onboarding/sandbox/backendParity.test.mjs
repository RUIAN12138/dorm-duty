import assert from "node:assert/strict";
import { createHarness } from "../../../../../site/scripts/check-cloud-backend.mjs";
import { createDraftSandbox } from "./draftSandbox.mjs";
import { createEmailRuntime } from "../../../../../site/local/email-runtime.mjs";
import { handleApi } from "../../../../../site/worker/backend.mjs";
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : ["2026-10-27T02:00:00Z"]));
  }
  static now() {
    return new RealDate("2026-10-27T02:00:00Z").getTime();
  }
};
const h = await createHarness();
let checks = 0;
function local(value, key = "") {
  if (Array.isArray(value))
    return value.map((item) =>
      local(
        item,
        ["rotation_order", "water_order"].includes(key) ? "user_id" : key,
      ),
    );
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, local(v, k)]),
    );
  return typeof value === "number" &&
    [
      "id",
      "user_id",
      "member_id",
      "assignee_id",
      "completed_by",
      "from_member_id",
      "target_member_id",
    ].includes(key)
    ? -Math.abs(value)
    : value;
}
const task = (key, rotation) => ({
  key,
  name: key,
  content: "合成内容",
  enabled: true,
  page: key === "water" ? "water" : "duty",
  rotation,
  display: "title",
  deadline: "22:00",
  execution_time: "09:00",
  interval: 3,
});
const config = {
  schema_version: 2,
  policy: "soft",
  pages: [
    { id: "duty", label: "值日" },
    { id: "water", label: "催促" },
    { id: "calendar", label: "日历" },
  ],
  tasks: [
    task("floor", "round"),
    task("sink", "rotation"),
    task("toilet", "completion"),
    task("water", "completion"),
  ],
};
try {
  const legacy = await (
    await h.request("/guest/create", {
      method: "POST",
      data: { name: "旧宿舍对照", nickname: "旧成员", members: ["旧室友"] },
    })
  ).json();
  await h.request(
    `/chores/board?invite_code=${legacy.invite_code}&member_id=${legacy.member_id}`,
    { token: legacy.access_token },
  );
  const oldSnapshot = () =>
    JSON.stringify(
      h.db.sqlite
        .prepare("SELECT * FROM chore_tasks WHERE dorm_id=? ORDER BY id")
        .all(legacy.dorm.id),
    );
  const oldBefore = oldSnapshot();
  const room = await (
    await h.request("/guest/create", {
      method: "POST",
      data: {
        name: "沙箱对照",
        nickname: "甲",
        members: [],
        configuration: config,
      },
    })
  ).json();
  if (process.env.DORM_PARITY_MEMBERS === "2") {
    const sent = [];
    const mail = createEmailRuntime(h.db, {
      config: {
        host: "smtp.invalid",
        port: 465,
        user: "test@example.invalid",
        password: "fixture",
        from: "test@example.invalid",
        publicOrigin: "https://backend-test.example",
        otpSecret: "b".repeat(64),
      },
      autoStart: false,
      send: async (m) => sent.push(m),
    });
    let cookie = "";
    async function call(path, data) {
      const req = new Request("https://backend-test.example" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Dorm-Email": "1",
          Origin: "https://backend-test.example",
          Cookie: cookie,
        },
        body: JSON.stringify(data),
      });
      const r = await mail.wrap(req, (request, emailCreator) =>
        handleApi(request, { ...h.env, EMAIL_CREATOR: emailCreator }),
      );
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      return r;
    }
    const email = "peer@example.invalid",
      challenge = await (await call("/email/code", { email })).json();
    const code = sent.at(-1).text.match(/验证码是：(\d{6})/)[1];
    assert.equal(
      (
        await call("/email/verify", {
          email,
          code,
          challenge_id: challenge.challenge_id,
          mail_enabled: false,
        })
      ).status,
      200,
    );
    const join = await call("/chores/claim", {
      invite_code: room.invite_code,
      nickname: "乙",
    });
    assert.equal(join.status, 201, await join.clone().text());
    await mail.close();
  }
  const get = async () => {
    const response = await h.request(
      `/chores/board?invite_code=${room.invite_code}&member_id=${room.member_id}`,
      { token: room.access_token },
    );
    assert(response.ok);
    return response.json();
  };
  const initial = await get(),
    s = createDraftSandbox(local(initial), () => new Date());
  function shape(board) {
    return {
      tasks: board.workspace_tasks
        .map((t) => ({
          key: t.key,
          mode: t.mode,
          assignee: t.assignee_id,
          status: t.status,
          sequence: t.sequence ?? null,
          can_complete: t.can_complete,
        }))
        .sort((a, b) => a.key.localeCompare(b.key) || a.assignee - b.assignee),
      rounds: board.rounds
        .map((r) => ({
          key: r.key,
          sequence: r.sequence,
          completed: r.completed,
          total: r.total,
        }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      records: board.calendar
        .map((r) => ({
          key: r.key,
          assignee: r.assignee_id,
          date: r.completed_date,
        }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      water: board.water_task
        ? {
            assignee: board.water_task.assignee_id,
            sequence: board.water_task.sequence,
            status: board.water_task.status,
          }
        : null,
    };
  }
  async function compare(label) {
    assert.deepEqual(shape(s.snapshot()), shape(local(await get())), label);
    checks++;
  }
  await compare("initial synthetic snapshot matches actual service shape");
  for (const key of ["floor", "sink", "toilet", "water"]) {
    const remote = (await get()).workspace_tasks.find(
        (t) => t.key === key && t.assignee_id === room.member_id,
      ),
      sim = s
        .snapshot()
        .workspace_tasks.find(
          (t) => t.key === key && t.assignee_id === -room.member_id,
        );
    if (!remote) {
      const peer = (await get()).workspace_tasks.find(
        (t) => t.key === key && t.status === "pending",
      );
      const syntheticPeer = s
        .snapshot()
        .workspace_tasks.find((t) => t.id === -peer.id);
      assert.throws(() => s.complete(syntheticPeer));
      const denied = await h.request(`/chores/tasks/${peer.id}/complete`, {
        token: room.access_token,
        method: "PATCH",
        data: {},
      });
      assert.equal(denied.status, 403);
      await compare(`${key} rejects completing another member's task`);
      continue;
    }
    s.complete(sim);
    const completed = await h.request(`/chores/tasks/${remote.id}/complete`, {
      token: room.access_token,
      method: "PATCH",
      data: {},
    });
    assert(completed.ok, await completed.clone().text());
    await compare(`${key} completion and next round/turn match real backend`);
    s.undo(sim.id);
    const undone = await h.request(`/chores/tasks/${remote.id}/undo`, {
      token: room.access_token,
      method: "PATCH",
      data: {},
    });
    assert(undone.ok, await undone.clone().text());
    await compare(`${key} undo matches real backend`);
  }
  assert.equal(oldSnapshot(), oldBefore);
  checks++;
  console.log(
    JSON.stringify({
      status: "passed",
      checks,
      scope:
        "real API and temporary SQLite versus local sandbox; synthetic members; no production database",
    }),
  );
} finally {
  h.close();
  globalThis.Date = RealDate;
}
