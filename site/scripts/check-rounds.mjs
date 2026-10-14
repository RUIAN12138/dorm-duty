import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHarness, SQLiteD1 } from './check-cloud-backend.mjs';
const OriginalDate = Date;
let clock = new OriginalDate('2026-10-14T03:00:00Z').getTime();
let assertions = 0;
const equal = (a,b,message) => { assertions++; assert.deepEqual(a,b,message); };
const ok = (value,message) => { assertions++; assert(value,message); };
async function api(h, route, {status=200,...options}={}) {
  const res = await h.request(route,options);
  equal(res.status,status,`${route.split('?')[0]} status`);
  return res.json();
}
async function room(h, names=['小林','小陈','小王']) {
  const r = await api(h,'/guest/create',{method:'POST',status:201,data:{name:'独立轮次验收',nickname:names[0],members:names.slice(1)}});
  r.owner={user_id:r.member_id,token:r.access_token};
  r.people=[r.owner];
  for (const m of r.dorm.members.filter(m=>m.user_id!==r.member_id)) {
    const claim=await api(h,'/chores/claim',{method:'POST',status:201,data:{invite_code:r.invite_code,member_id:m.user_id}});
    r.people.push({...claim.member,token:claim.access_token});
  }
  return r;
}
const board=(h,r,p=r.owner)=>api(h,`/chores/board?invite_code=${r.invite_code}&member_id=${p.user_id}`,{token:p.token});
const task=(b,key)=>b.today_tasks.find(t=>t.key===key);
const round=(b,key)=>b.rounds.find(t=>t.key===key);
const complete=(h,p,t,status=200)=>api(h,`/chores/tasks/${t.id}/complete`,{method:'PATCH',token:p.token,data:{},status});
const configure=async(h,r,changes)=>{
  const b=await board(h,r);
  return api(h,'/chores/settings',{method:'PATCH',token:r.owner.token,data:{version:b.version,categories:changes}});
};
const tests=[];
const test=(name,run)=>tests.push({name,run});
test('unordered voluntary completion, independent categories, cross-day persistence and permissions',async h=>{
  const r=await room(h), b=await board(h,r);
  equal(b.categories.map(c=>c.mode),['self_round','self_round','completion']);
  equal(b.today_tasks.length,2); equal(b.next_tasks,[]);
  equal(b.rounds.map(c=>[c.sequence,c.completed,c.total]),[[1,0,3],[1,0,3]]);
  for (const p of r.people) {
    const v=await board(h,r,p);
    ok(task(v,'floor').can_complete); equal(task(v,'floor').deadline_at,'');
  }
  const last=r.people[2], floor=task(await board(h,r,last),'floor');
  await complete(h,r.people[0],floor,403);
  const done=await complete(h,last,floor); equal(done.task.completed_at,new Date().toISOString());
  await complete(h,last,floor,409);
  const own=await board(h,r,last); equal(task(own,'floor').status,'completed'); equal(task(own,'floor').can_complete,false);
  equal(round(own,'floor').completed,1); equal(round(own,'toilet').completed,0);
  clock+=10*86400000;
  const later=await board(h,r,last); equal(task(later,'floor').id,floor.id); equal(round(later,'floor').sequence,1);
  await complete(h,r.people[0],task(await board(h,r),'toilet'));
  await complete(h,r.people[0],task(await board(h,r),'floor'));
  await complete(h,r.people[1],task(await board(h,r,r.people[1]),'floor'));
  const next=await board(h,r);
  equal(round(next,'floor').sequence,2); equal(round(next,'floor').completed,0);
  equal(round(next,'toilet').sequence,1); equal(round(next,'toilet').completed,1);
  equal(next.calendar.length,4); ok(task(next,'floor').id!==task(b,'floor').id);
});
test('simultaneous final members start exactly one round; duplicate last submission advances once',async h=>{
  const r=await room(h),[a,b,c]=r.people;
  await complete(h,a,task(await board(h,r,a),'floor'));
  const tb=task(await board(h,r,b),'floor'), tc=task(await board(h,r,c),'floor');
  await Promise.all([complete(h,b,tb),complete(h,c,tc)]);
  let v=await board(h,r); equal(round(v,'floor').sequence,2);equal(round(v,'floor').completed,0);equal(v.calendar.length,3);
  equal(h.db.sqlite.prepare("SELECT count(*) AS n FROM chore_tasks WHERE dorm_id=? AND key='floor' AND sequence=2").get(r.dorm.id).n,3);
  await complete(h,a,task(v,'floor')); await complete(h,b,task(await board(h,r,b),'floor'));
  const last=task(await board(h,r,c),'floor');
  const responses=await Promise.all([h.request(`/chores/tasks/${last.id}/complete`,{method:'PATCH',token:c.token}),h.request(`/chores/tasks/${last.id}/complete`,{method:'PATCH',token:c.token})]);
  equal(responses.map(r=>r.status).sort(),[200,409]);
  v=await board(h,r);equal(round(v,'floor').sequence,3);equal(v.calendar.length,6);equal(round(v,'toilet').sequence,1);
});
test('six roommates completing concurrently all succeed and create one shared next round',async h=>{
  const r=await room(h,['小林','小陈','小王','小李','小刘','小赵']);
  const tasks=await Promise.all(r.people.map(async p=>task(await board(h,r,p),'floor')));
  await Promise.all(r.people.map((p,index)=>complete(h,p,tasks[index])));
  const b=await board(h,r);equal(round(b,'floor').sequence,2);equal(round(b,'floor').completed,0);equal(b.calendar.length,6);equal(round(b,'toilet').sequence,1);
});
test('single-member rounds reopen immediately; pauses and content changes preserve progress and snapshots',async h=>{
  const r=await room(h,['小林']),before=await board(h,r), old=task(before,'floor');
  await complete(h,r.owner,old); let b=await board(h,r);equal(round(b,'floor').sequence,2);
  const pending=task(b,'floor');
  await configure(h,r,[{key:'floor',enabled:false,content:'床下也要拖'}]);
  await complete(h,r.owner,pending,409);b=await board(h,r);ok(!task(b,'floor'));
  await configure(h,r,[{key:'floor',enabled:true}]);b=await board(h,r);equal(task(b,'floor').id,pending.id);equal(task(b,'floor').content,'床下也要拖');
  equal(b.calendar[0].id,old.id);
  equal(h.db.sqlite.prepare('SELECT content FROM chore_tasks WHERE id=?').get(old.id).content,old.content);
});
test('joining current round adds a required member; departure preserves history and active-member progress',async h=>{
  const r=await room(h,['小林','小陈']),[owner,other]=r.people;
  await complete(h,owner,task(await board(h,r),'floor'));
  const password='DisposableRoundTest!';
  const joined=await api(h,'/auth/register',{method:'POST',status:201,data:{username:'round_join',nickname:'小王',password}});
  const login=await api(h,'/auth/login',{method:'POST',data:{username:'round_join',password}});
  await api(h,'/dorms/join',{method:'POST',token:login.access_token,data:{invite_code:r.invite_code}});
  let b=await board(h,r);equal(round(b,'floor').total,3);equal(round(b,'floor').completed,1);equal(round(b,'floor').sequence,1);
  const newbie={user_id:joined.id,token:login.access_token};ok(task(await board(h,r,newbie),'floor').can_complete);
  await complete(h,other,task(await board(h,r,other),'floor'));
  b=await board(h,r);equal(round(b,'floor').sequence,1);equal(round(b,'floor').completed,2);
  const legacy=await api(h,'/dorms/current',{token:owner.token});
  await api(h,`/dorms/current/members/${joined.id}?expected_version=${legacy.schedule_version}`,{method:'DELETE',token:owner.token});
  b=await board(h,r);equal(round(b,'floor').sequence,2);equal(round(b,'floor').total,2);equal(b.calendar.length,2);
  equal(h.db.sqlite.prepare("SELECT count(*) AS n FROM chore_tasks WHERE dorm_id=? AND key='floor' AND sequence=1 AND status='pending'").get(r.dorm.id).n,0);
});
test('creator can switch modes while completed records and water sequence remain immutable',async h=>{
  const r=await room(h),b=await board(h,r),old=task(b,'floor');
  await complete(h,r.owner,old);
  await configure(h,r,[{key:'floor',mode:'scheduled'}]);
  let v=await board(h,r);equal(v.categories[0].mode,'scheduled');ok(!round(v,'floor'));ok(v.next_tasks.some(t=>t.key==='floor'));
  await configure(h,r,[{key:'floor',mode:'self_round'}]);
  v=await board(h,r);equal(round(v,'floor').sequence,2);equal(round(v,'floor').completed,0);equal(v.calendar.length,1);
  await complete(h,r.owner,old,409);
  await configure(h,r,[{key:'water',rotation_order:r.people.map(p=>p.user_id).reverse()}]);
  v=await board(h,r);equal(v.water_task.id,b.water_task.id);equal(v.water_task.assignee_id,r.owner.user_id);
  await complete(h,r.people[1],v.water_task,403);
  clock+=20*86400000;v=await board(h,r);equal(v.water_task.sequence,1);equal(v.water_task.deadline_at,'');
  await complete(h,r.owner,v.water_task);v=await board(h,r);equal(v.water_task.assignee_id,r.people[2].user_id);equal(v.water_task.sequence,2);
});
test('round reminders stay private and old completed tasks cannot be reminded',async h=>{
  const r=await room(h),[a,b]=r.people,t=task(await board(h,r,b),'toilet');
  await api(h,'/chores/remind',{method:'POST',status:201,token:a.token,data:{target_member_id:b.user_id,task_id:t.id}});
  equal((await board(h,r,b)).reminders.length,1);equal((await board(h,r,a)).reminders.length,0);
  await complete(h,b,t);
  await api(h,'/chores/remind',{method:'POST',status:409,token:a.token,data:{target_member_id:b.user_id,task_id:t.id}});
});
test('existing completed chore records survive additive upgrade exactly',async()=>{
  const db=new SQLiteD1();
  try {
    for(const name of ['0000_demonic_pixie.sql','0001_far_crusher_hogan.sql']) db.sqlite.exec(await fs.readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));
    db.sqlite.exec(`INSERT INTO users(id,username,password_hash,nickname,created_at) VALUES(1,'upgrade','disabled','旧成员','2026-10-01T00:00Z');
      INSERT INTO dormitories(id,name,invite_code,admin_user_id,rotation_order,rotation_start_date) VALUES(1,'旧宿舍','UPGRADE1',1,'[1]','2026-10-01');
      INSERT INTO chore_settings(dorm_id) VALUES(1);
      INSERT INTO chore_categories(dorm_id,key,name,content,deadline_time,start_date,rotation_order) VALUES(1,'floor','地板','旧内容','22:00','2026-10-01','[1]'),(1,'water','抬水','旧抬水','20:00','2026-10-01','[1]');
      INSERT INTO chore_tasks(dorm_id,key,task_key,name,content,duty_date,assignee_id,assignee_name_snapshot,marker_id_snapshot,deadline_at,status,completed_at) VALUES
      (1,'floor','2026-10-01','地板','完成旧内容','2026-10-01',1,'旧名','pixel-01','2026-10-01T14:00Z','completed','2026-10-01T12:03Z'),
      (1,'floor','2026-10-02','地板','未来旧内容','2026-10-02',1,'旧名','pixel-01','2026-10-02T14:00Z','pending',NULL);`);
    const before=db.sqlite.prepare("SELECT * FROM chore_tasks WHERE status='completed'").all();
    db.sqlite.exec(await fs.readFile(new URL('../drizzle/0002_unknown_galactus.sql',import.meta.url),'utf8'));
    equal(db.sqlite.prepare("SELECT * FROM chore_tasks WHERE status='completed'").all(),before);
    equal(db.sqlite.prepare('SELECT status FROM chore_tasks WHERE id=2').get().status,'cancelled');
    equal(db.sqlite.prepare('SELECT key,mode FROM chore_categories ORDER BY key').all().map(r=>[r.key,r.mode]),[['floor','self_round'],['water','completion']]);
    equal(db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);equal(db.sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{db.close();}
});
globalThis.Date=class extends OriginalDate { constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;} };
const results=[];
try {
  for(const {name,run} of tests) {
    clock=new OriginalDate('2026-10-14T03:00:00Z').getTime(); const before=assertions,h=await createHarness();
    try {await run(h);results.push({name,status:'passed',assertions:assertions-before});}
    catch(error){results.push({name,status:'failed',reason:String(error.message).split('\n')[0]});}
    finally {await h.flush();h.close();}
  }
}finally{globalThis.Date=OriginalDate;}
const report={date:new Date().toISOString(),runtime:process.version,storage:'isolated SQLite',assertions,passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,tests:results};
console.log(JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;
