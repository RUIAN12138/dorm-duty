import assert from 'node:assert/strict';
import {createHarness} from './check-cloud-backend.mjs';
import {companionContext,companionFactReply} from '../../scripts/companion-ai.mjs';
import {createEmailRuntime} from '../local/email-runtime.mjs';
import {handleApi} from '../worker/backend.mjs';
import {createDraftPreviewModel} from '../../frontend/src/components/onboarding/draftPreviewBoard.ts';
import {createDraftSandbox} from '../../frontend/src/components/onboarding/sandbox/draftSandbox.mjs';
const h = await createHarness();
const sent=[];const mail=createEmailRuntime(h.db,{config:{host:'smtp.invalid',port:465,user:'test@example.invalid',password:'fixture-only',from:'test@example.invalid',publicOrigin:'https://backend-test.example',otpSecret:'b'.repeat(64)},autoStart:false,send:async(m)=>sent.push(m)});
async function join(room,nickname,email){let cookie='';const call=async(path,data)=>{const r=await mail.wrap(new Request('https://backend-test.example'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Dorm-Email':'1',Origin:'https://backend-test.example',Cookie:cookie,'X-Dorm-Client':'preview-fixture'},body:JSON.stringify(data)}),(request,emailCreator)=>handleApi(request,{...h.env,EMAIL_CREATOR:emailCreator}));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r};const challenge=await (await call('/email/code',{email})).json();const code=sent.at(-1).text.match(/验证码是：(\d{6})/)[1];assert((await call('/email/verify',{email,code,challenge_id:challenge.challenge_id,mail_enabled:false})).ok);return call('/chores/claim',{invite_code:room.invite_code,nickname})}

const pages=[{id:'duty',label:'值日'},{id:'water',label:'催促'},{id:'calendar',label:'日历'}];
const task=(key,page)=>({key,name:key==='water'?'抬水':'地板',content:'任务内容',enabled:true,page,rotation:key==='water'?'completion':'round',display:'title',deadline:'22:00',interval:3});
const configuration=(page)=>({schema_version:2,policy:'soft',pages,second_page_kind:'tasks',tasks:[task('floor','duty'),task('water',page)]});
async function create(name,config){const r=await h.request('/guest/create',{method:'POST',data:{name,nickname:'甲',members:[],...(config?{configuration:config}:{})}});assert.equal(r.status,201,await r.clone().text());return r.json()}
async function board(room){const r=await h.request(`/chores/board?invite_code=${room.invite_code}&member_id=${room.member_id}`,{token:room.access_token});assert.equal(r.status,200,await r.clone().text());return r.json()}
const hasWater=b=>b.today_tasks.some(t=>t.key==='water');
try{
 const legacy=await create('旧宿舍');const oldBoard=await board(legacy);assert.equal(hasWater(oldBoard),false);
 const snapshot=()=>Object.fromEntries(['dormitories','chore_settings','chore_categories','chore_tasks','chore_reminders'].map(table=>[table,h.db.sqlite.prepare(`SELECT * FROM ${table} WHERE ${table==='dormitories'?'id':'dorm_id'}=? ORDER BY rowid`).all(legacy.dorm.id)]));
 const old=JSON.stringify(snapshot());
 for(const page of ['duty','water']){
  const config=configuration(page),room=await create(`新版${page}`,config);
  for(const [i,nickname] of ['室友二','室友三'].entries()) { const joined=await join(room,nickname,`${page}-${i}@example.invalid`);assert.equal(joined.status,201,await joined.clone().text()); }
  const live=await board(room);
  const draft={...config,name:'预览',nickname:'甲',members:[]};const input=createDraftPreviewModel()(draft);const sandbox=createDraftSandbox(input);const local=sandbox.snapshot();
  assert.equal(hasWater(live),page==='duty',`live ${page}`);
  assert.equal(hasWater(input),page==='duty',`preview initial ${page}`);
  assert.equal(hasWater(local),page==='duty',`preview refreshed ${page}`);
  assert.equal(live.water_task.assignee_id,room.member_id);assert.equal(local.water_task.assignee_id,-1);
  assert.equal(live.water_task.can_complete,local.water_task.can_complete);
  const context=companionContext(live,{recent_records:[],last_completed:[]},new Date());
  assert.equal(context.personal_tasks.some(item=>item.key==='water'),false);
  assert.equal((companionFactReply('我的任务是什么',context).messages.join('').match(/抬水/g)||[]).length,1);
  const finished=await h.request(`/chores/tasks/${live.water_task.id}/complete`,{method:'PATCH',token:room.access_token,data:{}});assert.equal(finished.status,200,await finished.clone().text());
  sandbox.complete(local.water_task);
  const liveAfter=await board(room),previewAfter=sandbox.snapshot();
  assert.equal(liveAfter.water_task.assignee_name,previewAfter.water_task.assignee_name);
  assert.equal(hasWater(liveAfter),hasWater(previewAfter));
  const undone=await h.request(`/chores/tasks/${live.water_task.id}/undo`,{method:'PATCH',token:room.access_token,data:{}});assert.equal(undone.status,200,await undone.clone().text());
  sandbox.undo(local.water_task.id);
  assert.equal(hasWater(await board(room)),hasWater(sandbox.snapshot()));
 }
 assert.equal(JSON.stringify(snapshot()),old);
 console.log('PASS: live, preview and sandbox agree on water placement; legacy five-table snapshot preserved');
} finally {await mail.close();h.close()}
