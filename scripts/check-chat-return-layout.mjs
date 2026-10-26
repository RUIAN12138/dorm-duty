// Actual Vue page; document pan/viewport stages are simulated, no device claim.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,webkit} from '../frontend/node_modules/@playwright/test/index.mjs';
const engine=process.env.DORM_BROWSER==='webkit'?'webkit':'chromium',origin=process.env.DORM_GUIDE_ORIGIN||'http://127.0.0.1:8098';
const out=`data/return-layout/${engine}`;await fs.mkdir(out,{recursive:true});
const b=await(engine==='webkit'?webkit:chromium).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});p.setDefaultTimeout(12000);
const checks=[],errors=[];const check=(v,s)=>{assert.ok(v,s);checks.push(s)};p.on('pageerror',e=>errors.push(e.message));
await p.route('**/chores/companion/state?*',r=>r.fulfill({json:{available:true,voice_available:false,messages:[],reminders:[]}}));
try {
 await p.goto(origin+'/?start=1');await p.getByTestId('chore-board').waitFor();
 for(const section of ['duty','water']) {
  if(section==='water') await p.getByTestId('nav-water').click();
  await p.getByTestId(`pane-${section}`).waitFor();
  await p.waitForFunction(()=>{ const pane=document.querySelector(".focus-pane:not([inert])");return pane && !pane.getAnimations({subtree:true}).some(a=>a.playState==="running" && a.effect?.getTiming().iterations!==Infinity); });
  const baseline=await p.evaluate(()=>{const pane=document.querySelector(".focus-pane:not([inert]) .chore-personal,.focus-pane:not([inert]) .water-pane"),id=document.querySelector(".board-identity");pane.style.setProperty("--task-content-lift","0px");id.style.marginTop="10px";const result={identity:id.getBoundingClientRect().top,caption:pane.querySelector(".hero-caption").getBoundingClientRect().top};pane.style.removeProperty("--task-content-lift");id.style.marginTop="";return result;});
  const layout=await p.evaluate(()=>{
   const pane=document.querySelector('.focus-pane:not([inert])');const cap=pane.querySelector('.hero-caption').getBoundingClientRect();const id=document.querySelector('.board-identity').getBoundingClientRect();const nav=document.querySelector('.chore-bottom-nav').getBoundingClientRect();return {identityTop:id.top,captionTop:cap.top,gap:cap.top-id.bottom,navBottom:nav.bottom,width:innerWidth};
  });
  check(layout.identityTop-baseline.identity>=8&&layout.captionTop<baseline.caption-20&&layout.navBottom<=844,section+': identity has top air, task group is lifted, navigation remains visible '+JSON.stringify({layout,baseline}));
  await p.screenshot({path:`${out}/${section}.png`});
 }
 await p.getByTestId('nav-duty').click();await p.getByTestId('pane-duty').waitFor();
 await p.evaluate(()=>{document.body.style.minHeight='1400px';window.scrollTo({top:10,behavior:'instant'});});
 await p.waitForFunction(()=>scrollY===10);
 const before=await p.getByTestId('chore-bottom-nav').boundingBox();
 const ball=await p.locator('.companion-identity .companion-frame').boundingBox();await p.mouse.click(ball.x+ball.width/2,ball.y+ball.height/2);
 await p.waitForFunction(()=>document.querySelector('.companion-chat')?.getAttribute('data-phase')==='open');
 const text=p.getByRole('textbox',{name:'和球球说句话'});await text.click();await text.fill('保留这条草稿');
 await p.evaluate(()=>{
  const vv=visualViewport;window.returnViewport={height:vv.height,top:vv.offsetTop};
  Object.defineProperty(vv,'height',{configurable:true,get:()=>500});Object.defineProperty(vv,'offsetTop',{configurable:true,get:()=>80});vv.dispatchEvent(new Event('resize'));vv.dispatchEvent(new Event('scroll'));window.scrollTo({top:120,behavior:'instant'});
 });
 await p.waitForFunction(()=>document.querySelector('.companion-chat')?.classList.contains('is-keyboard'));
 check(await p.evaluate(()=>scrollY===120),'simulated native focus pan changes the document while chat owns focus');
 await p.keyboard.press('Escape');
 await p.evaluate(()=>{for(const key of ['height','offsetTop'])delete visualViewport[key];visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'));});
 await p.locator('.companion-chat').waitFor({state:'detached'});
 await p.waitForFunction(()=>Math.abs(scrollY-10)<1);
 const after=await p.getByTestId('chore-bottom-nav').boundingBox();
 check(Math.abs(before.y-after.y)<1&&Math.abs(before.height-after.height)<1,'after close navigation returns to its original bottom position');
 const ball2=await p.locator('.companion-identity .companion-frame').boundingBox();await p.mouse.click(ball2.x+ball2.width/2,ball2.y+ball2.height/2);
 await p.waitForFunction(()=>document.querySelector('.companion-chat')?.getAttribute('data-phase')==='open');
 check(await text.inputValue()==='保留这条草稿','close/reopen keeps the unsent draft');
 await p.getByRole('button',{name:'返回宿舍',exact:true}).click();await p.locator('.companion-chat').waitFor({state:'detached'});
 await p.waitForFunction(()=>Math.abs(scrollY-10)<1);
 check(errors.length===0,'no page errors');
 await fs.writeFile(`${out}/results.json`,JSON.stringify({engine,checks,errors},null,2));console.log(JSON.stringify({engine,passed:checks.length,checks},null,2));
} finally {await p.close();await b.close();}
