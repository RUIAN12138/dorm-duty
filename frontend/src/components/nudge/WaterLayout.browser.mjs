import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,webkit} from '../../../node_modules/@playwright/test/index.mjs';
import {createHarness} from '../../../../site/scripts/check-cloud-backend.mjs';
const engine=process.env.DORM_BROWSER==='webkit'?'webkit':'chromium';
const base=process.env.DORM_WIZARD_ORIGIN||'http://127.0.0.1:8119';
const out=`data/nudge-layout/${engine}`;await fs.mkdir(out,{recursive:true});
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
 await p.goto(base+'/water?start=1');await p.getByTestId('pane-water').waitFor();
 const label=process.env.DORM_LAYOUT_LABEL||'after',results=[];
 for(const [width,height] of [[320,740],[390,844],[430,932],[390,650]]){
  await p.setViewportSize({width,height});await settled();await p.waitForFunction(()=>!document.querySelector('.nudge-title-strip') || document.querySelector('.nudge-title-strip').dataset.motion==='idle');
  const metrics=await p.evaluate(()=>{
   const names={identity:'.board-identity',pane:'[data-testid=pane-water]',caption:'.hero-caption',title:'.water-title-stage',word:'.water-title-stage h2',actions:'.water-nudge-actions',links:'.water-task-links',nav:'.chore-bottom-nav'};
   return Object.fromEntries(Object.entries(names).map(([key,selector])=>{const el=document.querySelector(selector);if(!el)return[key,null];const r=el.getBoundingClientRect(),s=getComputedStyle(el);return[key,{x:r.x,y:r.y,width:r.width,height:r.height,font:s.fontSize,line:s.lineHeight}]}));
  });
  await fs.writeFile(`${out}/${label}-${width}x${height}.json`,JSON.stringify(metrics,null,2));if(label==='after'){const before=JSON.parse(await fs.readFile(`${out}/before-${width}x${height}.json`,'utf8'));for(const key of Object.keys(before)){assert(metrics[key],key);for(const dim of ['x','y','width','height'])check(Math.abs(before[key][dim]-metrics[key][dim])<.1,`${width}x${height} ${key}.${dim} preserves original water layout`);check(before[key].font===metrics[key].font,`${width}x${height} ${key} typography preserved`);}}
  await fs.writeFile(`${out}/${label}-${width}x${height}.json`,JSON.stringify(metrics,null,2));await p.screenshot({path:`${out}/${label}-${width}x${height}.png`});
  if(width===390&&height===844){await fs.writeFile(`${out}/${label}.json`,JSON.stringify(metrics,null,2));await p.screenshot({path:`${out}/${label}.png`});}
  results.push({width,height,metrics});
 }
 await fs.writeFile(`${out}/${label}-results.json`,JSON.stringify({status:'passed',engine,checks,results},null,2));console.log(JSON.stringify({status:'passed',engine,checks:checks.length,viewports:results.length}));
}finally{await context.close();await b.close();h.close();}
