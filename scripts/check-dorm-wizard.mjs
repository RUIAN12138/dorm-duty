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
  async function verifyEmail(email){
    const challenge=await (await emailApi("/email/code",{email})).json();
    const digits=sent.at(-1).text.match(/验证码是：(\d{6})/)[1];
    const verified=await emailApi("/email/verify",{email,code:digits,challenge_id:challenge.challenge_id,mail_enabled:false});
    assert(verified.ok,`fixture email verification failed for ${email}`);
  }
  async function joinRoom(invite_code,nickname){
    return await emailApi("/chores/claim",{invite_code,nickname});
  }
  const sideEffects=(dormId)=>({
    reminders:h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM chore_reminders WHERE dorm_id=?").get(dormId).n,
    pushJobs:h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM chore_push_jobs WHERE dorm_id=?").get(dormId).n,
    corrections:h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM chore_history_entries WHERE dorm_id=?").get(dormId).n,
  });
  await verifyEmail("joining@example.invalid");
  const joined=await joinRoom(room.invite_code,"自行加入");
  check(joined.status===201,"verified email may create own name only in a new room");
  const joinedValue=await joined.json(),token=joinedValue.access_token,peer={user_id:joinedValue.member.user_id};
  const again=await (await emailApi("/chores/claim",{invite_code:room.invite_code,nickname:"自行加入"})).json();
  check(again.member.user_id===peer.user_id,"repeated join reuses binding without duplicate member");
  check((await emailApi("/chores/claim",{invite_code:room.invite_code,nickname:"另一个人"})).status===403,"one email cannot silently create another identity");
  check((await emailApi("/chores/claim",{invite_code:old.invite_code,nickname:"自行加入"})).status===403,"old room still requires creator roster");
  const n=h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM dorm_members WHERE dorm_id=?").get(room.dorm.id).n;
  check(n===2,"no virtual roommate list was created");
  const completionConfig={...config,policy:"soft",tasks:config.tasks.map(t=>t.key==="floor"?{...t,page:"duty",rotation:"completion"}:t)};
  const completionRoom=await create("完成后交接宿舍",completionConfig);
  check(completionRoom.dorm.configuration.tasks.find(t=>t.key==="floor").rotation==="completion","schema-v2 creation persists the explicit completion rhythm");
  const completionPeerResponse=await emailApi("/chores/claim",{invite_code:completionRoom.invite_code,nickname:"下一位室友"});
  check(completionPeerResponse.status===201,"a second verified member can join the completion-room fixture");
  const completionPeer=await completionPeerResponse.json();
  const completionBoard=await board(completionRoom);
  check(completionBoard.categories.find(c=>c.key==="floor").mode==="completion","explicit v2 completion config initializes the real completion mode");
  const firstTurn=completionBoard.workspace_tasks.find(t=>t.key==="floor"&&t.status==="pending");
  assert(firstTurn);
  const completionPeerBoard=await board(completionRoom,completionPeer.access_token,completionPeer.member.user_id);
  const peerCompletionTurn=completionPeerBoard.workspace_tasks.find(t=>t.id===firstTurn.id);
  check(peerCompletionTurn?.can_complete===false,"soft completion turn is not exposed as completable to another member");
  const completionBefore={
    version:h.db.sqlite.prepare("SELECT version FROM chore_settings WHERE dorm_id=?").get(completionRoom.dorm.id).version,
    task:h.db.sqlite.prepare("SELECT status,completed_by FROM chore_tasks WHERE id=?").get(firstTurn.id),
    pending:h.db.sqlite.prepare("SELECT sequence,assignee_id,status FROM chore_tasks WHERE dorm_id=? AND key='floor' AND status IN ('pending','completed') ORDER BY sequence").all(completionRoom.dorm.id),
    sideEffects:sideEffects(completionRoom.dorm.id),
  };
  const softCompletionAttempt=await h.request(`/chores/tasks/${firstTurn.id}/complete`,{token:completionPeer.access_token,method:"PATCH",data:{}});
  check(softCompletionAttempt.status===403,"soft completion rhythm rejects another member at the service boundary");
  const completionAfter={
    version:h.db.sqlite.prepare("SELECT version FROM chore_settings WHERE dorm_id=?").get(completionRoom.dorm.id).version,
    task:h.db.sqlite.prepare("SELECT status,completed_by FROM chore_tasks WHERE id=?").get(firstTurn.id),
    pending:h.db.sqlite.prepare("SELECT sequence,assignee_id,status FROM chore_tasks WHERE dorm_id=? AND key='floor' AND status IN ('pending','completed') ORDER BY sequence").all(completionRoom.dorm.id),
    sideEffects:sideEffects(completionRoom.dorm.id),
  };
  check(JSON.stringify(completionAfter)===JSON.stringify(completionBefore),"denied soft completion leaves task, round version, handoff, history, reminders, and push jobs unchanged");
  const concurrent=await Promise.all([
    h.request(`/chores/tasks/${firstTurn.id}/complete`,{token:completionRoom.access_token,method:"PATCH",data:{}}),
    h.request(`/chores/tasks/${firstTurn.id}/complete`,{token:completionRoom.access_token,method:"PATCH",data:{}}),
  ]);
  check(concurrent.filter(r=>r.ok).length===1&&concurrent.filter(r=>r.status===409).length===1,"concurrent completion advances the handoff exactly once");
  const completionReceipt=await concurrent.find(r=>r.ok).clone().json();
  const completionRow=h.db.sqlite.prepare("SELECT status,assignee_id,completed_by FROM chore_tasks WHERE id=?").get(firstTurn.id);
  check(completionReceipt.task.status===completionRow.status&&completionReceipt.task.assignee_id===completionRow.assignee_id&&completionReceipt.task.completed_by===completionRow.completed_by&&completionReceipt.task.completed_by===completionRoom.member_id,"self-completion receipt matches persisted completion identity");
  let pendingTurns=h.db.sqlite.prepare("SELECT sequence,assignee_id FROM chore_tasks WHERE dorm_id=? AND key='floor' AND status='pending' ORDER BY sequence").all(completionRoom.dorm.id);
  check(pendingTurns.length===1&&pendingTurns[0].sequence===2&&pendingTurns[0].assignee_id===completionPeer.member.user_id,"successful completion creates one next turn for the next active member");
  const directV2Mode=await h.request("/chores/settings",{token:completionRoom.access_token,method:"PATCH",data:{version:completionBoard.version+1,categories:completionBoard.categories}});
  check(directV2Mode.status===422,"the new completion mode requires an explicit v2 configuration payload");
  const completionUndo=await h.request(`/chores/tasks/${firstTurn.id}/undo`,{token:completionRoom.access_token,method:"PATCH",data:{}});
  check(completionUndo.ok,"undo cancels the next completion turn and restores the just-completed turn");
  const completionUndoReceipt=await completionUndo.clone().json();
  const completionUndoRow=h.db.sqlite.prepare("SELECT status,assignee_id,completed_by FROM chore_tasks WHERE id=?").get(firstTurn.id);
  check(completionUndoReceipt.task.status===completionUndoRow.status&&completionUndoReceipt.task.assignee_id===completionUndoRow.assignee_id&&completionUndoReceipt.task.completed_by===completionUndoRow.completed_by&&completionUndoReceipt.task.status==="pending"&&completionUndoReceipt.task.completed_by===null,"self-undo receipt matches the restored database row");
  const completionUndoBoard=await board(completionRoom,completionRoom.access_token,completionRoom.member_id);
  const completionUndoView=completionUndoBoard.workspace_tasks.find(t=>t.id===firstTurn.id)||completionUndoBoard.today_tasks.find(t=>t.id===firstTurn.id);
  check(completionUndoView?.status===completionUndoRow.status&&completionUndoView.assignee_id===completionUndoRow.assignee_id&&completionUndoView.completed_by===completionUndoRow.completed_by,"self-undo receipt agrees with the next board GET");
  const restored=pendingTurns=h.db.sqlite.prepare("SELECT sequence,assignee_id FROM chore_tasks WHERE dorm_id=? AND key='floor' AND status='pending' ORDER BY sequence").all(completionRoom.dorm.id);
  check(restored.length===1&&restored[0].sequence===1&&restored[0].assignee_id===firstTurn.assignee_id,"undo leaves exactly the original assignee's turn pending");
  await h.request(`/chores/tasks/${firstTurn.id}/complete`,{token:completionRoom.access_token,method:"PATCH",data:{}});
  pendingTurns=h.db.sqlite.prepare("SELECT sequence,assignee_id FROM chore_tasks WHERE dorm_id=? AND key='floor' AND status='pending' ORDER BY sequence").all(completionRoom.dorm.id);
  check(pendingTurns.length===1&&pendingTurns[0].sequence===3&&pendingTurns[0].assignee_id===completionPeer.member.user_id,"re-completion advances once without reusing a cancelled sequence");

  const softRoundConfig={...config,policy:"soft",tasks:config.tasks.map(t=>t.key==="floor"?{...t,page:"duty",rotation:"round"}:t)};
  const softRoundRoom=await create("软性全员轮次权限",softRoundConfig);
  const softRoundPeer=await (await joinRoom(softRoundRoom.invite_code,"轮次室友")).json();
  const softRoundBoard=await board(softRoundRoom);
  const ownerRoundTask=softRoundBoard.workspace_tasks.find(t=>t.key==="floor"&&t.assignee_id===softRoundRoom.member_id&&t.status==="pending");
  assert(ownerRoundTask);
  const softRoundPeerBoard=await board(softRoundRoom,softRoundPeer.access_token,softRoundPeer.member.user_id);
  check(softRoundPeerBoard.workspace_tasks.find(t=>t.id===ownerRoundTask.id)?.can_complete===false,"soft self-round tasks are not exposed as completable to another member");
  const softRoundBefore={
    version:h.db.sqlite.prepare("SELECT version FROM chore_settings WHERE dorm_id=?").get(softRoundRoom.dorm.id).version,
    task:h.db.sqlite.prepare("SELECT status,completed_by FROM chore_tasks WHERE id=?").get(ownerRoundTask.id),
    sequence:h.db.sqlite.prepare("SELECT MAX(sequence) AS sequence FROM chore_tasks WHERE dorm_id=? AND key='floor' AND status<>'cancelled'").get(softRoundRoom.dorm.id).sequence,
    sideEffects:sideEffects(softRoundRoom.dorm.id),
  };
  const softRoundAttempt=await h.request(`/chores/tasks/${ownerRoundTask.id}/complete`,{token:softRoundPeer.access_token,method:"PATCH",data:{}});
  check(softRoundAttempt.status===403,"soft self-round rejects another member at the service boundary");
  const softRoundAfter={
    version:h.db.sqlite.prepare("SELECT version FROM chore_settings WHERE dorm_id=?").get(softRoundRoom.dorm.id).version,
    task:h.db.sqlite.prepare("SELECT status,completed_by FROM chore_tasks WHERE id=?").get(ownerRoundTask.id),
    sequence:h.db.sqlite.prepare("SELECT MAX(sequence) AS sequence FROM chore_tasks WHERE dorm_id=? AND key='floor' AND status<>'cancelled'").get(softRoundRoom.dorm.id).sequence,
    sideEffects:sideEffects(softRoundRoom.dorm.id),
  };
  check(JSON.stringify(softRoundAfter)===JSON.stringify(softRoundBefore),"denied soft round leaves completion, sequence, version, history, reminders, and push jobs unchanged");

  const softScheduledConfig={...config,policy:"soft",tasks:config.tasks.map(t=>t.key==="floor"?{...t,page:"duty",rotation:"rotation"}:t)};
  const softScheduledRoom=await create("软性排班权限",softScheduledConfig);
  const softScheduledPeer=await (await joinRoom(softScheduledRoom.invite_code,"排班室友")).json();
  const softScheduledBoard=await board(softScheduledRoom);
  const softScheduledTask=softScheduledBoard.workspace_tasks.find(t=>t.key==="floor"&&t.assignee_id===softScheduledRoom.member_id&&t.status==="pending");
  assert(softScheduledTask);
  const softScheduledPeerBoard=await board(softScheduledRoom,softScheduledPeer.access_token,softScheduledPeer.member.user_id);
  check(softScheduledPeerBoard.workspace_tasks.find(t=>t.id===softScheduledTask.id)?.can_complete===false,"scheduled mode alone does not grant soft-policy delegation");
  const softScheduledAttempt=await h.request(`/chores/tasks/${softScheduledTask.id}/complete`,{token:softScheduledPeer.access_token,method:"PATCH",data:{}});
  check(softScheduledAttempt.status===403,"soft scheduled task rejects a non-assignee despite its scheduled mode");

  const task = b.workspace_tasks.find(
    (t) => t.key === "floor" && t.status === "pending",
  );
  assert(task);
  const scheduledPeerBoard=await board(room,token,peer.user_id);
  check(scheduledPeerBoard.workspace_tasks.find(t=>t.id===task.id)?.can_complete===true,"hard scheduled task exposes controlled delegation after execution time");
  const res = await h.request(`/chores/tasks/${task.id}/complete`, {
    token,
    method: "PATCH",
    data: {},
  });
  check(res.ok, "hard scheduled v2 policy permits another member to complete the assigned task");
  const row = h.db.sqlite
    .prepare("SELECT assignee_id,completed_by,assignee_name_snapshot FROM chore_tasks WHERE id=?")
    .get(task.id);
  check(
    row.assignee_id === task.assignee_id && row.completed_by === peer.user_id && row.assignee_name_snapshot===joinedValue.member.nickname,
    "delegation keeps planned owner while completion identity and history snapshot name the actual completer",
  );
  const peerUndoBoard=await board(room,token,peer.user_id);
  check(peerUndoBoard.undo_tasks.some(t=>t.id===task.id),"actual delegate receives the matching undo entry");
  const ownerUndo=await h.request(`/chores/tasks/${task.id}/undo`,{token:room.access_token,method:"PATCH",data:{}});
  check(ownerUndo.status===403,"planned owner cannot undo another member's delegated completion");
  const historyAfterDelegation=peerUndoBoard.calendar.find(r=>r.id===task.id);
  check(historyAfterDelegation?.assignee_id===peer.user_id&&historyAfterDelegation?.assignee_name===joinedValue.member.nickname,"calendar history attributes delegated work to its actual completer");
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
  const legacyCompletion=await h.request("/chores/settings",{token:old.access_token,method:"PATCH",data:{version:oldb.version,categories:oldb.categories.map(c=>c.key==="floor"?{...c,mode:"completion"}:c)}});
  check(legacyCompletion.status===422,"legacy room settings cannot enable the new non-water completion rhythm");
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
  const legacyBefore={
    version:h.db.sqlite.prepare("SELECT version FROM chore_settings WHERE dorm_id=?").get(old.dorm.id).version,
    task:h.db.sqlite.prepare("SELECT status,assignee_id,completed_by FROM chore_tasks WHERE id=?").get(oldtask.id),
    sideEffects:sideEffects(old.dorm.id),
  };
  const forbidden = await h.request(`/chores/tasks/${oldtask.id}/complete`, {
    token: oldtoken,
    method: "PATCH",
    data: {},
  });
  check(
    forbidden.status === 403,
    "legacy cannot delegate: original permission unchanged",
  );
  const legacyAfter={
    version:h.db.sqlite.prepare("SELECT version FROM chore_settings WHERE dorm_id=?").get(old.dorm.id).version,
    task:h.db.sqlite.prepare("SELECT status,assignee_id,completed_by FROM chore_tasks WHERE id=?").get(oldtask.id),
    sideEffects:sideEffects(old.dorm.id),
  };
  check(JSON.stringify(legacyAfter)===JSON.stringify(legacyBefore),"legacy delegation rejection preserves its task, version, history, reminders, and push jobs");
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
  const hardRoundPeer=await (await joinRoom(hardRoom.invite_code,"硬性轮次室友")).json();
  const hb=await board(hardRoom);
  check(hb.categories.find(c=>c.key==="floor").mode==="self_round","hard policy does not override chosen full-member round");
  const ht=hb.workspace_tasks.find(t=>t.key==="floor"&&t.assignee_id===hardRoom.member_id&&t.status==="pending");
  assert(ht);
  check(!!ht.deadline_at,"hard full-member round has a persisted deadline");
  const early=await h.request(`/chores/tasks/${ht.id}/complete`,{token:hardRoom.access_token,method:"PATCH",data:{}});
  check(early.status===422&&(await early.json()).detail.code==="task_not_started","execution time is enforced only for new hard tasks");
  const changeTime=await h.request("/chores/settings",{token:hardRoom.access_token,method:"PATCH",data:{version:hb.version,categories:hb.categories,configuration:{...hardConfig,tasks:[{...hardConfig.tasks[0],execution_time:"08:00"}]}}});
  check(changeTime.ok,"hard time update keeps chosen round");
  const hardRoundPeerBoard=await board(hardRoom,hardRoundPeer.access_token,hardRoundPeer.member.user_id);
  check(hardRoundPeerBoard.workspace_tasks.find(t=>t.id===ht.id)?.can_complete===true,"hard self-round task permits cover after its execution time");
  const hardRoundCover=await h.request(`/chores/tasks/${ht.id}/complete`,{token:hardRoundPeer.access_token,method:"PATCH",data:{}});
  check(hardRoundCover.ok,"hard self-round permits an authorized cover after its execution time");
  const hardRoundRow=h.db.sqlite.prepare("SELECT assignee_id,completed_by FROM chore_tasks WHERE id=?").get(ht.id);
  check(hardRoundRow.assignee_id===hardRoom.member_id&&hardRoundRow.completed_by===hardRoundPeer.member.user_id,"hard round cover records the actual completer without changing the planned owner");
  const hardRoundUndoBoard=await board(hardRoom,hardRoundPeer.access_token,hardRoundPeer.member.user_id);
  check(hardRoundUndoBoard.undo_tasks.some(t=>t.id===ht.id),"hard round cover receives the matching undo entry");
  const hardOwnerUndo=await h.request(`/chores/tasks/${ht.id}/undo`,{token:hardRoom.access_token,method:"PATCH",data:{}});
  check(hardOwnerUndo.status===403,"hard round planned owner cannot undo another member's cover");
  check((await h.request(`/chores/tasks/${ht.id}/undo`,{token:hardRoundPeer.access_token,method:"PATCH",data:{}})).ok,"hard round cover can undo their own completion");

  const hardCompletionConfig={...config,policy:"hard",tasks:config.tasks.map(t=>t.key==="floor"?{...t,page:"duty",rotation:"completion",execution_time:"08:00"}:t)};
  const hardCompletionRoom=await create("硬性交接权限",hardCompletionConfig);
  const hardCompletionPeer=await (await joinRoom(hardCompletionRoom.invite_code,"交接室友")).json();
  await verifyEmail("third-member@example.invalid");
  const hardCompletionThird=await (await joinRoom(hardCompletionRoom.invite_code,"代做室友")).json();
  const hardCompletionBoard=await board(hardCompletionRoom);
  const hardCompletionTask=hardCompletionBoard.workspace_tasks.find(t=>t.key==="floor"&&t.assignee_id===hardCompletionRoom.member_id&&t.status==="pending");
  assert(hardCompletionTask);
  const hardCompletionPeerBoard=await board(hardCompletionRoom,hardCompletionThird.access_token,hardCompletionThird.member.user_id);
  check(hardCompletionPeerBoard.workspace_tasks.find(t=>t.id===hardCompletionTask.id)?.can_complete===true,"hard completion turn allows a cover only under the explicit hard policy");
  const hardCompletionCover=await h.request(`/chores/tasks/${hardCompletionTask.id}/complete`,{token:hardCompletionThird.access_token,method:"PATCH",data:{}});
  check(hardCompletionCover.ok,"hard completion turn accepts a permitted cover");
  const hardCompletionReceipt=await hardCompletionCover.clone().json();
  const hardCompletionRow=h.db.sqlite.prepare("SELECT assignee_id,completed_by,assignee_name_snapshot FROM chore_tasks WHERE id=?").get(hardCompletionTask.id);
  check(hardCompletionRow.assignee_id===hardCompletionRoom.member_id&&hardCompletionRow.completed_by===hardCompletionThird.member.user_id&&hardCompletionRow.assignee_name_snapshot==="代做室友","handoff preserves the assigned owner and snapshots the actual completer");
  check(hardCompletionReceipt.task.status==="completed"&&hardCompletionReceipt.task.assignee_id===hardCompletionRow.assignee_id&&hardCompletionReceipt.task.completed_by===hardCompletionRow.completed_by,"delegated completion receipt matches persisted planned owner and actual completer");
  const hardCompletionNext=h.db.sqlite.prepare("SELECT sequence,assignee_id FROM chore_tasks WHERE dorm_id=? AND key='floor' AND status='pending' ORDER BY sequence").all(hardCompletionRoom.dorm.id);
  check(hardCompletionNext.length===1&&hardCompletionNext[0].sequence===2&&hardCompletionNext[0].assignee_id===hardCompletionPeer.member.user_id,"completion handoff follows configured rotation instead of advancing to the arbitrary cover");
  const hardCompletionThirdBoard=await board(hardCompletionRoom,hardCompletionThird.access_token,hardCompletionThird.member.user_id);
  const hardCompletionUndoView=hardCompletionThirdBoard.undo_tasks.find(t=>t.id===hardCompletionTask.id);
  check(hardCompletionUndoView?.status==="completed"&&hardCompletionUndoView.assignee_id===hardCompletionRow.assignee_id&&hardCompletionUndoView.completed_by===hardCompletionRow.completed_by,"delegated completion receipt agrees with the next board GET");
  const hardCompletionHistory=hardCompletionThirdBoard.calendar.find(r=>r.id===hardCompletionTask.id);
  check(hardCompletionHistory?.assignee_id===hardCompletionThird.member.user_id&&hardCompletionHistory?.assignee_name==="代做室友","handoff history credits the actual completer");
  check(hardCompletionThirdBoard.undo_tasks.some(t=>t.id===hardCompletionTask.id),"hard completion cover receives its undo entry");
  const hardCompletionOwnerUndo=await h.request(`/chores/tasks/${hardCompletionTask.id}/undo`,{token:hardCompletionRoom.access_token,method:"PATCH",data:{}});
  check(hardCompletionOwnerUndo.status===403,"completion turn owner cannot undo another member's cover");
  const hardCompletionUndo=await h.request(`/chores/tasks/${hardCompletionTask.id}/undo`,{token:hardCompletionThird.access_token,method:"PATCH",data:{}});
  check(hardCompletionUndo.ok,"completion cover can undo and restore the original planned turn");
  const hardCompletionUndoReceipt=await hardCompletionUndo.clone().json();
  const hardCompletionUndoRow=h.db.sqlite.prepare("SELECT status,assignee_id,completed_by FROM chore_tasks WHERE id=?").get(hardCompletionTask.id);
  check(hardCompletionUndoReceipt.task.status===hardCompletionUndoRow.status&&hardCompletionUndoReceipt.task.assignee_id===hardCompletionUndoRow.assignee_id&&hardCompletionUndoReceipt.task.completed_by===hardCompletionUndoRow.completed_by&&hardCompletionUndoReceipt.task.status==="pending"&&hardCompletionUndoReceipt.task.completed_by===null,"delegate-undo receipt clears the actual completer and matches the database row");
  const hardCompletionRestoredBoard=await board(hardCompletionRoom,hardCompletionThird.access_token,hardCompletionThird.member.user_id);
  const hardCompletionRestoredView=hardCompletionRestoredBoard.workspace_tasks.find(t=>t.id===hardCompletionTask.id)||hardCompletionRestoredBoard.today_tasks.find(t=>t.id===hardCompletionTask.id);
  check(hardCompletionRestoredView?.status===hardCompletionUndoRow.status&&hardCompletionRestoredView.assignee_id===hardCompletionUndoRow.assignee_id&&hardCompletionRestoredView.completed_by===hardCompletionUndoRow.completed_by,"delegate-undo receipt agrees with the next board GET");
  const hardCompletionRestored=h.db.sqlite.prepare("SELECT sequence,assignee_id FROM chore_tasks WHERE dorm_id=? AND key='floor' AND status='pending' ORDER BY sequence").all(hardCompletionRoom.dorm.id);
  check(hardCompletionRestored.length===1&&hardCompletionRestored[0].sequence===1&&hardCompletionRestored[0].assignee_id===hardCompletionRoom.member_id,"undo restores the planned completion owner without changing the rotation order");

  const hardWaterConfig={...config,policy:"hard",tasks:config.tasks.map(t=>t.key==="water"?{...t,enabled:true,page:"duty",rotation:"rotation",execution_time:"08:00",deadline:"22:00"}:{...t,enabled:false})};
  const hardWaterRoom=await create("硬性抬水权限",hardWaterConfig);
  await verifyEmail("water-cover@example.invalid");
  const hardWaterPeer=await (await joinRoom(hardWaterRoom.invite_code,"抬水代做室友")).json();
  const waterSnapshot=(dormId,taskId)=>({
    version:h.db.sqlite.prepare("SELECT version FROM chore_settings WHERE dorm_id=?").get(dormId).version,
    task:h.db.sqlite.prepare("SELECT id,status,sequence,assignee_id,completed_by,completed_at FROM chore_tasks WHERE id=?").get(taskId),
    pending:h.db.sqlite.prepare("SELECT id,sequence,assignee_id,status FROM chore_tasks WHERE dorm_id=? AND key='water' AND status IN ('pending','completed') ORDER BY sequence,id").all(dormId),
    credits:h.db.sqlite.prepare("SELECT user_id,task_id,status,consumed_by FROM chore_water_credits WHERE dorm_id=? ORDER BY id").all(dormId),
    flow:h.db.sqlite.prepare("SELECT queue,handoff,undo_state FROM chore_water_flow WHERE dorm_id=?").get(dormId)||null,
    sideEffects:sideEffects(dormId),
  });
  const hardWaterBoard=await board(hardWaterRoom);
  const hardWaterTask=hardWaterBoard.water_task;
  assert(hardWaterTask?.status==="pending");
  const hardWaterPeerBoard=await board(hardWaterRoom,hardWaterPeer.access_token,hardWaterPeer.member.user_id);
  check(hardWaterPeerBoard.water_task?.can_complete===true,"hard v2 water turn exposes controlled cover after the configured execution time");
  const hardWaterCover=await h.request(`/chores/tasks/${hardWaterTask.id}/complete`,{token:hardWaterPeer.access_token,method:"PATCH",data:{}});
  check(hardWaterCover.ok,"hard v2 water turn accepts a permitted cover through the completion API");
  const hardWaterReceipt=await hardWaterCover.clone().json();
  const hardWaterRow=h.db.sqlite.prepare("SELECT status,assignee_id,completed_by FROM chore_tasks WHERE id=?").get(hardWaterTask.id);
  check(hardWaterReceipt.task.status===hardWaterRow.status&&hardWaterReceipt.task.assignee_id===hardWaterRow.assignee_id&&hardWaterReceipt.task.completed_by===hardWaterRow.completed_by&&hardWaterRow.assignee_id===hardWaterRoom.member_id&&hardWaterRow.completed_by===hardWaterPeer.member.user_id,"hard water cover receipt preserves planned owner and reports the actual completer");
  const hardWaterOrder=hardWaterBoard.categories.find(c=>c.key==="water").rotation_order;
  const plannedNext=hardWaterOrder[(hardWaterOrder.indexOf(hardWaterTask.assignee_id)+1)%hardWaterOrder.length];
  check(hardWaterReceipt.next_water?.assignee_id===plannedNext,"hard water cover advances the configured queue, not the cover identity");
  const hardWaterUndo=await h.request(`/chores/tasks/${hardWaterTask.id}/undo`,{token:hardWaterPeer.access_token,method:"PATCH",data:{}});
  check(hardWaterUndo.ok,"actual water cover can undo its own completion");
  const hardWaterUndoReceipt=await hardWaterUndo.clone().json();
  const hardWaterUndoRow=h.db.sqlite.prepare("SELECT status,assignee_id,completed_by FROM chore_tasks WHERE id=?").get(hardWaterTask.id);
  check(hardWaterUndoReceipt.task.status===hardWaterUndoRow.status&&hardWaterUndoReceipt.task.assignee_id===hardWaterUndoRow.assignee_id&&hardWaterUndoReceipt.task.completed_by===hardWaterUndoRow.completed_by&&hardWaterUndoRow.status==="pending"&&hardWaterUndoRow.completed_by===null,"hard water undo receipt matches the restored persisted row");
  const hardWaterRestored=await board(hardWaterRoom,hardWaterPeer.access_token,hardWaterPeer.member.user_id);
  check(hardWaterRestored.water_task?.id===hardWaterTask.id&&hardWaterRestored.water_task.assignee_id===hardWaterUndoRow.assignee_id&&hardWaterRestored.water_task.status===hardWaterUndoRow.status&&hardWaterRestored.water_task.completed_by===null,"hard water undo restores the same planned turn on the next board GET");
  const beforeAdvanceEffects=sideEffects(hardWaterRoom.dorm.id);
  const hardWaterAdvance=await h.request("/chores/water/advance",{token:hardWaterPeer.access_token,method:"POST",data:{version:hardWaterRestored.version,task_id:hardWaterRestored.water_task.id}});
  check(hardWaterAdvance.ok,"a non-current member may record an early water credit under the existing rule");
  const hardWaterAdvanceReceipt=await hardWaterAdvance.clone().json();
  const creditRow=h.db.sqlite.prepare("SELECT user_id,task_id,status,consumed_by FROM chore_water_credits WHERE dorm_id=?").get(hardWaterRoom.dorm.id);
  check(creditRow.user_id===hardWaterPeer.member.user_id&&creditRow.task_id===hardWaterAdvanceReceipt.task.id&&creditRow.status==="pending"&&creditRow.consumed_by===null,"early water action persists one pending credit for its actor");
  check(JSON.stringify(sideEffects(hardWaterRoom.dorm.id))===JSON.stringify(beforeAdvanceEffects),"early water credit does not send reminders or queue notifications");
  const hardWaterCreditUndo=await h.request(`/chores/tasks/${creditRow.task_id}/undo`,{token:hardWaterPeer.access_token,method:"PATCH",data:{}});
  check(hardWaterCreditUndo.ok,"unused early water credit can be withdrawn by its creator");
  const cancelledCredit=h.db.sqlite.prepare("SELECT status,consumed_by FROM chore_water_credits WHERE task_id=?").get(creditRow.task_id);
  check(cancelledCredit.status==="cancelled"&&cancelledCredit.consumed_by===null,"withdrawing early water marks only the unused credit cancelled");
  const waterAfterCreditUndo=await board(hardWaterRoom,hardWaterPeer.access_token,hardWaterPeer.member.user_id);
  check(waterAfterCreditUndo.water_task?.id===hardWaterTask.id&&waterAfterCreditUndo.water_task.status==="pending"&&waterAfterCreditUndo.water_task.assignee_id===hardWaterRoom.member_id,"withdrawing early water credit leaves the planned queue unchanged");
  check(JSON.stringify(sideEffects(hardWaterRoom.dorm.id))===JSON.stringify(beforeAdvanceEffects),"early credit undo does not enqueue reminder or push side effects");

  const softWaterConfig={...hardWaterConfig,policy:"soft",tasks:hardWaterConfig.tasks.map(t=>t.key==="water"?{...t,policy:"soft"}:t)};
  const softWaterRoom=await create("软性抬水权限",softWaterConfig);
  await verifyEmail("soft-water-peer@example.invalid");
  const softWaterPeer=await (await joinRoom(softWaterRoom.invite_code,"软性抬水室友")).json();
  const softWaterBoard=await board(softWaterRoom);
  const softWaterTask=softWaterBoard.water_task;
  assert(softWaterTask?.status==="pending");
  const softWaterPeerBoard=await board(softWaterRoom,softWaterPeer.access_token,softWaterPeer.member.user_id);
  check(softWaterPeerBoard.water_task?.can_complete===false,"soft v2 water turn is not exposed as completable to a different member");
  const softWaterBefore=waterSnapshot(softWaterRoom.dorm.id,softWaterTask.id);
  const softWaterAttempt=await h.request(`/chores/tasks/${softWaterTask.id}/complete`,{token:softWaterPeer.access_token,method:"PATCH",data:{}});
  check(softWaterAttempt.status===403,"soft v2 water turn rejects a different member at the service boundary");
  const softWaterAfter=waterSnapshot(softWaterRoom.dorm.id,softWaterTask.id);
  check(JSON.stringify(softWaterAfter)===JSON.stringify(softWaterBefore),"denied soft water completion preserves version, queue, credits, history and notification state");
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
