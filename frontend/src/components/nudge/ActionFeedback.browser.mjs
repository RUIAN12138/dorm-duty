import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit, expect } from '../../../node_modules/@playwright/test/index.mjs';
import { createHarness } from '../../../../site/scripts/check-cloud-backend.mjs';
const engine = process.env.DORM_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const base = process.env.DORM_WIZARD_ORIGIN || 'http://127.0.0.1:8123';
const out = `data/frontend-polish/${engine}`;
await fs.mkdir(out, { recursive: true });
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chromium' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', recordVideo: process.env.DORM_CAPTURE_VIDEO === "0" ? undefined : { dir: out, size: { width: 390, height: 844 } } });
const p = await context.newPage(); p.setDefaultTimeout(15000);
const h = await createHarness(), checks = [], errors = [], writes = [];
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); console.log('PASS', label); };
const room = await (await h.request('/guest/create', { method: 'POST', data: { name: '体验宿舍', nickname: '林同学', members: ['陈同学', '周同学'] } })).json();
const peer = await (await h.request('/chores/claim', { method: 'POST', data: { invite_code: room.invite_code, nickname: '陈同学' } })).json();
const identity = { id: room.dorm.id, name: room.dorm.name, invite_code: room.invite_code, member_id: peer.member.user_id, nickname: '陈同学', is_creator: false };
let status = 0, hold = false, release, previousRecord = false, lastBoard;
await p.addInitScript(({invite, id}) => localStorage.setItem(`dorm-welcome-guide-v2:${encodeURIComponent(invite)}:${id}`, '1'), {invite: room.invite_code, id: peer.member.user_id});
await p.route(/\/(email|chores|auth|dorms|guest)\//, async route => {
 const req=route.request(), url=new URL(req.url());
 if(url.pathname.startsWith('/email/'))return route.fulfill({json:url.pathname==='/email/config'?{available:true,registration_required:true}:url.pathname==='/email/me'?{logged_in:true,email:'preview@example.invalid',rooms:[identity]}:url.pathname==='/email/enter'?{...identity,access_token:peer.access_token}:{}});
 if(url.pathname==='/chores/push/config')return route.fulfill({json:{available:false}});
 if(url.pathname==='/chores/companion/state')return route.fulfill({json:{available:true,voice_available:false,messages:[],reminders:[]}});
 if(req.method()!=='GET') writes.push(url.pathname);
 if(url.pathname==='/chores/remind') {
   if(hold) await new Promise(resolve => { release=resolve; });
   if(status) return route.fulfill({status, json:{error:status===409?'任务安排已变化':status===429?'请求过于频繁':'服务暂不可用'}});
 }
 const response=await h.request(url.pathname+url.search,{method:req.method(),token:req.headers().authorization?.replace(/^Bearer /,''),...(req.postData()?{data:req.postDataJSON()}:{})});
 let body=await response.text();
 if(url.pathname==='/chores/board' && response.ok) {
  const board=JSON.parse(body); lastBoard=board;
  if(previousRecord) {
   const d=new Date(`${board.today.slice(0,7)}-01T12:00:00`); d.setMonth(d.getMonth()-1);
   const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-08`;
   const t=board.today_tasks[0];
   const record={...t,id:987654,status:'completed',completed_at:date+'T10:00:00+08:00',completed_date:date,type:'duty'};
   board.calendar_neighbors={...(board.calendar_neighbors||{}),[date.slice(0,7)]:[record]};
   if(url.searchParams.get('month')===date.slice(0,7))board.calendar=[record];
  }
  body=JSON.stringify(board);
 }
 await route.fulfill({status:response.status,contentType:'application/json',body});
});
p.on('pageerror',e=>errors.push(e.message));
const hero=()=>p.locator('.nudge-title:not([inert]) [data-testid=water-nudge]');
async function idle(){await p.waitForFunction(()=>!document.querySelector('.board-focus')?.getAnimations({subtree:true}).some(a=>a.playState==='running' && a.effect?.getTiming().iterations!==Infinity) && (!document.querySelector('.nudge-title-strip') || document.querySelector('.nudge-title-strip').dataset.motion==='idle'));}
async function floor(){await p.getByTestId('nudge-task-swipe').focus();await p.keyboard.press('ArrowRight');await p.locator('[data-task-key=floor]').waitFor();await idle();}
async function resetNudge(){await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('dorm-water-nudge')).forEach(k=>localStorage.removeItem(k)));await p.reload();await p.getByTestId('pane-water').waitFor();await floor();}
try {
 await p.goto(base+'/calendar?start=1');await p.getByTestId('pane-calendar').waitFor();
 await p.getByRole('tab',{name:'列表',exact:true}).click();await p.getByRole('button',{name:'去看本轮任务',exact:true}).waitFor();await idle();
 check(await p.getByRole('button',{name:'查看上月',exact:true}).count()===0,'No previous-month link without confirmed records');
 await p.screenshot({path:out+'/empty-after.png'});
 const cta=p.getByRole('button',{name:'去看本轮任务',exact:true});const rect=await cta.boundingBox();check(rect.height>=44,'Empty-state action has a 44px touch target');
 await p.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await p.mouse.down();await p.waitForTimeout(90);
 check(await cta.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).a<1),'Press feedback has a visible intermediate transform');await p.screenshot({path:out+'/press-midpoint.png'});await p.mouse.up();
 await p.getByTestId('pane-duty').waitFor();check(writes.filter(x=>x==='/chores/complete').length===0,'Empty-state CTA navigates without completion writes');
 previousRecord=true;await p.goto(base+'/calendar');await p.getByRole('tab',{name:'列表',exact:true}).click();await p.getByRole('button',{name:'查看上月',exact:true}).click();await p.getByTestId('calendar-list').getByRole('button',{expanded:false}).first().click();await p.getByTestId('calendar-list').locator('[data-record-id="987654"]').waitFor();check(true,'Confirmed previous-month record is reachable through the contextual action');
 previousRecord=false;await p.getByTestId('nav-water').click();await p.getByTestId('pane-water').waitFor();await floor();
 const name=await hero().innerText();
 status=503;await hero().click();await expect(p.locator('.nudge-status')).toContainText('操作失败');await expect(p.locator('.companion-bubble')).toContainText(name);check(true,'Failure identifies the intended recipient without claiming success');
 status=0;hold=true;await hero().click();await expect(p.locator('.nudge-status')).toContainText('正在提醒');check(!(await p.locator('.nudge-status').innerText()).includes('已提醒'),'No optimistic delivery claim while response is pending');hold=false;release();
 await expect(p.locator('.nudge-status')).toContainText(`· ${name} · 地板`);await expect(p.locator('.companion-bubble')).toContainText(`已提醒${name}完成地板`);check(true,'Confirmed reminder names the exact recipient and task');
 const count=writes.length;await hero().click({clickCount:5,delay:20});check(writes.length===count,'Rapid repeat taps preserve client cooldown');
 await idle();await p.screenshot({path:out+'/nudge-success.png'});
 status=429;await resetNudge();await hero().click();await expect(p.locator('.nudge-status')).toContainText('操作太频繁');let total=writes.length;await hero().click();check(writes.length===total && !(await p.locator('.nudge-status').innerText()).includes('已提醒'),'429 and repeated blocked taps never claim delivery and preserve cooldown');
 await p.screenshot({path:out+'/nudge-limited.png'});
 status=409;await resetNudge();await hero().click();await expect(p.locator('.nudge-status')).toContainText('任务安排已变化');await expect(p.locator('.companion-bubble')).toContainText('重新确认');check(true,'Changed assignment asks for confirmation instead of a network diagnosis');
 status=0;await p.getByTestId('nav-duty').click();await p.getByTestId('pane-duty').waitFor();await p.getByTestId('nav-water').click();await p.getByTestId('pane-water').waitFor();await idle();
 const positions=await p.locator('.nudge-title-strip').evaluate(async el=>{const values=[];for(let i=0;i<25;i++){await new Promise(requestAnimationFrame);values.push(new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);}return values;});check(positions.every(x=>Math.abs(x)<.5),'Learned task gesture does not replay discovery motion');
 for(const width of [320,390,430]) {await p.setViewportSize({width,height:844});await idle();check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px has no horizontal overflow`);}
 await p.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await p.getByTestId('nav-calendar').click();await p.getByRole('tab',{name:'列表',exact:true}).click();await p.getByRole('button',{name:'去看本轮任务',exact:true}).waitFor();await p.screenshot({path:out+'/empty-dark-reduced.png'});await p.getByRole('button',{name:'去看本轮任务',exact:true}).focus();await p.keyboard.press('Enter');await p.getByTestId('pane-duty').waitFor();check(true,'Dark/reduced-motion empty action remains keyboard-operable');
 check(errors.length===0,'No uncaught browser errors');
 await fs.writeFile(out+'/results.json',JSON.stringify({engine,checks,errors},null,2));
} catch(error){await p.screenshot({path:out+'/failure.png'});throw error;} finally {await context.close();await browser.close();h.close();}
