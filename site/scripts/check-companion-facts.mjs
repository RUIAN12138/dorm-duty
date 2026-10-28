import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHarness } from './check-cloud-backend.mjs';
import { createCompanionRuntime, companionFactReply, companionMisaddresses } from '../../scripts/companion-ai.mjs';
const h=await createHarness();
const created=await(await h.request('/guest/create',{method:'POST',data:{name:'身份事实隔离',nickname:'李豪',members:['国福']}})).json();
const people=created.dorm.members, tokens=[];let time=new Date(), calls=0, upstreamText='国福，今天你需要负责厕所。';
for (const [i,m] of people.entries()) {
 tokens.push((await(await h.request('/chores/claim',{method:'POST',data:{invite_code:created.invite_code,nickname:m.nickname}})).json()).access_token);
 const a=h.db.sqlite.prepare('INSERT INTO email_accounts(email,mail_enabled_at,created_at) VALUES(?,?,?)').run(`facts-${i}@example.invalid`,time.toISOString(),time.toISOString());
 h.db.sqlite.prepare('INSERT INTO email_members(account_id,user_id,dorm_id,bound_at) VALUES(?,?,?,?)').run(a.lastInsertRowid,m.user_id,created.dorm.id,time.toISOString());
}
const checks=[]; const check=(v,label)=>{assert.ok(v,label);checks.push(label)};
const runtime=createCompanionRuntime(h.db,{config:{base_url:'https://api.siliconflow.cn/v1',model:'Qwen/Qwen2.5-7B-Instruct',api_key:'fixture-only'},env:h.env,autoStart:false,now:()=>time,
 dispatch:r=>h.request(new URL(r.url).pathname+new URL(r.url).search,{method:r.method,token:r.headers.get('Authorization')?.slice(7)}),
 fetcher:async(url,options)=>{calls++;const p=JSON.parse(options.body);check(p.messages[0].content.includes('本次认证提问者'),'ordinary chat receives explicit current identity before history');return Response.json({choices:[{message:{content:JSON.stringify({messages:[upstreamText],emotion:'02',reminder:null})}}]})}});
