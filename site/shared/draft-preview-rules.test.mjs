import assert from 'node:assert/strict';
import { configuredTaskMode, configuredTaskPolicy, canCompleteTaskWithRules } from './dorm-configuration.mjs';
import { createDraftPreviewModel } from '../../frontend/src/components/onboarding/draftPreviewBoard.ts';

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const modeCases = [['water', 'round', 'completion'], ['floor', 'round', 'self_round'], ['floor', 'rotation', 'scheduled'], ['floor', 'completion', 'completion'], ['task_' + '1'.repeat(32), 'completion', 'completion']];
for (const [key, rotation, expected] of modeCases) check(configuredTaskMode({key,rotation}) === expected, 'configured mode matches existing mapping');
for (const policy of ['soft','hard']) for (const override of [undefined,'inherit','soft','hard']) {
  const task = { policy:override, execution_time:'09:30' };
  check(configuredTaskPolicy(task,{policy}).hard === ((override && override !== 'inherit' ? override : policy) === 'hard'), 'policy override matches existing rule');
}
function previousRule(task, category, who, today, nowIso) {
  if (!task || !who || who.is_demo || !category?.enabled || task.status !== 'pending' || task.duty_date > today ||
      (who.user_id !== task.assignee_id && !(category?.version2 === true && category?.hardPolicy === true))) return false;
  return !category.hardPolicy || nowIso >= new Date(`${task.duty_date}T${category.executionTime}:00+08:00`).toISOString();
}
for (const version2 of [undefined,false,true]) for (const hardPolicy of [undefined,false,true])
for (const enabled of [false,true]) for (const is_demo of [false,true]) for (const user_id of [1,2])
for (const status of ['pending','completed','cancelled']) for (const duty_date of ['2026-10-26','2026-10-27','2026-10-28'])
for (const time of ['00:59:59','01:00:00','01:00:01']) {
  const task={assignee_id:1,status,duty_date},category={version2,hardPolicy,enabled,executionTime:'09:00'},who={user_id,is_demo};
  const nowIso=`2026-10-27T${time}.000Z`;
  assert.equal(canCompleteTaskWithRules(task,category,who,'2026-10-27',nowIso),previousRule(task,category,who,'2026-10-27',nowIso)); checks++;
}
const task = (key,rotation='round',policy='inherit') => ({key,rotation,policy,name:key,content:'',page:key==='water'?'water':'duty',enabled:true,display:'title',deadline:'22:00',execution_time:'09:00',interval:3});
const draft={schema_version:2,name:'合成草稿',nickname:'甲',members:[],policy:'soft',pages:[{id:'duty',label:'值日'},{id:'water',label:'第二页'},{id:'calendar',label:'日历'}],tasks:[task('floor'),task('toilet','rotation'),task('sink','completion'),task('water')]};
const build=createDraftPreviewModel(),now=new Date('2026-10-27T02:00:00Z');
for (const policy of ['soft','hard']) {
  draft.policy=policy;
  for (const instant of [new Date('2026-10-27T00:59:59Z'),now]) {
    const board=build(draft,instant);
    for (const category of board.categories) {
      const source=draft.tasks.find(t=>t.key===category.key),rules=configuredTaskPolicy(source,draft);
      const tasks=board.workspace_tasks.filter(t=>t.key===source.key);
      check(tasks.length===(category.mode==='self_round'?3:1),'only self rounds generate all members current tasks');
      for (const t of tasks) {
        check(t.can_complete===canCompleteTaskWithRules(t,{enabled:true,version2:true,hardPolicy:rules.hard,executionTime:rules.executionTime},board.member,board.today,board.server_time),'preview permission uses actual rule');
        check(Boolean(t.deadline_at)===(rules.hard || category.mode==='scheduled'),'preview deadline visibility matches taskView');
      }
    }
    for (const round of board.rounds) {
      const done=board.workspace_tasks.filter(t=>t.key===round.key&&t.status==='completed');
      check(round.completed===done.length && round.completions.length===done.length,'round count derived from actual synthetic tasks');
      for (const member of round.members) check(member.completed===done.some(t=>t.assignee_id===member.user_id),'round member status consistent');
      for (const t of done) check(board.calendar.some(r=>r.id===t.id&&r.completed_at===t.completed_at),'same completion shown in calendar');
    }
    check(board.next_tasks.length===0,'current tasks not falsely presented as future assignments');
    check(board.workspace_tasks.every(t=>t.id<0)&&board.members.every(m=>m.user_id<0),'no live identifiers');
    check(new Set(board.calendar.map(r=>r.id)).size===board.calendar.length,'history identifiers are unique');
  }
}
const before=build(draft,now),beforeJSON=JSON.stringify(before);
draft.tasks[0].name='改名';draft.nickname='乙';draft.tasks.reverse();draft.tasks.find(t=>t.key==='water').enabled=false;
const after=build(draft,now);
check(after.member.nickname==='乙','preview reflects edited identity');
for (const t of after.workspace_tasks) check(before.workspace_tasks.some(old=>old.id===t.id&&old.key===t.key&&old.assignee_id===t.assignee_id),'task IDs remain stable after rename, reorder and disabled tasks');
check(JSON.stringify(before)===beforeJSON,'rebuilding or editing draft cannot mutate a previous snapshot');
check(JSON.stringify(draft).includes('改名'),'adapter does not mutate or discard draft changes');
console.log(JSON.stringify({status:'passed',checks,scope:'pure synthetic policy and preview data, no network or database'}));
