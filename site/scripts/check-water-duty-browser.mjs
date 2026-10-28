import assert from 'node:assert/strict';
import {chromium,webkit} from '../../frontend/node_modules/@playwright/test/index.mjs';
import {createHarness} from './check-cloud-backend.mjs';
import {createEmailRuntime} from '../local/email-runtime.mjs';
import {handleApi} from '../worker/backend.mjs';
const origin=process.env.DORM_WIZARD_ORIGIN||'http://127.0.0.1:8119';
assert(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const engine=process.env.DORM_BROWSER==='webkit'?'webkit':'chromium';
const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
const p=await ctx.newPage(),h=await createHarness();p.setDefaultTimeout(15000);
const pages=[{id:'duty',label:'值日'},{id:'water',label:'催促'},{id:'calendar',label:'日历'}];
const task=(key)=>({key,name:key==='water'?'抬水':'地板',content:'任务内容',enabled:true,page:'duty',rotation:key==='water'?'completion':'round',display:'title',deadline:'22:00',interval:3});
const configuration={schema_version:2,policy:'soft',pages,second_page_kind:'tasks',tasks:[task('floor'),task('water')]};
const response=await h.request('/guest/create',{method:'POST',data:{name:'隔离房间',nickname:'甲',members:[],configuration}});assert.equal(response.status,201);const room=await response.json();
const identity={id:room.dorm.id,name:room.dorm.name,invite_code:room.invite_code,member_id:room.member_id,nickname:'甲',is_creator:true};
const sent=[];const mail=createEmailRuntime(h.db,{config:{host:'smtp.invalid',port:465,user:'test@example.invalid',password:'fixture-only',from:'test@example.invalid',publicOrigin:'https://backend-test.example',otpSecret:'b'.repeat(64)},autoStart:false,send:async(m)=>sent.push(m)});
let cookie='';const call=async(path,data)=>{const r=await mail.wrap(new Request('https://backend-test.example'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Dorm-Email':'1',Origin:'https://backend-test.example',Cookie:cookie,'X-Dorm-Client':'preview-fixture'},body:JSON.stringify(data)}),(request,emailCreator)=>handleApi(request,{...h.env,EMAIL_CREATOR:emailCreator}));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r};
const challenge=await (await call('/email/code',{email:'peer@example.invalid'})).json();const code=sent.at(-1).text.match(/验证码是：(\d{6})/)[1];assert((await call('/email/verify',{email:'peer@example.invalid',code,challenge_id:challenge.challenge_id,mail_enabled:false})).ok);assert.equal((await call('/chores/claim',{invite_code:room.invite_code,nickname:'室友二'})).status,201);

const draft={...configuration,name:'草稿预览',nickname:'创建者',members:[]};let tracking=false;const requests=[];
await p.addInitScript(({draft,invite,id})=>{localStorage.setItem('dorm-create-experience-v2',JSON.stringify({at:Date.now(),draft}));localStorage.setItem(`dorm-welcome-guide-v2:${encodeURIComponent(invite)}:${id}`,'1')},{draft,invite:room.invite_code,id:room.member_id});
await p.route(/\/(email|chores|auth|dorms|guest)\//,async route=>{const req=route.request(),url=new URL(req.url());if(tracking){requests.push(req.method()+' '+url.pathname);return route.fulfill({status:503,json:{error:'preview network blocked'}})}
 if(url.pathname.startsWith('/email/'))return route.fulfill({json:url.pathname==='/email/config'?{available:true,registration_required:true}:url.pathname==='/email/me'?{logged_in:true,email:'fixture@example.invalid',rooms:[identity]}:url.pathname==='/email/enter'?{...identity,access_token:room.access_token}:{}});
 if(url.pathname==='/chores/push/config')return route.fulfill({json:{available:false}});
 const result=await h.request(url.pathname+url.search,{method:req.method(),token:req.headers().authorization?.replace(/^Bearer /,''),...(req.postData()?{data:req.postDataJSON()}:{})});return route.fulfill({status:result.status,contentType:'application/json',body:await result.text()});});
try{
 await p.goto(origin+'/?start=1');await p.getByTestId('pane-duty').waitFor();
 const real=p.getByTestId('pane-duty');await real.locator('.task-selector').getByRole('button',{name:/抬水/}).click();
 await real.getByTestId(/chore-task-water-/).waitFor();assert(await real.getByRole('button',{name:'我已抬水'}).count() || await real.getByRole('button',{name:'我已完成'}).count());
 await real.getByRole('button',{name:'我已抬水'}).click();
 await real.getByRole('button',{name:'已抬水，再次点击撤销打卡'}).waitFor();
 await p.reload();await p.getByTestId('pane-duty').waitFor();
 await p.getByTestId('pane-duty').locator('.task-selector').getByRole('button',{name:/抬水/}).click();
 await p.getByTestId('pane-duty').getByRole('button',{name:'已抬水，再次点击撤销打卡'}).waitFor();
 await p.getByTestId('pane-duty').getByRole('button',{name:'已抬水，再次点击撤销打卡'}).click();
 await p.getByTestId('pane-duty').getByRole('button',{name:'我已抬水'}).waitFor();

 await p.goto(origin+'/?preview=new-dorm');await p.locator('.dorm-wizard').waitFor();tracking=true;
 await p.getByRole('button',{name:'预览',exact:true}).click();const preview=p.getByTestId('live-draft-preview');await preview.getByTestId('pane-duty').waitFor();
 await preview.locator('.task-selector').getByRole('button',{name:/抬水/}).click();await preview.getByTestId(/chore-task-water-/).waitFor();
 await preview.getByRole('button',{name:'我已抬水'}).click();
 await preview.getByRole('button',{name:'已抬水，再次点击撤销打卡'}).waitFor();
 await preview.getByRole('button',{name:'已抬水，再次点击撤销打卡'}).click();
 await preview.getByRole('button',{name:'我已抬水'}).waitFor();
 assert.equal(requests.length,0,`preview network access: ${requests.join(', ')}`);
 console.log(`PASS ${engine}: live and preview use real duty component for water placement; preview made no business requests`);
}finally{await ctx.close();await browser.close();await mail.close();h.close()}
