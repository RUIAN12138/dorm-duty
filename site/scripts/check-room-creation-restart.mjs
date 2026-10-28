import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openDatabase,ensureLocalDemo} from '../local/database.mjs';
import {createEmailRuntime} from '../local/email-runtime.mjs';
import {handleApi,EMAIL_GATE_CAPABILITY} from '../worker/backend.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dorm-creation-test-'));
const filename=path.join(dir,'isolated.sqlite'); let db,mail,cookie=''; const sent=[];
const config={schema_version:2,policy:'soft',pages:[{id:'duty',label:'值日'},{id:'water',label:'催促'},{id:'calendar',label:'日历'}],tasks:[{key:'floor',name:'地板',content:'扫地',enabled:true,page:'duty',rotation:'round',display:'title',deadline:'22:00',interval:3}]};
const payload={name:'隔离宿舍',nickname:'创建者',members:[],configuration:config,request_id:'a'.repeat(32)};
async function start(){db=await openDatabase(filename);mail=createEmailRuntime(db,{config:{host:'smtp.invalid',port:465,user:'test@example.invalid',password:'fixture-only',from:'test@example.invalid',publicOrigin:'https://backend-test.example',otpSecret:'b'.repeat(64)},autoStart:false,send:async m=>sent.push(m)});}
async function stop(){await mail.close();db.close();}
async function call(route,data){const request=new Request('https://backend-test.example'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Dorm-Email':'1',Origin:'https://backend-test.example',Cookie:cookie,'X-Dorm-Client':'restart-test'},body:JSON.stringify(data)});const res=await mail.wrap(request,(req,creator)=>handleApi(req,{DB:db,DEFAULT_DORM_INVITE_CODE:'',EMAIL_GATE_VERIFIED:EMAIL_GATE_CAPABILITY,EMAIL_CREATOR:creator}));if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return res;}
try {
 await start();ensureLocalDemo(db);
 const tables=['dormitories','users','dorm_members','chore_settings','chore_categories','chore_tasks','chore_reminders'];
 const snapshot=()=>JSON.stringify(Object.fromEntries(tables.map(t=>[t,db.sqlite.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()])));
 const before=snapshot();
 db.sqlite.exec("DROP TABLE room_creation_requests; DELETE FROM _local_migrations WHERE name='0021_room_creation_requests.sql'");
 await stop();await start();assert.equal(snapshot(),before,'migration preserved existing dorm data');
 assert.equal(db.sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
 const email='owner@example.invalid';const challenge=await(await call('/email/code',{email})).json();const code=sent.at(-1).text.match(/验证码是：(\d{6})/)[1];assert.equal((await call('/email/verify',{email,code,challenge_id:challenge.challenge_id,mail_enabled:false})).status,200);
 const first=await call('/guest/create',payload);assert.equal(first.status,201,await first.clone().text());const room=await first.json();const count=db.sqlite.prepare('SELECT COUNT(*) n FROM dormitories').get().n;
 await stop();await start();const second=await call('/guest/create',payload);assert.equal(second.status,201,await second.clone().text());const recovered=await second.json();assert.equal(recovered.dorm.id,room.dorm.id);assert.notEqual(recovered.access_token,room.access_token);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM dormitories').get().n,count);
 console.log('PASS: additive migration preserves seven old tables; replay after database restart returns same room');
} finally {if(mail&&db)await stop();await fs.rm(dir,{recursive:true,force:true});}
