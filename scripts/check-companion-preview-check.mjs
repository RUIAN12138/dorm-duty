import assert from 'node:assert/strict';
import { build } from '../frontend/node_modules/esbuild/lib/main.js';
async function load(entry) {
 const result = await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node'});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const {createCompanionTapGesture,naturalGaze}=await load('frontend/src/interaction/companionTap.ts');
function fixture() {
 let now=0,id=0; const jobs=new Map(),events=[];
 const clock={now:()=>now,later:(callback,delay)=>{const key=++id;jobs.set(key,{callback,at:now+delay});return()=>jobs.delete(key);}};
 const gesture=createCompanionTapGesture({single:()=>events.push('note'),double:()=>events.push('play')},clock);
 return {gesture,events,advance(ms){const end=now+ms;while(true){const next=[...jobs].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;jobs.delete(next[0]);next[1].callback();}now=end;},get pending(){return jobs.size;}};
}
let f=fixture();f.gesture.tap(50,50);f.advance(479);assert.deepEqual(f.events,[]);f.advance(1);assert.deepEqual(f.events,['note']);
f=fixture();f.gesture.tap(50,50);f.advance(280);f.gesture.tap(58,56);f.advance(1000);assert.deepEqual(f.events,['play']);assert.equal(f.pending,0);
f=fixture();f.gesture.tap(50,50);f.advance(450);f.gesture.tap(50,50);f.advance(10);f.gesture.tap(50,50);f.advance(1000);assert.deepEqual(f.events,['play']);
f=fixture();f.gesture.tap(50,50);f.advance(120);f.gesture.cancel();f.advance(1000);assert.deepEqual(f.events,[]);
f=fixture();f.gesture.tap(50,50);f.advance(500);f.gesture.tap(50,50);f.advance(500);assert.deepEqual(f.events,['note','note']);
f=fixture();f.gesture.tap(50,50);f.advance(120);f.gesture.tap(150,50);f.advance(500);assert.deepEqual(f.events,['note','note']);
f=fixture();f.gesture.tap(0,0,true);assert.deepEqual(f.events,['note']);assert.equal(f.pending,0);
const box={left:100,top:100,width:176,height:176},viewport={width:390,height:844};
assert.deepEqual(naturalGaze(188,188,box,viewport),{x:0,y:0});
let previous=-1;
for(let x=-100;x<=700;x++) {const p=naturalGaze(x,500,box,viewport);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1);assert.ok(p.x>=previous);if(x>-100)assert.ok(p.x-previous<.01);previous=p.x;}
const speech=await load('frontend/src/interaction/companionSpeech.ts');
const signal=new AbortController().signal, seen=new Set();
for(let i=0;i<9;i++){const tip=await speech.companionReply('duty','tip',signal);assert.ok(/单击|双击|点|滑动/.test(tip));assert.ok(Array.from(tip).length<=20);assert.ok(!seen.has(tip));seen.add(tip);}
assert.deepEqual(speech.speechPages('球'.repeat(60)).map(s=>s.length),[20,20]);
console.log('PASS: delayed single tap, touch double tap, slow double tap, triple-tap guard, cancellation, distinct taps, keyboard; smooth bounded gaze; 9 functional tips and speech limits.');

