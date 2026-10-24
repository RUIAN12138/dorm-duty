import assert from "node:assert/strict";
import {createEmailRuntime} from "../site/local/email-runtime.mjs";
import {handleApi} from "../site/worker/backend.mjs";
import { createHarness } from "../site/scripts/check-cloud-backend.mjs";
import { validateDormConfiguration } from "../site/shared/dorm-configuration.mjs";
const RealDate=Date;
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:["2026-10-24T02:00:00Z"]));}static now(){return new RealDate("2026-10-24T02:00:00Z").getTime();}};
const h = await createHarness();
let checks = 0;
const check = (v, label) => {
  assert(v, label);
  checks++;
  console.log("PASS " + label);
};
const config = {
  schema_version: 2,
  policy: "hard",
  pages: [
    { id: "water", label: "第二页" },
    { id: "duty", label: "值日" },
    { id: "calendar", label: "日历" },
  ],
  tasks: [
    {
      key: "floor",
      name: "清洁地板",
      content: "地面与垃圾",
      enabled: true,
      page: "water",
      rotation: "rotation",
      display: "card",
      deadline: "22:00",
      interval: 4,
    },
    {
      key: "water",
      name: "搬水",
      content: "饮用水",
      enabled: true,
      page: "duty",
      rotation: "rotation",
      display: "title",
      deadline: "20:00",
      interval: 2,
    },
  ],
};
const create = async (name, configuration) => {
  const r = await h.request("/guest/create", {
    method: "POST",
    data: {
      name,
      nickname: "创建者",
      members: configuration ? [] : ["室友"],
      ...(configuration ? { configuration } : {}),
    },
  });
  assert.equal(r.status, 201, await r.clone().text());
  return r.json();
};
try {
  const old = await create("旧宿舍");
  check(!old.dorm.configuration, "legacy room has no configuration");
  const room = await create("新版宿舍", config);
  check(
    room.dorm.configuration.schema_version === 2,
    "creation atomically stores explicit version2",
  );
  const board = async (
    r = room,
    token = r.access_token,
    member = r.member_id,
  ) =>
    await (
      await h.request(
        `/chores/board?invite_code=${r.invite_code}&member_id=${member}`,
        { token },
      )
    ).json();
  let b = await board();
  check(
    b.categories.find((c) => c.key === "floor").name === "清洁地板",
    "new room applies configured task name",
  );
  check(
    b.categories.find((c) => c.key === "floor").mode === "scheduled",
    "hard mode schedules by deadline",
  );
  check(
    !b.categories.find((c) => c.key === "toilet").enabled,
    "removed tasks remain disabled not silently restored",
  );
  check(
    b.configuration.pages[0].id === "water",
    "saved nav order survives server read",
  );
  const sent=[];
  const mail=createEmailRuntime(h.db,{config:{host:"smtp.invalid",port:465,user:"test@example.invalid",password:"fixture-only",from:"test@example.invalid",publicOrigin:"https://backend-test.example",otpSecret:"b".repeat(64)},autoStart:false,send:async(m)=>sent.push(m)});
  let cookie="";
  async function emailApi(path,data){
    const r=await mail.wrap(new Request("https://backend-test.example"+path,{method:"POST",headers:{"Content-Type":"application/json","X-Dorm-Email":"1",Origin:"https://backend-test.example",Cookie:cookie,"X-Dorm-Client":"wizard-fixture"},body:JSON.stringify(data)}),(request,emailCreator)=>handleApi(request,{...h.env,EMAIL_CREATOR:emailCreator}));
    if(r.headers.get("set-cookie"))cookie=r.headers.get("set-cookie").split(";")[0];
    return r;
  }
  const challenge=await (await emailApi("/email/code",{email:"joining@example.invalid"})).json();
  const digits=sent.at(-1).text.match(/验证码是：(\d{6})/)[1];
  assert((await emailApi("/email/verify",{email:"joining@example.invalid",code:digits,challenge_id:challenge.challenge_id,mail_enabled:false})).ok);
  const joined=await emailApi("/chores/claim",{invite_code:room.invite_code,nickname:"自行加入"});
  check(joined.status===201,"verified email may create own name only in a new room");
  const joinedValue=await joined.json(),token=joinedValue.access_token,peer={user_id:joinedValue.member.user_id};
  const again=await (await emailApi("/chores/claim",{invite_code:room.invite_code,nickname:"自行加入"})).json();
  check(again.member.user_id===peer.user_id,"repeated join reuses binding without duplicate member");
  check((await emailApi("/chores/claim",{invite_code:room.invite_code,nickname:"另一个人"})).status===403,"one email cannot silently create another identity");
  check((await emailApi("/chores/claim",{invite_code:old.invite_code,nickname:"自行加入"})).status===403,"old room still requires creator roster");
  const n=h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM dorm_members WHERE dorm_id=?").get(room.dorm.id).n;
  check(n===2,"no virtual roommate list was created");
  const task = b.workspace_tasks.find(
    (t) => t.key === "floor" && t.status === "pending",
  );
  assert(task);
  const res = await h.request(`/chores/tasks/${task.id}/complete`, {
    token,
    method: "PATCH",
    data: {},
  });
  check(res.ok, "version2 peer can complete another assigned task");
  const row = h.db.sqlite
    .prepare("SELECT assignee_id,completed_by FROM chore_tasks WHERE id=?")
    .get(task.id);
  check(
    row.assignee_id === task.assignee_id && row.completed_by === peer.user_id,
    "delegate keeps planned owner and records actual completer",
  );
  const undo = await h.request(`/chores/tasks/${task.id}/undo`, {
    token,
    method: "PATCH",
    data: {},
  });
  check(undo.ok, "actual completer can undo a delegated task");
  await h.request(`/chores/tasks/${task.id}/complete`, {
    token,
    method: "PATCH",
    data: {},
  });
  b = await board();
  const history = b.calendar.find((r) => r.id === task.id);
  check(
    history?.assignee_id === peer.user_id,
    "calendar credits actual completer",
  );
  const oldb = await board(old);
  const oldtask = oldb.today_tasks[0];
  const oldpeer = old.dorm.members.find((m) => m.user_id !== old.member_id);
  const oldtoken = (
    await (
      await h.request("/chores/claim", {
        method: "POST",
        data: { invite_code: old.invite_code, nickname: oldpeer.nickname },
      })
    ).json()
  ).access_token;
  const forbidden = await h.request(`/chores/tasks/${oldtask.id}/complete`, {
    token: oldtoken,
    method: "PATCH",
    data: {},
  });
  check(
    forbidden.status === 403,
    "legacy cannot delegate: original permission unchanged",
  );
  const invalid = await h.request("/guest/create", {
    method: "POST",
    data: {
      name: "坏配置",
      nickname: "新用户",
      configuration: { ...config, pages: [] },
    },
  });
  check(invalid.status === 422, "invalid config rejected before creation");
  let invalidKey = false;
  try {
    validateDormConfiguration({
      ...config,
      tasks: [{ ...config.tasks[0], key: "other" }],
    });
  } catch {
    invalidKey = true;
  }
  check(invalidKey, "unknown task keys cannot enter version2");
  const categories = b.categories;
  const update = await h.request("/chores/settings", {
    token: room.access_token,
    method: "PATCH",
    data: {
      version: b.version,
      categories,
      configuration: { ...config, pages: [...config.pages].reverse() },
    },
  });
  check(update.ok, "creator workspace settings save");
  const stale = await h.request("/chores/settings", {
    token: room.access_token,
    method: "PATCH",
    data: { version: b.version, categories, configuration: config },
  });
  check(
    stale.status === 409,
    "workspace optimistic conflict prevents lost update",
  );
  const legacyUpdate = await h.request("/chores/settings", {
    token: old.access_token,
    method: "PATCH",
    data: {
      version: oldb.version,
      categories: oldb.categories,
      configuration: config,
    },
  });
  check(
    legacyUpdate.status === 409,
    "old room cannot silently migrate from settings",
  );
  const unauthorized = await h.request("/chores/settings", {
    token,
    method: "PATCH",
    data: { version: b.version, categories, configuration: config },
  });
  check(unauthorized.status === 403, "noncreator cannot edit workspace");
  const hardConfig={...config,policy:"hard",tasks:[{...config.tasks[0],page:"duty",rotation:"round",execution_time:"20:00",deadline:"22:00"}]};
  const hardRoom=await create("硬性全员测试",hardConfig);
  const hb=await board(hardRoom);
  check(hb.categories.find(c=>c.key==="floor").mode==="self_round","hard policy does not override chosen full-member round");
  const ht=hb.workspace_tasks.find(t=>t.key==="floor");
  check(!!ht.deadline_at,"hard full-member round has a persisted deadline");
  const early=await h.request(`/chores/tasks/${ht.id}/complete`,{token:hardRoom.access_token,method:"PATCH",data:{}});
  check(early.status===422&&(await early.json()).detail.code==="task_not_started","execution time is enforced only for new hard tasks");
  const changeTime=await h.request("/chores/settings",{token:hardRoom.access_token,method:"PATCH",data:{version:hb.version,categories:hb.categories,configuration:{...hardConfig,tasks:[{...hardConfig.tasks[0],execution_time:"08:00"}]}}});
  check(changeTime.ok,"hard time update keeps chosen round");
  check((await h.request(`/chores/tasks/${ht.id}/complete`,{token:hardRoom.access_token,method:"PATCH",data:{}})).ok,"hard task may complete after execution time");
  console.log(
    JSON.stringify({
      checks,
      scope: "isolated SQLite; no real users or devices",
    }),
  );
} finally {
  globalThis.Date=RealDate;
  await h.close?.();
}
