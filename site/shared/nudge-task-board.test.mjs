import assert from 'node:assert/strict';
import { createHarness } from '../scripts/check-cloud-backend.mjs';
const h=await createHarness();let checks=0;
const check=(v,label)=>{assert.ok(v,label);checks++;};
try{
 const room=await(await h.request('/guest/create',{method:'POST',data:{name:'催促隔离样本',nickname:'甲',members:['乙','丙']}})).json();
 const peer=await(await h.request('/chores/claim',{method:'POST',data:{invite_code:room.invite_code,nickname:'乙'}})).json();
 const url=`/chores/board?invite_code=${room.invite_code}&member_id=${peer.member.user_id}`;
 const board=await(await h.request(url,{token:peer.access_token})).json();
 check(!board.configuration&&board.workspace_tasks.length===0,'legacy configuration and workspace contract unchanged');
 check(['floor','toilet','sink','water'].every(key=>board.nudge_tasks.some(t=>t.key===key)),'all enabled current task categories are available');
 check(board.nudge_tasks.every(t=>t.duty_date<=board.today),'future scheduled assignments not exposed as current nudge targets');
 const task=board.nudge_tasks.find(t=>t.key==='floor'&&t.assignee_id!==peer.member.user_id&&t.status==='pending');assert(task);
 const send=()=>h.request('/chores/remind',{token:peer.access_token,method:'POST',data:{task_id:task.id,target_member_id:task.assignee_id}});
 check((await send()).ok,'existing endpoint accepts another current task');
 check((await send()).status===429,'existing server cooldown still rejects repeated nudge');
 check(h.db.sqlite.prepare('SELECT COUNT(*) AS n FROM chore_reminders WHERE dorm_id=? AND task_id=?').get(room.dorm.id,task.id).n===1,'rapid retry stores exactly one notification');
 const wrong=await h.request('/chores/remind',{token:peer.access_token,method:'POST',data:{task_id:task.id,target_member_id:peer.member.user_id}});
 check(wrong.status===422,'wrong assignee cannot be targeted');
 const before=JSON.stringify(h.db.sqlite.prepare('SELECT * FROM chore_tasks WHERE dorm_id=? ORDER BY id').all(room.dorm.id));
 await h.request(url,{token:peer.access_token});
 check(JSON.stringify(h.db.sqlite.prepare('SELECT * FROM chore_tasks WHERE dorm_id=? ORDER BY id').all(room.dorm.id))===before,'subsequent nudge board reads do not change tasks');
 const other=await(await h.request('/guest/create',{method:'POST',data:{name:'另外宿舍',nickname:'丁',members:['戊']}})).json();
 const rejected=await h.request('/chores/remind',{token:other.access_token,method:'POST',data:{task_id:task.id,target_member_id:task.assignee_id}});
 check(rejected.status===403||rejected.status===404,'cross-dorm nudge remains forbidden');
 console.log(JSON.stringify({status:'passed',checks,scope:'temporary SQLite and synthetic identities; no real mail or push'}));
}finally{h.close();}
