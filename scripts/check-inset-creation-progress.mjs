// Real creation UI with disposable browser storage, never production data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit } from '../frontend/node_modules/@playwright/test/index.mjs';
const engine = process.env.DORM_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const baseline = process.env.DORM_CAPTURE_BASELINE === '1';
const origin = process.env.DORM_WIZARD_ORIGIN || 'http://127.0.0.1:8104';
const out = `data/inset-creation-progress/${engine}`;
await fs.mkdir(out, {recursive:true});
const b = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chromium' ? {executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'} : {});
const c = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',recordVideo:baseline ? undefined : {dir:`${out}/video`,size:{width:390,height:844}}});
const p = await c.newPage();
p.setDefaultTimeout(12000);
const checks=[], errors=[], writes=[];
p.on('pageerror',e=>errors.push(e.message));
p.on('request',r=>{ if(/^(POST|PUT|PATCH|DELETE)$/.test(r.method()) && new URL(r.url()).pathname !== '/email/enter') writes.push(r.url()); });
const check=(v,s)=>{assert.ok(v,s);checks.push(s);console.log('PASS',s);};
async function idle(){await p.waitForFunction(()=>{const root=document.querySelector('.dorm-wizard');return root && !root.getAnimations({subtree:true}).some(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity&&!a.effect?.target?.closest?.('.dorm-companion'));});}
const current=()=>p.locator('.progress-hit[aria-current=step]').getAttribute('aria-label');
async function hidden(){await p.waitForFunction(()=>getComputedStyle(document.querySelector('.progress-glass-surface')).opacity==='0');}
const glass=()=>p.locator('.progress-glass-surface').evaluate(el=>({opacity:+getComputedStyle(el).opacity,matrix:Array.from(new DOMMatrixReadOnly(getComputedStyle(el).transform).toFloat64Array()),rect:el.getBoundingClientRect().toJSON()}));
async function geometry(){return p.evaluate(()=>Object.fromEntries(['.wizard-guide','.creation-progress','.wizard-step:not([aria-hidden=true]) h1','.wizard-step:not([aria-hidden=true]) input','.wizard-footer'].map(s=>{const el=document.querySelector(s);const r=el?.getBoundingClientRect();return [s,r?{x:r.x,y:r.y,width:r.width,height:r.height}:null];})));}
try{
 await p.goto(origin+'/?preview=new-dorm');
 await p.getByRole('textbox',{name:'宿舍名称',exact:true}).waitFor();
 await p.evaluate(()=>document.documentElement.dataset.theme='light');
 await idle(); await hidden();
 const before=await geometry();
 await p.screenshot({path:`${out}/${baseline?'before':'after'}-light.png`});
 const host=await p.locator('.creation-progress').boundingBox();
 const x=i=>host.x+24+(host.width-48)*i/4, y=host.y+30;
 if(baseline){
  await fs.writeFile(`${out}/before-geometry.json`,JSON.stringify(before,null,2));
  await p.evaluate(()=>document.documentElement.dataset.theme='dark');await idle();
  await p.screenshot({path:`${out}/before-dark.png`});
  console.log('Baseline captured');
 } else {
  const old=await fs.readFile(`${out}/before-geometry.json`,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(old) check(JSON.stringify(before)===JSON.stringify(old),'title, field, guide, footer and progress host retain exact geometry against captured baseline');
  const marks=await p.locator('.progress-step-mark').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();const t=el.parentElement.querySelector('.progress-track').getBoundingClientRect();return {width:r.width,height:r.height,inside:r.top>=t.top&&r.bottom<=t.bottom&&r.left>=t.left&&r.right<=t.right,current:el.classList.contains('is-current'),color:getComputedStyle(el).backgroundColor};}));
  check(marks.length===5&&marks.every(m=>m.inside&&m.width>=5&&m.width<=10&&m.height<=6),'five small rounded stops stay inside the 32px track');
  check(marks.filter(m=>m.current).length===1,'one internal mark indicates the selected page');
  check((await p.locator('.progress-node').count())===0,'no large circle nodes or numeric labels return');
  await p.evaluate(()=>{window.__stepHaptics=[];Object.defineProperty(navigator,'vibrate',{configurable:true,value:n=>{window.__stepHaptics.push(n);return true;}});});
  await p.mouse.move(x(0),y);await p.mouse.down();
  const reveal=await p.evaluate(async()=>{let f=[];for(let i=0;i<10;i++){await new Promise(requestAnimationFrame);f.push(+getComputedStyle(document.querySelector('.progress-glass-surface')).opacity);}return f;});
  check(reveal.some(a=>a>0&&a<1),'press reveal contains visible opacity intermediate frames');
  await p.mouse.move(x(1.15),y,{steps:8});
  const pulled=await p.locator('.progress-glass').evaluate(el=>{const h=el.parentElement.getBoundingClientRect();const r=el.getBoundingClientRect();return (r.x+r.width/2-h.x-24)/(h.width-48)*4;});
  check(pulled>1.04&&pulled<1.15,'thumb gently attracts near a stop without hard snapping or trailing the pointer');
  check(await current()==='前往任务','page switches while the pointer is still held');
  const markIndex=await p.locator('.progress-step-mark').evaluateAll(els=>els.findIndex(el=>el.classList.contains('is-current')));
  check(markIndex===1,'internal selected mark and page update in the same gesture');
  await idle();await p.screenshot({path:`${out}/pressed-light.png`});
  await p.mouse.move(x(4),y,{steps:18});check(await current()==='前往预览确认','forward drag reaches the final page before release');
  check(await p.evaluate(()=>window.__stepHaptics.length)===4,'each forward step boundary produces one optional haptic');
  for(let i=0;i<4;i++)await p.mouse.move(x(4)-i*.2,y);
  check(await p.evaluate(()=>window.__stepHaptics.length)===4,'holding and small movements do not repeat haptics');
  await p.mouse.move(x(0),y,{steps:18});check(await current()==='前往宿舍名称','reverse drag immediately restores the first page');
  await p.mouse.move(x(1.28),y,{steps:8});
  const started=Date.now();await p.mouse.up();
  const exit=await p.evaluate(async()=>{let f=[];for(let i=0;i<70;i++){await new Promise(requestAnimationFrame);const e=document.querySelector('.progress-glass-surface'),s=getComputedStyle(e);f.push({opacity:+s.opacity,scale:new DOMMatrixReadOnly(s.transform).a});if(+s.opacity===0)break;}return f;});
  check(exit.some(f=>f.opacity>0&&f.opacity<1&&f.scale<1),'release shrinks and fades continuously after attraction settles');
  const releaseMs=Date.now()-started;
  check(exit.at(-1).opacity===0&&releaseMs<850,'release finishes without a long invisible spring tail');
  await p.mouse.move(x(2.3),y);await p.mouse.down();await p.mouse.up();
  await p.mouse.move(x(3),y);await p.mouse.down();
  await p.waitForFunction(()=>+getComputedStyle(document.querySelector('.progress-glass-surface')).opacity>.98);
  check(await current()==='前往完成规则'&&(await glass()).opacity>.98,'repress during closing retargets and cannot be hidden by an old completion');
  await p.locator('.creation-progress').dispatchEvent('pointercancel',{pointerId:1,isPrimary:true});await p.mouse.up();await hidden();
  check(true,'cancellation leaves no visible glass residue');
  await p.locator('.progress-hit').first().focus();await p.keyboard.press('End');check(await current()==='前往预览确认','keyboard End retains all steps');
  await p.keyboard.press('Home');check(await current()==='前往宿舍名称','keyboard Home restores the first page');await hidden();await idle();
  check(JSON.stringify(await geometry())===JSON.stringify(before),'repeated navigation restores field and footer geometry without drift');
  await p.evaluate(()=>Object.defineProperty(navigator,'vibrate',{configurable:true,value:undefined}));
  await p.mouse.click(x(2),y);check(await current()==='前往页面安排','missing browser haptics silently falls back with navigation intact');await hidden();
  await p.locator('.progress-hit').first().press('Home');await idle();
  for(const [width,height] of [[320,568],[390,844],[430,932]]){
   await p.setViewportSize({width,height});await idle();
   check(await p.locator('.creation-progress').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.querySelector('.progress-hit').getBoundingClientRect().height>=44;}),`${width}px has no progress overflow and keeps at least 44px touch height`);
  }
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>document.documentElement.dataset.theme='dark');await idle();await p.screenshot({path:`${out}/after-dark.png`});
  check(await p.locator('.progress-step-mark').evaluateAll(els=>els.every(el=>getComputedStyle(el).backgroundColor!=='rgba(0, 0, 0, 0)')),'dark mode keeps all internal positions visible');
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.mouse.click(x(3),y);await hidden();check(await current()==='前往完成规则','reduced motion settles immediately with no glass residue');
  check(errors.length===0,'no browser runtime errors');check(writes.length===0,'no business writes from creation navigation');
  await fs.writeFile(`${out}/results.json`,JSON.stringify({engine,checks,errors,writes,marks,magneticPosition:pulled,releaseMs,exitFrames:exit},null,2));
 }
}finally{await c.close();await b.close();}
