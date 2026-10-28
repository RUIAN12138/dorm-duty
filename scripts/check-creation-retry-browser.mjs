import assert from 'node:assert/strict';
import {chromium,webkit} from '../frontend/node_modules/@playwright/test/index.mjs';
import {createHarness} from '../site/scripts/check-cloud-backend.mjs';
import {createEmailRuntime} from '../site/local/email-runtime.mjs';
import {handleApi} from '../site/worker/backend.mjs';
const h=await createHarness(),sent=[]; let cookie='', createCount=0; const requestIds=[];
const mail=createEmailRuntime(h.db,{config:{host:'smtp.invalid',port:465,user:'test@example.invalid',password:'fixture-only',from:'test@example.invalid',publicOrigin:'https://backend-test.example',otpSecret:'b'.repeat(64)},autoStart:false,send:async m=>sent.push(m)});
async function send(path,method='GET',data,headers={}) {
 const request=new Request('https://backend-test.example'+path,{method,headers:{...headers,Origin:'https://backend-test.example',Cookie:cookie,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 const response=await mail.wrap(request,(req,creator)=>handleApi(req,{...h.env,EMAIL_CREATOR:creator}));if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;
}
const email='owner@example.invalid';
const challenge=await(await send('/email/code','POST',{email},{'X-Dorm-Email':'1'})).json();
const code=sent.at(-1).text.match(/验证码是：(\d{6})/)[1];assert.equal((await send('/email/verify','POST',{email,code,challenge_id:challenge.challenge_id,mail_enabled:false},{'X-Dorm-Email':'1'})).status,200);
const engine=process.env.DORM_BROWSER==='webkit'?'webkit':'chromium';
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});page.setDefaultTimeout(10000);
try {
 await page.route(/\/(email|chores|auth|dorms|guest)\//,async route=>{
  const req=route.request(),url=new URL(req.url()),data=req.postData()?JSON.parse(req.postData()):undefined;
  const raw=req.headers();const headers={...(raw.authorization?{Authorization:raw.authorization}:{}),...(raw['x-dorm-email']?{'X-Dorm-Email':raw['x-dorm-email']}:{})};const response=await send(url.pathname+url.search,req.method(),data,headers);const body=await response.text();
  if(url.pathname==='/guest/create'&&req.method()==='POST'){
   createCount++;requestIds.push(data.request_id);
   if(process.env.DORM_ACTIVE_SWITCH==='1') {assert.equal(response.status,409,body);return route.fulfill({status:response.status,contentType:'application/json',body});}
   assert.equal(response.status,201,body);
   if(createCount===1)return route.abort('connectionreset');
  }
  return route.fulfill({status:response.status,contentType:'application/json',body});
 });
 await page.goto('http://127.0.0.1:8123/?entry=rooms');
 await page.waitForTimeout(1000);
 await page.getByRole('button',{name:'创建宿舍',exact:true}).click();
 await page.locator('.dorm-wizard').waitFor();
 await page.getByLabel('宿舍名称',{exact:true}).fill('断线重试宿舍');
 if(process.env.DORM_ACCOUNT_SWITCH==='1') {
  const ownerCookie=cookie;
  await page.waitForFunction(()=>localStorage.getItem('dorm-create-v2:owner@example.invalid')?.includes('断线重试宿舍'));
  cookie='';
  const other='other@example.invalid';
  const challenge=await(await send('/email/code','POST',{email:other},{'X-Dorm-Email':'1'})).json();
  const code=sent.at(-1).text.match(/验证码是：(\d{6})/)[1];
  assert.equal((await send('/email/verify','POST',{email:other,code,challenge_id:challenge.challenge_id,mail_enabled:false},{'X-Dorm-Email':'1'})).status,200);
  if(process.env.DORM_ACTIVE_SWITCH==='1') {
   const before=h.db.sqlite.prepare('SELECT COUNT(*) n FROM dormitories').get().n;
   if(process.env.DORM_LOCAL_SWITCH==='1') await page.evaluate(async()=>{const {emailAccount}=await import('/src/api/email.ts');emailAccount.email='other@example.invalid';});
   for(let i=0;i<4;i++) await page.getByRole('button',{name:'继续',exact:true}).click();
   await page.getByRole('button',{name:'确认创建',exact:true}).click();
   await page.getByText('登录账号已切换，请重新打开创建页面。',{exact:true}).waitFor();
   assert.equal(createCount,process.env.DORM_LOCAL_SWITCH==='1'?0:1);assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) n FROM dormitories').get().n,before);
   await page.getByRole('button',{name:'确认创建',exact:true}).click();
   assert.equal(createCount,process.env.DORM_LOCAL_SWITCH==='1'?0:1,'a second click must not submit the old draft under the new account');
   assert((await page.evaluate(()=>localStorage.getItem('dorm-create-v2:owner@example.invalid'))).includes('断线重试宿舍'));
   await page.getByRole('button',{name:'退出配置',exact:true}).click();
   await page.getByRole('button',{name:'创建宿舍',exact:true}).click();
   assert.equal(await page.getByLabel('宿舍名称',{exact:true}).inputValue(),'','reopening uses the newly verified account draft');
   console.log(`PASS ${engine}: active identity switch rejects creation and retains original draft`);
  } else {
  await page.goto('http://127.0.0.1:8123/?entry=rooms');
  await page.getByRole('button',{name:'创建宿舍',exact:true}).click();
  assert.equal(await page.getByLabel('宿舍名称',{exact:true}).inputValue(),'','another account must not see the first account draft');
  await page.getByLabel('宿舍名称',{exact:true}).fill('另一份草稿');
  await page.waitForFunction(()=>localStorage.getItem('dorm-create-v2:other@example.invalid')?.includes('另一份草稿'));
  cookie=ownerCookie;
  await page.goto('http://127.0.0.1:8123/?entry=rooms');
  await page.getByRole('button',{name:'创建宿舍',exact:true}).click();
  assert.equal(await page.getByLabel('宿舍名称',{exact:true}).inputValue(),'断线重试宿舍');
  assert.equal(createCount,0);
  console.log(`PASS ${engine}: same-device account drafts remain isolated and restore on return`);
  }
 } else {
 await page.getByRole('button',{name:'继续',exact:true}).click();
 await page.getByRole('button',{name:'自定义任务',exact:true}).click();
 await page.getByLabel('任务名称',{exact:true}).fill('阳台');
 await page.getByRole('button',{name:'‹ 返回任务',exact:true}).click();
 await page.getByRole('button',{name:'下一组',exact:true}).click();
 await page.locator('.template-card').getByText('阳台',{exact:true}).waitFor();
 await page.getByRole('button',{name:'上一组',exact:true}).click();
 assert.equal(await page.locator('.creation-task-select .template-card[aria-pressed="true"]').count(),4);
 for(let i=0;i<3;i++) await page.getByRole('button',{name:'继续',exact:true}).click();
 const before=h.db.sqlite.prepare('SELECT COUNT(*) n FROM dormitories').get().n;
 await page.getByRole('button',{name:'确认创建',exact:true}).click();
 await page.getByText('连接服务失败，请稍后重试',{exact:true}).waitFor();
 assert.equal(createCount,1);assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) n FROM dormitories').get().n,before+1);
 if(process.env.DORM_RELOAD==='1') {
  await page.reload();
  await page.getByRole('button',{name:'跳过',exact:true}).click();
  await page.getByText('断线重试宿舍',{exact:true}).waitFor();
  assert.equal(createCount,1,'reload must not silently create another room');
  assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) n FROM dormitories').get().n,before+1);
  console.log(`PASS ${engine}: reload restores the created room after a lost response`);
 } else {
  await page.getByRole('button',{name:'确认创建',exact:true}).click();
  await page.locator('.invite-result>strong').waitFor();
  assert.equal(createCount,2);assert.match(requestIds[0],/^[a-f0-9]{32}$/);assert.equal(requestIds[1],requestIds[0]);
  assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) n FROM dormitories').get().n,before+1);
  assert.equal((await page.locator('.invite-result>strong').innerText()).length,8);
  console.log(`PASS ${engine}: actual wizard retries lost response with same request ID and one room`);
 }
 }
}finally{await browser.close();await mail.close();h.close();}
