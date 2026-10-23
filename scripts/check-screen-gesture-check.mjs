// Imperative pointer-handler test; no browser or layout simulation is used.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from '../frontend/node_modules/esbuild/lib/main.js';
import compiler from '../frontend/node_modules/vue/compiler-sfc/index.js';
const file=new URL('../frontend/src/components/ScreenStage.vue',import.meta.url).pathname;
const descriptor=compiler.parse(await readFile(file,'utf8')).descriptor;
const compiled=compiler.compileScript(descriptor,{id:'gesture-check'});
const result=await build({stdin:{contents:compiled.content,resolveDir:new URL('../frontend/src/components',import.meta.url).pathname,sourcefile:'ScreenStage.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'composition-harness',setup(build){
 build.onResolve({filter:/^vue$/},()=>({path:'vue',namespace:'harness'}));
 build.onResolve({filter:/interaction\/motion$/},()=>({path:'motion',namespace:'harness'}));
 build.onLoad({filter:/.*/,namespace:'harness'},args=>({contents:args.path==='vue'?'export const defineComponent=v=>v;export const ref=value=>({value});export const computed=fn=>({get value(){return fn()}});export const onMounted=()=>{};export const onBeforeUnmount=()=>{};':'export const motionAllowed=()=>true;'}));
}}]});
let now=1000,next=0;const frames=new Map();
globalThis.performance={now:()=>now};globalThis.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
globalThis.innerHeight=700;globalThis.window={visualViewport:{height:700,offsetTop:0}};globalThis.document={hidden:false};
class Surface{captured=false;closest(){return null;}setPointerCapture(){this.captured=true;}hasPointerCapture(){return this.captured;}releasePointerCapture(){this.captured=false;}}
globalThis.Element=Surface;
const {default:component}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const state=component.setup({signedIn:true},{expose(){}}),surface=new Surface();state.surface.value=surface;state.fit();
const event=(y=0)=>({isPrimary:true,button:0,pointerId:1,clientX:100,clientY:y,target:surface,currentTarget:surface,cancelable:true,preventDefault(){}});
state.down(event());now+=20;state.move(event(140));const held=state.pull.value;assert.ok(held>50);assert.equal(state.dragging.value,true);
state.finishPointer({...event(140),type:'lostpointercapture',target:new Surface()});state.finishPointer({...event(140),type:'lostpointercapture'});assert.equal(state.dragging.value,true);assert.equal(state.pull.value,held);assert.equal(frames.size,0,'child lostcapture must not start a return spring');
window.visualViewport.height=540;state.fit();assert.equal(state.height.value,700);assert.equal(state.pull.value,held,'viewport updates cannot reset a held drag');
now+=800;assert.equal(state.pull.value,held,'holding does not start a timer-based return');
state.release();assert.equal(state.dragging.value,false);assert.equal(state.height.value,540);assert.ok(frames.size>0);
function advance(count){for(let tick=0;tick<count;tick++){now+=1000/120;const batch=[...frames];frames.clear();batch.forEach(([,fn])=>fn(now));}}
advance(160);assert.equal(state.pull.value,0);assert.equal(frames.size,0);
state.down(event());now+=20;state.move(event(-120));state.release();advance(8);state.down(event());assert.equal(frames.size,0);const grabbed=state.pull.value;now+=500;assert.equal(state.pull.value,grabbed);state.reset();assert.equal(state.pull.value,0);assert.equal(frames.size,0);
console.log('PASS: real page handlers hold their offset, ignore child capture loss and viewport noise, spring only after release, and allow grabbing an in-progress return.');
const bannerFile=new URL('../frontend/src/components/ReminderBanner.vue',import.meta.url).pathname;
const bannerSource=compiler.compileScript(compiler.parse(await readFile(bannerFile,'utf8')).descriptor,{id:'banner-check'}).content;
const bannerBuild=await build({stdin:{contents:bannerSource,resolveDir:new URL('../frontend/src/components',import.meta.url).pathname,sourcefile:'ReminderBanner.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'banner-harness',setup(build){
 build.onResolve({filter:/^vue$/},()=>({path:'vue',namespace:'harness'}));build.onResolve({filter:/interaction\/motion$/},()=>({path:'motion',namespace:'harness'}));build.onResolve({filter:/interaction\/bannerReplyLayout$/},()=>({path:'replyLayout',namespace:'harness'}));build.onResolve({filter:/interaction\/companion$/},()=>({path:'companion',namespace:'harness'}));build.onResolve({filter:/\.vue$/},()=>({path:'component',namespace:'harness'}));
 build.onLoad({filter:/.*/,namespace:'harness'},args=>({contents:args.path==='vue'?'export const defineComponent=v=>v;export const ref=value=>({value});export const computed=fn=>({get value(){return fn()}});export const onMounted=()=>{};export const onBeforeUnmount=()=>{};export const nextTick=fn=>Promise.resolve().then(fn);export const watch=()=>()=>{};':args.path==='replyLayout'?'export const createBannerReplyLayout=()=>({start(){},stop(){},sync(){}});export const lockBackgroundScroll=()=>()=>{};':args.path==='motion'?'export const motionAllowed=()=>true;':args.path==='companion'?'export const companionEnabled={value:false};':'export default {};'}));
}}]});
globalThis.matchMedia=()=>({matches:false});
class BannerElement extends Surface{
 offsetHeight=72;style={transform:'',opacity:''};animations=[];classes=new Set();
 classList={add:value=>this.classes.add(value),remove:value=>this.classes.delete(value),contains:value=>this.classes.has(value)};
 getAttribute(){return '42';}
 animate(keyframes,options){let resolve,reject;const finished=new Promise((ok,no)=>{resolve=ok;reject=no;});const animation={keyframes,options,finished,cancelled:false,cancel(){this.cancelled=true;reject(new Error('cancel'));},complete(){resolve();}};this.animations.push(animation);return animation;}
}
globalThis.getComputedStyle=el=>({transform:el.style.transform||'none',opacity:el.style.opacity||'1'});
const bannerModule=await import('data:text/javascript;base64,'+Buffer.from(bannerBuild.outputFiles[0].text).toString('base64'));
const props={note:{id:42}},emitted=[];const banner=bannerModule.default.setup(props,{expose(){},emit:(...args)=>emitted.push(args)});
const outer=new BannerElement(),card=new BannerElement();card.parentElement=outer;
banner.beforeEnter(outer);let entered=0;banner.enter(outer,()=>entered++);
assert.ok(outer.animations[0].keyframes.every(frame=>frame.opacity===1),'entry must occlude immediately, without a translucent fade-in');
assert.equal(outer.animations[0].options.easing,'linear');assert.equal(outer.animations[0].options.duration,660);
const bannerEvent=y=>({...event(y),currentTarget:card,target:card});
banner.down(bannerEvent(100));assert.ok(banner.hold.value<1);assert.equal(entered,1,'touch interrupts entry without waiting for animation completion');now+=20;banner.move(bannerEvent(93));assert.ok(banner.swipePose.value.opacity<1);assert.ok(banner.swipePose.value.transform.includes('scale('));
banner.finish(bannerEvent(93));assert.deepEqual(emitted,[['dismiss',42,'swipe']]);
let left=0;banner.leave(outer,()=>left++);const exit=outer.animations.at(-1);assert.equal(exit.keyframes.at(-1).opacity,0);assert.equal(exit.options.easing,'linear');assert.equal(exit.options.duration,320);assert.ok(exit.keyframes.at(-1).transform.includes('scale(0.1200,0.1000)'));
exit.complete();await Promise.resolve();assert.equal(left,1);props.note=null;banner.afterLeave(outer);assert.deepEqual(emitted.at(-1),['settled',42]);assert.equal(banner.offset.value,0);
props.note={id:43};emitted.length=0;banner.beforeEnter(outer);banner.down(bannerEvent(100));advance(35);assert.ok(banner.hold.value<.95);now+=20;banner.move(bannerEvent(92));now+=300;banner.finish(bannerEvent(92));assert.equal(emitted.length,0);assert.ok(banner.offset.value<0,'return starts from held position');advance(180);assert.equal(banner.offset.value,0);assert.equal(banner.hold.value,1);assert.equal(frames.size,0,'banner hold feedback settles without leaving a RAF loop');
console.log('PASS: immediate opaque entry, entry interruption, short upward flick dismissal, shrinking/fading exit, queue settlement id and short-drag cancellation.');