const {glassGeometry}=await load('frontend/src/interaction/liquidGlass.ts');
for(const width of [288,320,390,480])for(const position of [0,.25,.8,1,1.8,2])for(const pressure of [0,.5,1])for(const velocity of [-20,0,20])for(const wobble of [-.095,0,.095]){
 const lens=glassGeometry(width,70,position,pressure,velocity,wobble);
 assert.ok(Object.values(lens).every(Number.isFinite));assert.ok(lens.width>0&&lens.height>0);
 assert.ok(lens.x-lens.width/2>=0&&lens.x+lens.width/2<=width);
 assert.ok(lens.y-lens.height/2>=0&&lens.y+lens.height/2<=70);
}
const still=glassGeometry(390,70,1,0,0,0),pressed=glassGeometry(390,70,1,1,0,0),moving=glassGeometry(390,70,1,0,8,0);
assert.ok(pressed.width<still.width&&pressed.height<still.height);
assert.ok(moving.width>still.width&&moving.height<still.height);
const {rubberBand}=await load('frontend/src/interaction/gestures.ts');
for(const pull of [-10000,-200,-20,0,20,200,10000]){const result=rubberBand(pull*.25,28);assert.ok(Math.abs(result)<28);assert.equal(Math.sign(result),Math.sign(pull));}
console.log('PASS: 648 glass geometry states stay inside the navigation, press/drag deformation, bounded page rubber band.');

