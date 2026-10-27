import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,webkit} from '../../../node_modules/@playwright/test/index.mjs';
import {createHarness} from '../../../../site/scripts/check-cloud-backend.mjs';
const engine=process.env.DORM_BROWSER==='webkit'?'webkit':'chromium';
const base=process.env.DORM_WIZARD_ORIGIN||'http://127.0.0.1:8119';
const out=`data/task-nudges/${engine}`;await fs.mkdir(out,{recursive:true});
const b=await(engine==='webkit'?webkit:chromium).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
const context=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',recordVideo:{dir:out,size:{width:390,height:844}}});
const p=await context.newPage();p.setDefaultTimeout(12000);const h=await createHarness();const errors=[],writes=[],checks=[];
const check=(v,label)=>{assert.ok(v,label);checks.push(label);console.log('PASS',label)};
const room=await(await h.request('/guest/create',{method:'POST',data:{name:'催促界面隔离',nickname:'甲',members:['乙','丙']}})).json();
const peer=await(await h.request('/chores/claim',{method:'POST',data:{invite_code:room.invite_code,nickname:'乙'}})).json();
const identity={id:room.dorm.id,name:room.dorm.name,invite_code:room.invite_code,member_id:peer.member.user_id,nickname:'乙',is_creator:false};
let holdFloor=false,releaseFloor;
await p.addInitScript(({invite,id})=>localStorage.setItem(`dorm-welcome-guide-v2:${encodeURIComponent(invite)}:${id}`,'1'),{invite:room.invite_code,id:peer.member.user_id});
await p.route(/\/(email|chores|auth|dorms|guest)\//,async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.pathname.startsWith('/email/'))return route.fulfill({json:url.pathname==='/email/config'?{available:true,registration_required:true}:url.pathname==='/email/me'?{logged_in:true,email:'nudge@example.invalid',rooms:[identity]}:url.pathname==='/email/enter'?{...identity,access_token:peer.access_token}:{}});
 if(url.pathname==='/chores/push/config')return route.fulfill({json:{available:false}});
 if(req.method()!=='GET')writes.push({path:url.pathname,body:req.postDataJSON()});
 const response=await h.request(url.pathname+url.search,{method:req.method(),token:req.headers().authorization?.replace(/^Bearer /,''),...(req.postData()?{data:req.postDataJSON()}: {})});
 if(holdFloor&&url.pathname==='/chores/remind')await new Promise(resolve=>{releaseFloor=resolve;});
 await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
});
p.on('pageerror',e=>errors.push(e.message));
async function settled(){await p.waitForFunction(()=>!document.querySelector('.board-focus')?.getAnimations({subtree:true}).some(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity));}
async function swipe(dx,dy=0){const r=await p.getByTestId('nudge-task-swipe').boundingBox();const x=r.x+r.width/2,y=r.y+r.height/2;await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+dx,y+dy,{steps:8});await p.mouse.up();}
try{
 await p.goto(base+'/water?start=1');await p.locator('.nudge-pane').waitFor();
 check(await p.locator('.chore-bottom-nav [data-section=water]').innerText().then(t=>t.includes('催促')),'navigation shows 催促 while route remains water');
 check(await p.locator('.nudge-pane .task-selector,.nudge-pane [role=tab],.nudge-pane [aria-label*=下一]').count()===0,'no visible task switch buttons');
 await p.getByText('左右滑动大字，换个任务催促。',{exact:true}).waitFor();
 check(true,'companion explicitly introduces task swiping');
 const frames=await p.locator('.nudge-title-strip').evaluate(async el=>{const values=[];for(let i=0;i<70;i++){await new Promise(requestAnimationFrame);values.push(new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);}return values;});
 check(frames.some(x=>Math.abs(x)>5&&Math.abs(x)<=29),'subtle discovery reveals an adjacent title through real transform frames');
 await settled();check(await p.locator('.nudge-title-strip').evaluate(el=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)<1),'discovery returns to the original title position');
 await settled();check(await p.locator('.nudge-recipient').evaluate(el=>el.getBoundingClientRect().width>200),'recipient has full width so Chinese names do not stack vertically');await p.screenshot({path:out+'/water.png'});writes.length=0;
 await swipe(-110);await p.locator('.nudge-task-name[aria-label="查看地板详情"]').waitFor();await settled();
 check(writes.length===0,'swipe selects another category without sending notification');
 const name=await p.locator('.nudge-pane [data-testid=water-nudge]').getAttribute('aria-label');check(name.includes('催促地板'),'nudge is labeled with the selected task');
 holdFloor=true;await p.getByTestId('water-nudge').click();await p.waitForFunction(()=>document.querySelector('.nudge-status')?.textContent?.includes('正在提醒'));
 await swipe(-110);await p.locator('.nudge-task-name[aria-label="查看厕所详情"]').waitFor();releaseFloor();holdFloor=false;await settled();
 check(!(await p.locator('.nudge-status').innerText()).includes('已提醒'),'late previous task response does not overwrite selected task feedback');
 await swipe(110);await p.locator('.nudge-task-name[aria-label="查看地板详情"]').waitFor();
 await p.waitForFunction(()=>document.querySelector('.nudge-status')?.textContent?.includes('已提醒'));
 await p.getByTestId('water-nudge').click({clickCount:8,delay:30});
 check(writes.filter(w=>w.path==='/chores/remind').length===1,'rapid tapping preserves existing client cooldown and sends once');
 await p.screenshot({path:out+'/floor.png'});
 const before=await p.locator('.nudge-task-name').innerText();await swipe(8,85);check(await p.locator('.nudge-task-name').innerText()===before,'vertical gesture does not change task');
 await p.getByTestId('nudge-task-swipe').focus();await p.keyboard.press('ArrowRight');await p.locator('.nudge-task-name[aria-label="查看厕所详情"]').waitFor();check(true,'keyboard arrows switch without visible controls');
 await p.locator('.chore-bottom-nav [data-section=duty]').click();await p.getByTestId('pane-duty').waitFor();await p.locator('.chore-bottom-nav [data-section=water]').click();await p.locator('.nudge-task-name[aria-label="查看厕所详情"]').waitFor();check(true,'selected task survives page navigation');
 await p.getByTestId('nudge-task-swipe').focus();await p.keyboard.press('ArrowLeft');await p.keyboard.press('ArrowLeft');await p.locator('.nudge-task-name[aria-label="查看抬水详情"]').waitFor();
 check(await p.getByRole('button',{name:'抬水临时安排',exact:true}).count()===1,'water exception entry is preserved');
 if(engine==='chromium'){
   const cdp=await context.newCDPSession(p),r=await p.getByTestId('nudge-task-swipe').boundingBox();
   const x=r.x+r.width/2,y=r.y+r.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let n=1;n<=8;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-n*14,y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await p.locator('.nudge-task-name[aria-label="查看地板详情"]').waitFor();check(true,'Chromium touch input switches task without synthetic mouse events');await cdp.detach();
 }
 await settled();const cancelName=await p.locator('.nudge-task-name').innerText();
 await p.getByTestId('nudge-task-swipe').evaluate(el=>{const r=el.getBoundingClientRect(),base={pointerId:91,pointerType:'touch',isPrimary:true,button:0,bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2};el.dispatchEvent(new PointerEvent('pointerdown',base));el.dispatchEvent(new PointerEvent('pointercancel',base));});
 check(await p.locator('.nudge-task-name').innerText()===cancelName,'cancelled gesture never switches or sends');

 for(const width of [320,390,430]){await p.setViewportSize({width,height:844});await settled();check(await p.locator('.nudge-pane').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`${width}px has no horizontal content overflow`);}
 await p.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await p.reload();await p.locator('.nudge-pane').waitFor();await settled();
 check(await p.locator('.nudge-title-strip').evaluate(el=>el.getAnimations().filter(a=>a.playState==='running').length)===0,'reduced motion suppresses title discovery');
 await p.screenshot({path:out+'/dark-reduced.png'});
 await p.goto(base+'/?preview=new-dorm');await p.locator('.dorm-wizard').waitFor();await p.getByRole('button',{name:'预览',exact:true}).click();const preview=p.getByTestId('live-draft-preview');await preview.getByTestId('pane-duty').waitFor();
 const writeCount=writes.length;await preview.locator('.chore-bottom-nav [data-section=water]').click();await preview.locator('.nudge-pane').waitFor();await preview.getByTestId('nudge-task-swipe').focus();await p.keyboard.press('ArrowRight');await preview.getByTestId('water-nudge').waitFor();await preview.getByTestId('water-nudge').click();
 check(writes.length===writeCount,'real-component draft nudge preview sends no API writes');
 check((await preview.locator('.nudge-status').innerText()).includes('未发送'),'preview truthfully reports no real notification');
 await p.goto(base+'/guide?practice=1');await p.getByTestId('lesson-water').click();
 const at=async id=>p.waitForFunction(id=>document.querySelector('[data-testid=practice-coach]')?.dataset.step===id,id);
 await at('water-nav');await p.getByTestId('nav-water').click();await at('water-detail');await p.locator('.water-task-text').click();await at('water-detail-close');await p.getByRole('button',{name:'关闭详情',exact:true}).click();await at('water-complete');
 await p.getByTestId('complete-water--13').click();await at('water-nudge');await p.getByTestId('water-nudge').click();await at('water-swipe');
 await p.getByText('向左滑动大字，换一个任务',{exact:true}).waitFor();await settled();await p.locator('[data-testid=practice-coach]').evaluate(async el=>Promise.allSettled(el.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished)));await fs.writeFile(out+'/tutorial-title.json',JSON.stringify(await p.locator('.nudge-task-name').evaluate(el=>{const result=[];for(let e=el;e;e=e.parentElement){const s=getComputedStyle(e),r=e.getBoundingClientRect();result.push({tag:e.className,text:e===el?e.textContent:undefined,opacity:s.opacity,color:s.color,background:s.backgroundColor,visibility:s.visibility,rect:{x:r.x,y:r.y,w:r.width,h:r.height}});}return result;}),null,2));await p.screenshot({path:out+'/tutorial-swipe.png'});await swipe(-110);await p.getByTestId('lesson-water').waitFor();
 check((await p.getByTestId('lesson-water').innerText()).includes('已练习'),'water completion, handoff, nudge and title-swipe lesson advances entirely through real actions');
 check(writes.length===writeCount,'tutorial completion and nudge remain fully isolated');
 check(errors.length===0,'no uncaught browser errors');
 console.log(JSON.stringify({status:'passed',engine,checks,writes,errors}));await fs.writeFile(out+'/results.json',JSON.stringify({status:'passed',engine,checks,writes,errors},null,2));
}catch(error){await p.screenshot({path:out+'/failure.png'});throw error;}finally{await context.close();await b.close();h.close();}