async function chat(text,member=0,request_id=randomUUID(),hint=people[member].user_id){const r=await runtime.route(new Request('https://fixture.invalid/chores/companion/chat',{method:'POST',headers:{Authorization:`Bearer ${tokens[member]}`,'Content-Type':'application/json'},body:JSON.stringify({invite:created.invite_code,member_id:hint,text,request_id})}));return {status:r.status,...await r.json()}}
try {
 let r=await chat('我是谁？');check(r.status===200&&r.messages.join('')==='你是李豪。','identity comes from authenticated member, not another roommate');check(calls===0,'identity question does not ask the model to guess');
 r=await chat('今天做什么？');check(r.status===200&&r.messages.join('').includes('李豪')&&r.messages.join('').includes('本轮待完成')&&!r.messages.join('').includes('国福负责厕所'),'personal tasks describe current round rather than invented daily assignments');
 const board=await(await h.request(`/chores/board?invite_code=${created.invite_code}&member_id=${people[0].user_id}`,{token:tokens[0]})).json();const floor=board.today_tasks.find(t=>t.key==='floor');
 r=await chat('地板谁没做');check(r.status===200&&r.messages.join('').includes('国福')&&calls===0,'live question uses current round without the model');
 const done=await h.request(`/chores/tasks/${floor.id}/complete`,{method:'PATCH',token:tokens[0],data:{}});check(done.ok,'fixture completes a real isolated task');
 r=await chat('我的任务是什么');check(r.messages.join('').includes('地板：本轮已完成'),'next question reads the newly completed state');
 const undo=await h.request(`/chores/tasks/${floor.id}/undo`,{method:'PATCH',token:tokens[0],data:{}});check(undo.ok,'fixture undoes the isolated completion');
 r=await chat('我的任务有哪些');check(r.messages.join('').includes('地板：本轮待完成'),'undo is reflected without clearing chat history');
 time=new Date(time.getTime()+61000);
 r=await chat('😀');check(r.status===200&&r.messages.join('').includes('李豪')&&!r.messages.join('').includes('国福，今天你'),'incorrect model address is replaced with verified personal facts');
 r=await chat('我是谁');check(r.messages.join('')==='你是李豪。','wrong model/old dialogue cannot rename the speaker');
 r=await chat('我是谁',1);check(r.messages.join('')==='你是国福。','another authenticated account gets its own identity');
 r=await chat('我是谁',0,randomUUID(),people[1].user_id);check(r.status===401,'member_id cannot impersonate another roommate');
 time=new Date(time.getTime()+61000);
 const water=board.water_task;
 const expected=people.find(m=>m.user_id===water.assignee_id).nickname;
 r=await chat('抬水轮到谁');check(r.messages.join('').includes(expected),'water reply uses the live water assignee');
 const member=people.findIndex(m=>m.user_id===water.assignee_id);
 const handoff=await h.request(`/chores/tasks/${water.id}/complete`,{method:'PATCH',token:tokens[member],data:{}});check(handoff.ok,'water handoff is exercised through its actual endpoint');
 const after=await(await h.request(`/chores/board?invite_code=${created.invite_code}&member_id=${people[0].user_id}`,{token:tokens[0]})).json();
 r=await chat('现在谁抬水');check(r.messages.join('').includes(after.water_task.assignee_name)&&after.water_task.assignee_id!==water.assignee_id,'next water query reflects the new cursor');
 const context={current_member:{id:1,name:'李豪'},members:[{id:1,name:'李豪'},{id:2,name:'国福'}],personal_tasks:[],water:{current_assignee:null}};
 check(companionFactReply('一分钟后提醒国福抬水',context)===null,'reminder requests retain the original proposal/confirmation flow');
 check(companionMisaddresses(['国福今天完成了地板。'],context)===false,'talking about a roommate is not mistaken for addressing the speaker');
 check(companionFactReply('今天谁完成了地板',context)===null,'other-member history is not fabricated from personal assignments');
 const roundContext={...context,categories:[{key:'floor',name:'地板',enabled:true,mode:'self_round'}],rounds:[{key:'floor',members:[{id:1,name:'李豪',completed:true},{id:2,name:'国福',completed:false}]}]};
 check(companionFactReply('地板谁没做？',roundContext).messages.join('').includes('国福'),'self-round answer uses current pending roster');
 check(!companionFactReply('地板谁没做？',roundContext).messages.join('').includes('李豪'),'completed member is not reported as pending');
 check(companionFactReply('谁负责地板', {...roundContext,rounds:[]}).messages.join('').includes('查不到'),'missing round is not presented as empty');
 check(companionFactReply('我的任务是什么',{...context,personal_tasks:undefined}).messages.join('').includes('无法确认'),'missing personal tasks are not presented as none');
 check(companionFactReply('抬水轮到谁',{...context,water:undefined}).messages.join('').includes('无法确认'),'missing water data is not presented as an empty schedule');
 check(companionFactReply('抬水轮到谁',{...context,water:{available:true,current_assignee:null}}).messages.join('').includes('没有待完成'),'an explicitly empty water schedule remains distinguishable from missing data');
 check(companionFactReply('我的任务是什么',{...context,personal_tasks:[{name:'地板',assignee_id:1,status:undefined}]}).messages.join('').includes('状态暂不可用'),'unknown task status is not guessed as pending');
 check(companionFactReply('你认识我吗',context).messages.join('')==='你是李豪。','natural identity question uses authenticated member');
 check(companionFactReply('提醒国福做地板',roundContext)===null,'task facts do not intercept a reminder action');

 check(h.db.sqlite.prepare('SELECT COUNT(*) AS n FROM chore_reminders').get().n===0,'fact queries never send reminders');
 console.log(JSON.stringify({passed:checks.length,checks,modelCalls:calls,scope:'isolated SQLite and simulated provider; no production/real provider'},null,2));
} finally { await runtime.close(); h.close(); }