const {pagePull,pagePullInput,pageSpringStep}=await load('frontend/src/interaction/pageElasticity.ts');
for(const height of [280,390,568,844]){
 let previous=0,previousDelta=Infinity;
 for(let distance=0;distance<=2000;distance++){
  const pull=pagePull(distance,height),delta=pull-previous;
  assert.ok(Number.isFinite(pull)&&pull<Math.min(56,Math.max(18,height*.075))+40);
  assert.ok(pull>=previous);assert.ok(delta<=previousDelta+1e-9||distance===1);
  if(distance>1)previousDelta=delta;
  assert.ok(Math.abs(pagePull(-distance,height)+pull)<1e-8);
  assert.ok(Math.abs(pagePullInput(pull,height)-distance)<1e-6);
  previous=pull;
 }
 assert.ok(pagePull(30,height)>20,'first movement should track the finger');
}
for(const position of [-96,-50,20,96])for(const velocity of [-900,0,900]){
 let state={position,velocity},crossed=false;
 for(let tick=0;tick<300;tick++){
  state=pageSpringStep(state.position,state.velocity,1/60);
  assert.ok(Number.isFinite(state.position)&&Number.isFinite(state.velocity));
  assert.ok(Math.abs(state.position)<140);
  if(Math.sign(state.position)!==Math.sign(position))crossed=true;
 }
 assert.ok(crossed,'spring should pass its resting point before settling');
 assert.ok(Math.abs(state.position)<.01&&Math.abs(state.velocity)<.01);
}
console.log('PASS: page drag follows early, increases resistance continuously, stays bounded, resumes without a jump, and spring returns after overshoot.');
// Exercise the real delegated spring driver without a browser layout engine.
const handlers=new Map(),jobs=new Map();let stamp=10000,nextFrame=0;
const originalPerformance=globalThis.performance;
globalThis.performance={now:()=>stamp};
globalThis.requestAnimationFrame=callback=>{jobs.set(++nextFrame,callback);return nextFrame;};
globalThis.cancelAnimationFrame=id=>jobs.delete(id);
const add=(type,callback)=>handlers.set(type,callback),remove=type=>handlers.delete(type);
globalThis.document={hidden:false,addEventListener:add,removeEventListener:remove};
globalThis.window={addEventListener:add,removeEventListener:remove};
const media={matches:false,addEventListener:(type,cb)=>handlers.set('media-'+type,cb),removeEventListener:type=>handlers.delete('media-'+type)};
globalThis.matchMedia=()=>media;
class Control{
 isConnected=true;disabled=false;inert=false;nav=false;attributes=new Set();
 style={scale:'',opacity:'',transform:'rotate(9deg)'};
 closest(selector){if(selector==='[inert]')return this.inert?this:null;if(selector==='.chore-bottom-nav,.reminder-banner-card')return this.nav?this:null;return this;}
 matches(){return this.disabled;}setAttribute(name){this.attributes.add(name);}removeAttribute(name){this.attributes.delete(name);}
}
globalThis.Element=Control;globalThis.HTMLElement=Control;
function advanceFrames(count){for(let index=0;index<count;index++){stamp+=1000/120;const batch=[...jobs];jobs.clear();for(const [,fn]of batch)fn(stamp);}}
const {installPressFeedback}=await load('frontend/src/interaction/pressFeedback.ts');
const cleanup=installPressFeedback(),button=new Control();
const event={target:button,isPrimary:true,button:0,pointerId:1,clientX:0,clientY:0};
handlers.get('pointerdown')(event);assert.ok(Number(button.style.scale)<1,'feedback appears on the pointerdown frame');
advanceFrames(60);assert.ok(Math.abs(Number(button.style.scale)-.96)<.001);
const held=button.style.scale;advanceFrames(60);assert.equal(button.style.scale,held,'held feedback stays pressed');
handlers.get('pointerup')(event);advanceFrames(120);assert.equal(button.style.scale,'');assert.equal(button.style.transform,'rotate(9deg)');
const disabled=new Control();disabled.disabled=true;handlers.get('pointerdown')({...event,target:disabled});assert.equal(disabled.style.scale,'');
const nav=new Control();nav.nav=true;handlers.get('pointerdown')({...event,target:nav});assert.equal(nav.style.scale,'');
const late=new Control();handlers.get('keydown')({target:late,key:'Enter',repeat:false});assert.ok(Number(late.style.scale)<1);handlers.get('keyup')({key:'Enter'});advanceFrames(120);assert.equal(late.style.scale,'');
const dragged=new Control();handlers.get('pointerdown')({...event,target:dragged});handlers.get('pointermove')({...event,clientX:20});advanceFrames(120);assert.equal(dragged.style.scale,'');
const tapped=new Control();handlers.get('click')({target:tapped});assert.ok(Number(tapped.style.scale)<1);advanceFrames(120);assert.equal(tapped.style.scale,'');
const rapid=new Control();for(let i=0;i<25;i++){handlers.get('pointerdown')({...event,target:rapid});advanceFrames(3);handlers.get('pointerup')(event);advanceFrames(3);assert.ok(Number(rapid.style.scale)>.88&&Number(rapid.style.scale)<1.04);}advanceFrames(120);assert.equal(rapid.style.scale,'');
media.matches=true;const reduced=new Control();handlers.get('pointerdown')({...event,target:reduced});assert.equal(reduced.style.scale,'');assert.ok(Number(reduced.style.opacity)<1);
cleanup();assert.equal(handlers.size,0);assert.equal(jobs.size,0);assert.equal(reduced.style.opacity,'');globalThis.performance=originalPerformance;
console.log('PASS: immediate/held/released spring feedback, keyboard and late controls, disabled/owned-nav exclusions, drag cancellation, preserved transforms, reduced motion and cleanup.');
const {nativeGlassClip,glassFragment}=await load('frontend/src/interaction/liquidGlass.ts');
const labelBox={left:0,top:0,width:100,height:54};
assert.equal(nativeGlassClip(labelBox,{x:170,y:27,width:96,height:50}),'none');
const mask=nativeGlassClip(labelBox,{x:50,y:27,width:96,height:50});
const points=[...mask.matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)].map(m=>[Number(m[1]),Number(m[2])]);
function contains(x,y){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
 const [xi,yi]=points[i],[xj,yj]=points[j];
 if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;
}return inside;}
assert.ok(contains(1,1),'native text outside the curved lens remains visible');
assert.ok(!contains(50,27),'only text covered by the lens is replaced by optical sampling');
assert.ok(contains(99,53));assert.ok(!contains(50,8));
assert.ok(glassFragment.includes('if(d>1.2){gl_FragColor=vec4(0.);return;}'));
console.log('PASS: native labels restore outside the lens; current curved coverage alone is masked and the shader leaves uncovered pixels transparent.');

