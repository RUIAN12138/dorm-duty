import assert from 'node:assert/strict';
import {createHarness} from './check-cloud-backend.mjs';
import {createEmailRuntime} from '../local/email-runtime.mjs';
import {handleApi} from '../worker/backend.mjs';
import {creationRequestId,clearCreationRequest} from '../../frontend/src/interaction/creationRequest.ts';
const h=await createHarness(), sent=[];
const mail=createEmailRuntime(h.db,{config:{host:'smtp.invalid',port:465,user:'test@example.invalid',password:'fixture-only',from:'test@example.invalid',publicOrigin:'https://backend-test.example',otpSecret:'b'.repeat(64)},autoStart:false,send:async message=>sent.push(message)});
const config={schema_version:2,policy:'soft',pages:[{id:'duty',label:'值日'},{id:'water',label:'催促'},{id:'calendar',label:'日历'}],tasks:[{key:'floor',name:'地板',content:'扫地',enabled:true,page:'duty',rotation:'round',display:'title',deadline:'22:00',interval:3}]};
const map=new Map();globalThis.localStorage={getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
const input={name:'隔离创建',nickname:'创建者',members:[],configuration:config};
let cookie='';
async function call(path,data){const r=await mail.wrap(new Request('https://backend-test.example'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Dorm-Email':'1',Origin:'https://backend-test.example',Cookie:cookie,'X-Dorm-Client':'idempotency-fixture'},body:JSON.stringify(data)}),(request,emailCreator)=>handleApi(request,{...h.env,EMAIL_CREATOR:emailCreator}));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r}
async function login(email){cookie='';const challenge=await(await call('/email/code',{email})).json();const code=sent.at(-1).text.match(/验证码是：(\d{6})/)[1];const r=await call('/email/verify',{email,code,challenge_id:challenge.challenge_id,mail_enabled:false});assert.equal(r.status,200,await r.clone().text());}
const count=()=>h.db.sqlite.prepare('SELECT COUNT(*) n FROM dormitories').get().n;
try{
 const firstId=await creationRequestId('owner@example.invalid',input);
 assert.equal(await creationRequestId('OWNER@example.invalid',input),firstId);
 assert.notEqual(await creationRequestId('owner@example.invalid',{...input,name:'另一个'}),firstId);
 assert.equal(await creationRequestId('owner@example.invalid',input),firstId,'returning to the same draft retains its pending ID');
 clearCreationRequest('owner@example.invalid');
 const requestId=await creationRequestId('owner@example.invalid',input);assert.notEqual(requestId,firstId);
 assert(!JSON.stringify([...map.values()]).includes('隔离创建'));
 await login('owner@example.invalid');const before=count();
 const replies=await Promise.all(Array.from({length:5},()=>call('/guest/create',{...input,request_id:requestId})));
 for(const response of replies)assert.equal(response.status,201,await response.clone().text());
 const rooms=await Promise.all(replies.map(response=>response.json()));assert.equal(count(),before+1);assert.equal(new Set(rooms.map(room=>room.dorm.id)).size,1);assert.equal(new Set(rooms.map(room=>room.access_token)).size,5);
 const changed=await call('/guest/create',{...input,name:'不相同',request_id:requestId});assert.equal(changed.status,409);assert.equal(count(),before+1);
 const badId=await call('/guest/create',{...input,request_id:'bad'});assert.equal(badId.status,422);
 const stored=h.db.sqlite.prepare('SELECT * FROM room_creation_requests').all();assert.equal(stored.length,1);assert(!JSON.stringify(stored).includes(requestId));assert(!JSON.stringify(stored).includes(rooms[0].access_token));
 const ownerCookie=cookie;await login('other@example.invalid');
 const other=await call('/guest/create',{...input,request_id:requestId});assert.equal(other.status,201,await other.clone().text());
 const otherRoom=await other.json();assert.notEqual(otherRoom.dorm.id,rooms[0].dorm.id);assert.equal(count(),before+2);
 cookie=ownerCookie;
 const room=rooms[0];h.db.sqlite.prepare('UPDATE dorm_members SET is_active=0 WHERE dorm_id=? AND user_id=?').run(room.dorm.id,room.member_id);
 const revoked=await call('/guest/create',{...input,request_id:requestId});assert.equal(revoked.status,401);assert.equal(count(),before+2);
 const revokedChanged=await call('/guest/create',{...input,name:'不相同',request_id:requestId});assert.equal(revokedChanged.status,401);
 const expiredCookie=cookie;h.db.sqlite.prepare('UPDATE email_sessions SET expires_at=? WHERE account_id=(SELECT id FROM email_accounts WHERE email=?)').run('2000-01-01T00:00:00.000Z','owner@example.invalid');
 cookie=expiredCookie;const expired=await call('/guest/create',{...input,request_id:requestId});assert.equal(expired.status,401);assert.equal(count(),before+2);
 console.log('PASS: five concurrent retries create one room; replay issues distinct grants; conflict and revoked creator rejected; no plaintext secrets stored');
}finally{clearCreationRequest('owner@example.invalid');delete globalThis.localStorage;await mail.close();h.close()}