for(const [dx,dy] of [[90,0],[-90,0],[0,90]]){
 banner.beforeEnter(outer);banner.down(bannerEvent(100));now+=25;banner.move({...bannerEvent(100+dy),clientX:100+dx});
 const held=banner.swipePose.value.transform;advance(90);assert.equal(banner.swipePose.value.transform,held.replace(/scale\(.*/,banner.swipePose.value.transform.match(/scale\(.*/)[0]));
 assert.equal(banner.offsetX.value,dx);assert.equal(banner.offset.value,dy);now+=300;banner.finish(bannerEvent(100+dy));advance(200);assert.equal(banner.offsetX.value,0);assert.equal(banner.offset.value,0);
}
for(const dx of [-65,65]){
 banner.beforeEnter(outer);banner.down(bannerEvent(100));now+=30;banner.move({...bannerEvent(65),clientX:100+dx});banner.finish({...bannerEvent(65),clientX:100+dx});
 banner.leave(outer,()=>{});const transform=outer.animations.at(-1).keyframes.at(-1).transform;const x=Number(transform.match(/translate3d\(([-\d.]+)/)[1]);assert.equal(Math.sign(x),Math.sign(dx));
 outer.animations.at(-1).complete();await Promise.resolve();banner.cancelGesture();
}
assert.equal(frames.size,0);console.log('PASS: four-direction held displacement, spring return and left/right upward exit trajectories.');