const {bannerSwipe,dismissBanner}=await load('frontend/src/interaction/bannerMotion.ts');
assert.ok(!dismissBanner(3,-1));assert.ok(dismissBanner(6,-.3));assert.ok(dismissBanner(18,0));assert.ok(!dismissBanner(12,0));
let previousScale=1,previousOpacity=1;
for(let up=0;up<=200;up++){const pose=bannerSwipe(up);assert.ok(pose.scale<=previousScale&&pose.opacity<=previousOpacity);assert.ok(pose.scale>=.119&&pose.opacity>=0);previousScale=pose.scale;previousOpacity=pose.opacity;}
assert.ok(bannerSwipe(46).scale<=.5);assert.ok(bannerSwipe(46).opacity<.4);assert.equal(bannerSwipe(80).opacity,0);// Subtle wavelength splitting is confined to the edge.
assert.ok(glassFragment.includes('-d/5.'));assert.ok(!glassFragment.includes('ink.r=scatter'));
const {appearanceStep,appearancePose}=await load('frontend/src/interaction/appearanceMotion.ts');
for(const hz of [30,60,120]){let position=0,velocity=0;for(let tick=0;tick<hz*2;tick++){const target=tick<hz/2?1:0;const step=appearanceStep(position,velocity,target,1/hz);position=step.position;velocity=step.velocity;const pose=appearancePose(position);assert.ok(pose.radius>=6&&pose.radius<=8);assert.ok(pose.rayOpacity>=0&&pose.rayOpacity<=1);}assert.ok(Math.abs(position)<.001);}
const {pressStep}=await load('frontend/src/interaction/pressDynamics.ts');
for(const hz of [30,60,120]){let position=1,velocity=0;for(let tick=0;tick<hz*3;tick++){const target=tick<hz?.93:1;const next=pressStep(position,velocity,target,1/hz);position=next.position;velocity=next.velocity;assert.ok(position>.88&&position<1.04);}assert.ok(Math.abs(position-1)<.001);}
console.log('PASS: short upward flick and release thresholds, continuous shrink/fade and spring stability across 30/60/120fps.');

const {bannerEnterFrames,bannerLeaveFrames,bannerFlightTiming}=await load('frontend/src/interaction/bannerFlight.ts');
const entry=bannerEnterFrames(60),exit=bannerLeaveFrames(60,'none',1);
const y=frame=>Number(frame.transform.match(/translate3d\([^,]+,(-?[\d.]+)(?:px)?/)[1]);
const travel=entry.slice(0,-1).map(y);assert.ok(Math.max(...travel)>8);const peak=travel.indexOf(Math.max(...travel));assert.ok(travel.slice(peak+1).some(value=>value<-.5),'entry must rebound through its resting position');assert.ok(entry.every(frame=>frame.opacity===1));assert.ok(entry.at(-1).transform.includes('scale(1,1)'));
assert.ok(y(exit[1])>0);
const scale=frame=>Number(frame.transform.match(/scale\(([-\d.]+)/)[1]);
const half=exit.find(frame=>scale(frame)<=.5);assert.ok(half);assert.ok(y(half)+60*scale(half)+14>0,'notice reaches half-size while still visible');
assert.ok(scale(exit[0])-scale(exit[10])<scale(exit[30])-scale(exit[40]),'size collapse accelerates');
assert.ok(Math.abs(y(exit[10])-y(exit[0]))<Math.abs(y(exit[40])-y(exit[30])),'upward exit accelerates');
assert.ok(scale(entry[4])-scale(entry[0])>scale(entry[8])-scale(entry[4]),'entry growth starts fast then slows');
let previousFade=1;for(const frame of exit){assert.ok(frame.opacity<=previousFade);previousFade=frame.opacity;}assert.equal(exit.at(-1).opacity,0);assert.ok(bannerFlightTiming.leave<350,'exit must settle before the queue fallback');
console.log('PASS: fast entry growth, sampled spring rebound, accelerating exit/shrink, visible half-size, monotone fade and queue timing.');
