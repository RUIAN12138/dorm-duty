// Only creates and writes an explicitly named disposable acceptance dorm.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.argv[2]||'https://8.148.190.114';
const base=origin.replace(/\/$/,'')+'/dorm-duty';
const fixturePath=new URL('../data/rounds-public-fixture.json',import.meta.url);
let assertions=0;
const equal=(a,b,message)=>{assertions++;assert.deepEqual(a,b,message);};
async function api(route,{status=200,token,method='GET',data}={}) {
 const res=await fetch(base+route,{method,signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data)});
 equal(res.status,status,route.split('?')[0]+' status');return res.json();
}
let fixture;
const board=p=>api(`/chores/board?invite_code=${fixture.invite}&member_id=${p.id}`,{token:p.token});
const complete=(p,t,status=200)=>api(`/chores/tasks/${t.id}/complete`,{method:'PATCH',token:p.token,status,data:{}});
const task=(b,key)=>b.today_tasks.find(t=>t.key===key), round=(b,key)=>b.rounds.find(r=>r.key===key);
if(process.argv[3]==='verify') fixture=JSON.parse(await fs.readFile(fixturePath,'utf8'));
else {
 const created=await api('/guest/create',{method:'POST',status:201,data:{name:'自由轮次云端验收_'+Date.now(),nickname:'验收小林',members:['验收小陈','验收小王','验收小李','验收小刘','验收小赵']}});
 fixture={invite:created.invite_code,dormId:created.dorm.id,people:[{id:created.member_id,token:created.access_token}]};
 for(const member of created.dorm.members.filter(m=>m.user_id!==created.member_id)){
  const claim=await api('/chores/claim',{method:'POST',status:201,data:{invite_code:fixture.invite,member_id:member.user_id}});
  fixture.people.push({id:member.user_id,token:claim.access_token});
 }
 const boards=await Promise.all(fixture.people.map(board));
 for(const b of boards){equal(b.categories.map(c=>c.mode),['self_round','self_round','self_round','completion']);equal(b.rounds.map(r=>[r.sequence,r.completed,r.total]),[[1,0,6],[1,0,6],[1,0,6]]);equal(b.next_tasks,[]);}
 const oldFloor=boards.map(b=>task(b,'floor'));
 await complete(fixture.people[0],oldFloor[1],403);
 const finished=await Promise.all(fixture.people.map((p,i)=>complete(p,oldFloor[i])));
 await complete(fixture.people[0],oldFloor[0],409);
 const toilet=await complete(fixture.people[0],task(boards[0],'toilet'));
 const sink=await Promise.all(fixture.people.map((p,i)=>complete(p,task(boards[i],'sink'))));
 const water=await complete(fixture.people[0],boards[0].water_task);
 fixture.completed=[...finished.map(r=>r.task),toilet.task,...sink.map(r=>r.task),water.task].map(t=>({id:t.id,completed_at:t.completed_at}));
 await fs.writeFile(fixturePath,JSON.stringify(fixture),{mode:0o600});
}
for(const p of fixture.people){
 const b=await board(p);
 equal(round(b,'floor').sequence,2);equal(round(b,'floor').completed,0);equal(round(b,'floor').total,6);
 equal(round(b,'toilet').sequence,1);equal(round(b,'toilet').completed,1);
 equal(round(b,'sink').sequence,2);equal(round(b,'sink').completed,0);equal(round(b,'sink').total,6);
 equal(b.water_task.assignee_id,fixture.people[1].id);equal(b.water_task.sequence,2);equal(b.water_task.deadline_at,'');
 for(const t of fixture.completed)equal(b.calendar.find(r=>r.id===t.id)?.completed_at,t.completed_at,'calendar must preserve server timestamps');
}
const report={date:new Date().toISOString(),status:'passed',origin,runtime:'remote node-server',assertions,phase:process.argv[3]==='verify'?'after-service-restart':'created-and-completed',dormId:fixture.dormId,checks:['six simultaneous completions create exactly one next floor round','six simultaneous washbasin completions create exactly one independent next round','toilet remains in round one','duplicate and wrong-person completion rejected','water advances only on completion','every member sees identical round state and immutable history']};
await fs.mkdir(new URL('../docs/evidence/voluntary-rounds/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../docs/evidence/voluntary-rounds/'+(process.argv[3]==='verify'?'public-restart.json':'public-rounds.json'),import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
