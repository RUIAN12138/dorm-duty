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
   createCount++;requestIds.push(data.request_id);assert.equal(response.status,201,body);
   if(createCount===1)return route.abort('connectionreset');
  }
  return route.fulfill({status:response.status,contentType:'application/json',body});
 });
 await page.goto('http://127.0.0.1:8123/?entry=rooms');
 await page.waitForTimeout(1000);
 await page.getByRole('button',{name:'创建宿舍',exact:true}).click();
 await page.locator('.dorm-wizard').waitFor();
 await page.getByLabel('宿舍名称',{exact:true}).fill('断线重试宿舍');
 for(let i=0;i<4;i++) await page.getByRole('button',{name:'继续',exact:true}).click();
 const before=h.db.sqlite.prepare('SELECT COUNT(*) n FROM dormitories').get().n;
 await page.getByRole('button',{name:'确认创建',exact:true}).click();
 await page.getByText('连接服务失败，请稍后重试',{exact:true}).waitFor();
 assert.equal(createCount,1);assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) n FROM dormitories').get().n,before+1);
 await page.getByRole('button',{name:'确认创建',exact:true}).click();
 await page.locator('.invite-result>strong').waitFor();
 assert.equal(createCount,2);assert.match(requestIds[0],/^[a-f0-9]{32}$/);assert.equal(requestIds[1],requestIds[0]);
 assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) n FROM dormitories').get().n,before+1);
 assert.equal((await page.locator('.invite-result>strong').innerText()).length,8);
 console.log(`PASS ${engine}: actual wizard retries lost response with same request ID and one room`);
}finally{await browser.close();await mail.close();h.close();}
