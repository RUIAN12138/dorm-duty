<script setup lang="ts">
import {ref,reactive,computed,watch,nextTick,onMounted,onBeforeUnmount} from 'vue';
import {animate,motion} from 'motion-v';
import {motionAllowed,motionTokens} from '../../interaction/motion';
import {captureCompanionHandoff} from '../../interaction/companion';
import {createDormDraft,clone,draftErrors,taskDefaults,type DormDraft,type DraftTask} from '../../interaction/dormDraft';
import DormCompanion from '../DormCompanion.vue';
import WizardSteps from './WizardSteps.vue';
import CreationProgress from './CreationProgress.vue';
import TaskEditor from './TaskEditor.vue';
import TaskPageBoard from './TaskPageBoard.vue';
import LiveDraftPreview from './LiveDraftPreview.vue';
import TimeWheelSetting from './TimeWheelSetting.vue';
import SpotlightTour from './SpotlightTour.vue';
const props=defineProps<{busy?:boolean;error?:string;invite?:string;initial?:DormDraft;workspace?:boolean;draftKey?:string;creatorName?:string;experience?:boolean}>();
const emit=defineEmits<{submit:[DormDraft];cancel:[];done:[];order:[]}>();
const storageKey=props.draftKey||'dorm-create-draft-v2';
let stored:DormDraft|undefined;
try{const s=JSON.parse(localStorage.getItem(storageKey)||'null');if(s&&Date.now()-s.at<86400000&&s.draft?.schema_version===2&&Array.isArray(s.draft.tasks)&&s.draft.tasks.length<=4&&Array.isArray(s.draft.pages)&&s.draft.pages.length===3&&(!props.workspace||s.baseVersion===(props.initial as any)?.baseVersion))stored=s.draft;}catch{}
const draft=reactive<DormDraft>(clone(stored||props.initial||createDormDraft()));
if(!props.workspace){draft.members=[];draft.nickname=props.creatorName||draft.nickname||'创建者';}
const enabled=computed(()=>draft.tasks.filter(t=>t.enabled));
const ruleTasks=computed(()=>enabled.value.filter(t=>t.key!=='water'));
const globalPacing=computed(()=>{if(!ruleTasks.value.length)return 'round';const value=ruleTasks.value[0]!.rotation;return ruleTasks.value.every(t=>t.rotation===value)?(value==='rotation'?'scheduled':value):'mixed';});
const hard=(t:DraftTask)=> (t.policy&&t.policy!=='inherit'?t.policy:draft.policy)==='hard';
const pacingChoices=[
 {mode:'round' as const,title:'大家做完再开始下一轮',description:'全员完成后，开始新一轮'},
 {mode:'scheduled' as const,title:'按时间安排',description:'按设定时间执行并截止'},
 {mode:'completion' as const,title:'做完交给下一位',description:'完成后轮到下一位'},
];
type Step={id:string;label:string;kind:string;title:string;tip:string;task?:DraftTask};
const selectedTask=ref<string|null>(null),advanced=ref(false);
const creationEditTaskKey=ref<string|null>(null),selectedRuleTaskKey=ref<string|null>(null);
const ruleFacet=ref<'timing'|'rotation'>('rotation');
const rulesAdvanced=ref(false);
const ruleTimeField=ref<'execution_time'|'deadline'>('deadline');
const workspaceTimeField=ref<'execution_time'|'deadline'>('deadline');
const steps=computed<Step[]>(()=>{
 if(!props.workspace)return [
  {id:'name',label:'宿舍名称',kind:'name',title:'宿舍，叫什么？',tip:'室友加入后自己填写姓名'},
  {id:'tasks',label:'任务',kind:'tasks',title:'一起照顾哪些事？',tip:'先选常用任务，再逐项编辑名称'},
  {id:'pages',label:'页面安排',kind:'pages',title:'任务放在哪里？',tip:'轻点移动，长按拖动'},
  {id:'rules',label:'完成规则',kind:'rules',title:'任务按什么节奏完成？',tip:'之后可调整'},
  {id:'preview',label:'预览确认',kind:'preview',title:'先体验，再确认',tip:'这里只改草稿，不会真的打卡'},
 ];
 const list:Step[]=[];
 const add=(id:string,label:string,kind:string,title:string,tip:string,task?:DraftTask)=>list.push({id,label,kind,title,tip,task});
 add('tasks','任务','list','这次想调整哪一项？','先选任务，再一次改一件事');add('templates','添加','templates','一起照顾哪些事？','选常用任务，也可以自己命名');
 const tasks=enabled.value.filter(t=>t.key===selectedTask.value);
 for(const t of tasks)add(`task-${t.key}`,t.name||'任务','task',`给这件事起个名字`,t.key==='water'?'没水时，记得互相照应':'说明可不填，简单一点就好',t);
 if(selectedTask.value){
  add('pages','页面','pages','任务放在哪里？','长按拖动，把任务放到合适的页面');
add('policy','方式','policy','任务按什么节奏完成？','之后可以为单项任务单独调整');
  if(advanced.value)for(const t of tasks)add(`policy-${t.key}`,`${t.name}模式`,'task-policy',`${t.name}，单独安排？`,'也可以继续跟随宿舍的模式',t);
  for(const t of tasks.filter(hard))add(`time-${t.key}`,`${t.name}时间`,'time',`${t.name}，什么时候？`,'开始与截止，留足完成的时间',t);
  for(const t of tasks)add(`rotation-${t.key}`,`${t.name}轮换`,'rotation',`${t.name}，怎么轮到？`,'舍友加入后按真实成员形成轮序',t);
 }
 add('preview','预览','preview','先体验，再确认','这里只改草稿，不会真的打卡');return list;
});
const stepId=ref(props.workspace?'tasks':'name');
const previewOpen=ref(false);
const previewMounted=ref(false);
const experienceComplete=ref(false);
const invite=computed(()=>props.invite||(props.experience&&experienceComplete.value?'local-preview':undefined));
const index=computed(()=>Math.max(0,steps.value.findIndex(s=>s.id===stepId.value)));
const current=computed(()=>steps.value[index.value]!);
const direction=ref(1),localError=ref(''),tour=ref(false),passwordFocus=ref(false),gaze=ref<{x:number;y:number}>();
const guideBall=ref<HTMLElement>(),root=ref<HTMLElement>();
const completedIds=reactive(new Set<string>()),completed=computed(()=>steps.value.map((s,i)=>completedIds.has(s.id)?i:-1).filter(i=>i>=0));
watch(steps,(next)=>{if(!next.some(s=>s.id===stepId.value)){stepId.value=next[Math.min(index.value,next.length-1)]!.id;}},{flush:'sync'});
function currentValidationError(){return current.value.kind==='preview'?draftErrors(draft).join('；'):issue();}
watch(draft,()=>{try{localStorage.setItem(storageKey,JSON.stringify({at:Date.now(),draft,baseVersion:(props.initial as any)?.baseVersion}));}catch{}if(localError.value)localError.value=currentValidationError();},{deep:true});
function go(n:number){const next=steps.value[Math.max(0,Math.min(steps.value.length-1,n))]!;if(next.id===stepId.value)return;direction.value=n>=index.value?1:-1;stepId.value=next.id;localError.value='';if(!props.workspace&&next.id==='rules'&&!selectedRuleTaskKey.value)selectedRuleTaskKey.value=enabled.value[0]?.key||null;root.value?.querySelector('.wizard-body')?.scrollTo({top:0,behavior:'instant'});}
function issue(){const c=current.value;if(c.kind==='name'&&!draft.name.trim())return '先填写宿舍名称';if((c.kind==='templates'||c.kind==='tasks')&&!enabled.value.length)return '至少选一项任务';if(c.kind==='tasks'&&enabled.value.some(t=>!t.name.trim()))return '请先为已添加的任务填写名称';if(c.task&&!c.task.name.trim())return '给任务起个名字';if((c.kind==='time'||c.kind==='rules')&&enabled.value.some(t=>hard(t)&&(t.execution_time||'08:00')>=t.deadline))return '执行时间需早于截止时间';if(c.kind==='time'&&(c.task!.execution_time||'08:00')>=c.task!.deadline)return '执行时间需早于截止时间';return '';}
function proceed(){localError.value=issue();if(localError.value)return;completedIds.add(current.value.id);go(index.value+1);}
function submit(){localError.value=draftErrors(draft).join('；');if(localError.value)return;if(props.experience){experienceComplete.value=true;return;}emit('submit',clone(draft));}
function toggle(t:DraftTask){t.enabled=!t.enabled;if(!props.workspace){creationEditTaskKey.value=t.enabled?t.key:null;if(t.enabled&&!enabled.value.some(item=>item.key===selectedRuleTaskKey.value))selectedRuleTaskKey.value=t.key;}}
function chooseCycle(mode:'round'|'scheduled'|'completion'){
 draft.policy=mode==='scheduled'?'hard':'soft';
 for(const task of ruleTasks.value)task.rotation=mode==='scheduled'?'rotation':mode==='completion'?'completion':'round';
 if(!ruleTasks.value.some(t=>t.key===selectedRuleTaskKey.value))selectedRuleTaskKey.value=ruleTasks.value[0]?.key||null;
}
function setTaskCycle(task:DraftTask,mode:'round'|'scheduled'|'completion'){
 task.rotation=mode==='scheduled'?'rotation':mode==='completion'?'completion':'round';
 if(mode==='scheduled')task.policy='hard';
}
function custom(){const t=draft.tasks.find(t=>!t.enabled);if(!t){localError.value='当前预览支持四个稳定任务槽，可改名为自定义任务。';return;}t.enabled=true;t.name='';t.content='';if(props.workspace){selectedTask.value=t.key;stepId.value=`task-${t.key}`;}else{creationEditTaskKey.value=t.key;selectedRuleTaskKey.value=t.key;}}
function edit(t:DraftTask){selectedTask.value=t.key;stepId.value=`task-${t.key}`;}
function remove(t:DraftTask){if(enabled.value.length<=1){localError.value='请至少保留一项任务';return;}t.enabled=false;if(props.workspace){selectedTask.value=null;stepId.value='tasks';}else{if(creationEditTaskKey.value===t.key)creationEditTaskKey.value=null;if(selectedRuleTaskKey.value===t.key)selectedRuleTaskKey.value=enabled.value.find(item=>item.key!==t.key)?.key||null;}}
const selectedRuleTask=computed(()=>draft.tasks.find(t=>t.key===selectedRuleTaskKey.value&&t.enabled));
const pendingDelete=ref(false);
function openPreview(){previewMounted.value=true;previewOpen.value=true;}
function tourDone(){tour.value=false;}
const tourSteps=computed(()=>[{target:'.creation-progress, .wizard-steps',text:'点选或拖动进度条，随时回去修改。'},{target:'.wizard-footer',text:'每次只安排一件事；确认前都保存在草稿。'}]);
 const mood=computed(()=>passwordFocus.value?'00':localError.value?'13':invite.value?'05':current.value.kind==='time'?'19':current.value.kind==='rotation'?'03':'02');
let tipMotion:Animation|undefined;
watch(()=>current.value.tip,()=>{if(!motionAllowed()||!guideBall.value)return;tipMotion?.cancel();tipMotion=guideBall.value.animate([{rotate:'0deg'},{rotate:'-1.2deg',offset:.45},{rotate:'0deg'}],{duration:230,easing:'cubic-bezier(.22,1,.36,1)'});});
let baseline=0,raf=0;
const compact=ref(false),viewportStyle=ref<Record<string,string>>({});
function syncViewport(){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{const v=window.visualViewport;if(!v)return;baseline=Math.max(baseline,window.innerHeight,v.height+v.offsetTop);compact.value=baseline-v.height-v.offsetTop>100;viewportStyle.value={'--wizard-height':`${v.height}px`,'--wizard-top':`${v.offsetTop}px`};});}
function focus(e:FocusEvent){const el=e.target as HTMLInputElement;passwordFocus.value=el.type==='password';if(el.matches('input,textarea')){const r=el.getBoundingClientRect();gaze.value={x:r.x+r.width/2,y:r.y+r.height/2};}}
function blur(){passwordFocus.value=false;gaze.value=undefined;}
onMounted(()=>{syncViewport();window.visualViewport?.addEventListener('resize',syncViewport);window.visualViewport?.addEventListener('scroll',syncViewport);});
const pagesInMotion=new Map<Element,{controls:ReturnType<typeof animate>[];finish:()=>void}>();
function cancelPage(el:Element){const active=pagesInMotion.get(el);if(active){pagesInMotion.delete(el);active.controls.forEach(a=>a.stop());}}
function runPage(el:Element,done:()=>void,entering:boolean){
 cancelPage(el);const nodes=[...el.querySelectorAll<HTMLElement>('[data-enter]')];
 if(entering){el.removeAttribute('aria-hidden');el.removeAttribute('inert');}else{el.setAttribute('aria-hidden','true');el.setAttribute('inert','');}
 let finished=false;const finish=()=>{if(finished)return;finished=true;pagesInMotion.delete(el);done();};
 if(!motionAllowed()||!nodes.length){if(entering)nodes.forEach(n=>{n.style.opacity='1';n.style.transform='none';});finish();return;}
 const state={controls:[] as ReturnType<typeof animate>[],finish};pagesInMotion.set(el,state);let left=nodes.length;
 nodes.forEach((node,i)=>{const a=animate(node,entering?{opacity:[0,1],transform:[`translateY(${i===0?10:10}px) scale(${i===0?1:.985})`,'translateY(0px) scale(1)']}:{opacity:0,transform:`translateX(${-direction.value*5}px) scale(.995)`},entering?{type:'spring',duration:.32,bounce:.08,delay:Math.min(i,5)*.035,onComplete:()=>{if(!--left)finish();}}:{duration:.12,onComplete:()=>{if(!--left)finish();}});state.controls.push(a);});
}
const enter=(el:Element,done:()=>void)=>runPage(el,done,true),leave=(el:Element,done:()=>void)=>runPage(el,done,false);
function quietPages(){if(motionAllowed())return;tipMotion?.cancel();tipMotion=undefined;for(const [el,state]of [...pagesInMotion]){state.controls.forEach(a=>a.stop());el.querySelectorAll<HTMLElement>('[data-enter]').forEach(n=>{n.style.opacity=el.hasAttribute('aria-hidden')?'0':'1';n.style.transform='none';});state.finish();}}
const preference=matchMedia('(prefers-reduced-motion: reduce)');preference.addEventListener('change',quietPages);document.addEventListener('visibilitychange',quietPages);window.addEventListener('ui-motion-change',quietPages);
let finishFlight:ReturnType<typeof animate>|undefined;
watch(()=>props.invite,async(v,old)=>{if(!v||old)return;const first=guideBall.value?.getBoundingClientRect();try{localStorage.removeItem(storageKey);}catch{}await nextTick();const el=guideBall.value,last=el?.getBoundingClientRect();if(!el||!first||!last||!motionAllowed())return;finishFlight=animate(el,{transform:[`translate(${first.x-last.x}px,${first.y-last.y}px) scale(1)`,'translate(0px,0px) scale(.72)']},{type:'spring',duration:.72,bounce:.12});});
async function copyInvite(){if(props.experience){localError.value='本地体验不会生成可用邀请码';return;}try{await navigator.clipboard.writeText(props.invite||'');localError.value='邀请码已复制';}catch{localError.value='复制失败，请长按邀请码复制';}}
function completeWizard(){if(props.invite&&!props.experience){const source=guideBall.value?.querySelector<HTMLElement>('.dorm-companion')??guideBall.value;captureCompanionHandoff(source);}emit('done');}
// Touch tilt owns only new choice surfaces. Cancel on scroll intent; never captures pointer.
let press:{el:HTMLElement;r:DOMRect;x:number;y:number}|null=null;
function pressDown(e:PointerEvent){const el=(e.target as HTMLElement).closest<HTMLElement>('.wizard-choice');if(!el)return;press={el,r:el.getBoundingClientRect(),x:e.clientX,y:e.clientY};el.dataset.pressed='1';tilt(e);}
function tilt(e:PointerEvent){if(!press)return;if(Math.hypot(e.clientX-press.x,e.clientY-press.y)>10){release();return;}if(!motionAllowed())return;const{el,r}=press;el.style.setProperty('--rx',`${-(e.clientY-r.y-r.height/2)/r.height*3}deg`);el.style.setProperty('--ry',`${(e.clientX-r.x-r.width/2)/r.width*3}deg`);}
function release(){if(press){press.el.dataset.pressed='0';press.el.style.setProperty('--rx','0deg');press.el.style.setProperty('--ry','0deg');press=null;}}
function setTime(t:DraftTask,key:'execution_time'|'deadline',v:string[]){t[key]=v.join(':');}
onBeforeUnmount(()=>{cancelAnimationFrame(raf);window.visualViewport?.removeEventListener('resize',syncViewport);window.visualViewport?.removeEventListener('scroll',syncViewport);tipMotion?.cancel();finishFlight?.stop();pagesInMotion.forEach((_,el)=>cancelPage(el));preference.removeEventListener('change',quietPages);document.removeEventListener('visibilitychange',quietPages);window.removeEventListener('ui-motion-change',quietPages);});
</script>
<template><section ref="root" class="dorm-wizard" data-native-scroll :class="{'wizard-complete':!!invite,'is-compact':compact,'is-page-arrangement':!workspace&&current.kind==='pages','is-rules':current.kind==='rules','is-workspace':workspace,'preview-open':previewOpen}" :style="viewportStyle" @focusin="focus" @focusout="blur" @pointerdown="pressDown" @pointermove="tilt" @pointerup="release" @pointercancel="release">
<header class="wizard-guide"><div ref="guideBall" class="guide-ball"><DormCompanion :size="72" :interactive="true" :mood="mood" :gaze-point="gaze" :tips="false"/></div><Transition name="wizard-tip" mode="out-in"><p :key="invite?'完成':current.tip" class="wizard-tip">{{invite?(experience?'本地体验完成，草稿仅保存在本机':'把邀请码分享给室友吧'):current.tip}}</p></Transition><button v-if="workspace" class="wizard-help" aria-label="使用引导" @click="tour=true"><van-icon name="question-o"/></button><button class="wizard-close" aria-label="退出配置" :disabled="busy" @click="emit('cancel')"><van-icon name="cross"/></button></header>
<CreationProgress v-if="!invite&&!workspace" :model-value="index" :labels="steps.map(s=>s.label)" @update:model-value="go"/>
<WizardSteps v-else-if="!invite" :model-value="index" :labels="steps.map(s=>s.label)" :completed="completed" @update:model-value="go"/>
<div class="wizard-body"><template v-if="invite"><h1 class="finish-title">准备好，一起开始</h1><div class="created-summary"><strong>{{enabled.map(t=>t.name).join("、")}}</strong><span>{{experience?'本地草稿体验完成':'任务安排已保存'}}</span></div><div class="invite-result"><span>{{experience?'创建流程体验':'宿舍邀请码'}}</span><strong>{{experience?'已完成':invite}}</strong><p>{{experience?'本机仅保留向导草稿，不会创建宿舍或生成有效邀请码。':'舍友验证邮箱后，填写自己的姓名加入。'}}</p><button v-if="!experience" @click="copyInvite">复制邀请码</button><button class="wizard-primary" @click="completeWizard">{{experience?'退出体验':'开始使用'}}</button></div></template>
<div v-else class="wizard-stage"><Transition :css="false" appear @enter="enter" @leave="leave" @enter-cancelled="cancelPage" @leave-cancelled="cancelPage"><section :key="current.id" class="wizard-step" :data-step="current.kind"><h1 data-enter>{{current.title}}</h1>
<div v-if="current.kind==='name'" class="wizard-fields"><input data-enter v-model="draft.name" aria-label="宿舍名称" placeholder="例如：Y11505" maxlength="64" autocomplete="off"/></div>
<template v-else-if="current.kind==='tasks'"><div v-if="!creationEditTaskKey" data-enter><div class="template-grid"><motion.button v-for="(t,i) in draft.tasks" :key="t.key" layout="position" :transition="motionAllowed()?motionTokens.layout:{duration:0}" class="wizard-choice template-card" :aria-pressed="t.enabled" :class="{selected:t.enabled}" :style="{'--i':i}" @click="toggle(t)"><strong>{{t.name||'自定义任务'}}</strong></motion.button></div><button class="wizard-text add-task" @click="custom">自定义任务</button></div><div v-else class="creation-task-edit" data-enter><button class="wizard-text" @click="creationEditTaskKey=null">‹ 返回任务</button><TaskEditor :key="creationEditTaskKey" :task="draft.tasks.find(t=>t.key===creationEditTaskKey)!"/></div><div v-if="enabled.length" class="creation-task-picks" data-enter aria-label="已添加任务"><button v-for="t in enabled" :key="t.key" :class="{selected:creationEditTaskKey===t.key}" :aria-pressed="creationEditTaskKey===t.key" @click="creationEditTaskKey=creationEditTaskKey===t.key?null:t.key">{{t.name||'未命名任务'}}</button></div><div v-if="!enabled.length" class="empty-guide" data-enter><span>↑</span><p>选一项常用任务，也可以新建。</p></div></template>
<template v-else-if="current.kind==='templates'"><div class="template-grid"><motion.button v-for="(t,i) in draft.tasks" :key="t.key" layout="position" :transition="motionAllowed()?motionTokens.layout:{duration:0}" class="wizard-choice template-card" :aria-pressed="t.enabled" :class="{selected:t.enabled}" data-enter :style="{'--i':i}" @click="toggle(t)"><van-icon :name="t.key==='water'?'fire-o':t.key==='floor'?'brush-o':'home-o'"/><strong>{{t.name||'自定义任务'}}</strong><span>{{t.enabled?'已添加':'点按添加'}}</span></motion.button></div><button data-enter class="wizard-text add-task" @click="custom"><van-icon name="plus"/> 自定义任务</button><p data-enter class="wizard-secondary">当前预览支持四项；名称可自由修改。</p><div v-if="!enabled.length" class="empty-guide" data-enter><span>↑</span><p>点选上方任务，一起开始吧。</p></div></template>
<template v-else-if="current.kind==='list'"><div class="workspace-task-list"><motion.div v-for="t in enabled" :key="t.key" layout="position" :transition="motionAllowed()?motionTokens.layout:{duration:0}" class="workspace-task-row" data-enter><button class="wizard-choice" @click="edit(t)"><strong>{{t.name}}</strong><span>名称 · 页面 · 完成方式</span><van-icon name="arrow"/></button><button class="wizard-text" :aria-label="`删除${t.name}`" @click="selectedTask=t.key;pendingDelete=true">删除</button></motion.div></div><button class="wizard-text" data-enter @click="stepId='templates'">添加任务</button><template v-if="pendingDelete"><div class="delete-confirm" data-enter role="alert"><p>移除后历史记录仍然保留。</p><button @click="remove(draft.tasks.find(t=>t.key===selectedTask)!);pendingDelete=false">移除此任务</button><button @click="pendingDelete=false">取消</button></div></template></template>
<TaskEditor v-else-if="current.kind==='task'" :task="current.task!"/>
<template v-else-if="current.kind==='pages'"><TaskPageBoard :draft="draft" :compact="!workspace"/></template>
<template v-else-if="current.kind==='second'"><button class="wizard-choice policy-option" data-enter :aria-pressed="draft.second_page_kind!=='nudge'" :class="{selected:draft.second_page_kind!=='nudge'}" @click="draft.second_page_kind='tasks'"><strong>任务页</strong><span>查看安排，完成后交接</span></button><button class="wizard-choice policy-option" data-enter :aria-pressed="draft.second_page_kind==='nudge'" :class="{selected:draft.second_page_kind==='nudge'}" @click="draft.second_page_kind='nudge'"><strong>催促页</strong><span>显示负责人，轻点发出提醒</span></button></template>
<template v-else-if="current.kind==='rules'"><template v-if="!rulesAdvanced"><div v-if="ruleTasks.length" class="rule-primary" data-enter><Transition name="wizard-panel"><div v-if="globalPacing==='scheduled'&&ruleTasks.length>1" class="creation-task-picks rule-task-picks" aria-label="选择定时任务"><button v-for="t in ruleTasks" :key="t.key" :class="{selected:selectedRuleTaskKey===t.key}" :aria-pressed="selectedRuleTaskKey===t.key" @click="selectedRuleTaskKey=t.key;ruleTimeField='deadline'">{{t.name}}</button></div></Transition><div class="rule-mode-picks"><button v-for="choice in pacingChoices" :key="choice.mode" class="wizard-choice" :class="{selected:globalPacing===choice.mode}" :aria-pressed="globalPacing===choice.mode" @click="chooseCycle(choice.mode)"><strong>{{choice.title}}</strong><span>{{choice.description}}</span></button></div><div v-if="globalPacing==='scheduled'&&selectedRuleTask" class="rule-time-panel"><div class="time-field-switch" role="group" aria-label="选择任务时间"><button :class="{selected:ruleTimeField==='execution_time'}" @click="ruleTimeField='execution_time'">执行</button><button :class="{selected:ruleTimeField==='deadline'}" @click="ruleTimeField='deadline'">截止</button></div><TimeWheelSetting v-if="ruleTimeField==='execution_time'" v-model="selectedRuleTask.execution_time" label="执行时间" compact/><TimeWheelSetting v-else v-model="selectedRuleTask.deadline" label="截止时间" compact/></div></div><div v-else class="rule-fixed" data-enter><strong>抬水做完后交给下一位</strong></div><button class="wizard-text rule-advanced-toggle" data-enter @click="rulesAdvanced=true">为单项任务调整</button></template><template v-else><button class="wizard-text rule-advanced-toggle" data-enter @click="rulesAdvanced=false">‹ 使用统一方式</button><div v-if="enabled.length" class="creation-task-picks rule-task-picks" data-enter aria-label="选择任务"><button v-for="t in enabled" :key="t.key" :class="{selected:selectedRuleTaskKey===t.key}" :aria-pressed="selectedRuleTaskKey===t.key" @click="selectedRuleTaskKey=t.key;ruleTimeField='deadline';ruleFacet='rotation'">{{t.name}}</button></div><Transition name="wizard-panel">
  <div v-if="selectedRuleTask" class="rule-detail" data-enter>
    <header><strong>{{selectedRuleTask.name}}</strong></header>
    <div class="rule-facets" role="tablist" aria-label="任务设置">
      <button type="button" role="tab" :aria-selected="ruleFacet==='rotation'" :class="{selected:ruleFacet==='rotation'}" @click="ruleFacet='rotation'">轮换</button>
      <button type="button" role="tab" :aria-selected="ruleFacet==='timing'" :class="{selected:ruleFacet==='timing'}" @click="ruleFacet='timing'">时间</button>
    </div>
    <div v-if="ruleFacet==='rotation'">
      <div v-if="selectedRuleTask.key!=='water'" class="rule-rotation">
        <button v-for="choice in pacingChoices" :key="choice.mode" class="wizard-choice" :class="{selected:selectedRuleTask.rotation===(choice.mode==='scheduled'?'rotation':choice.mode)}" :aria-pressed="selectedRuleTask.rotation===(choice.mode==='scheduled'?'rotation':choice.mode)" @click="setTaskCycle(selectedRuleTask,choice.mode)"><strong>{{choice.title}}</strong><span>{{choice.description}}</span></button>
      </div>
      <div v-else class="rule-fixed"><strong>做完交给下一位</strong><span>完成后轮到下一位</span></div>
    </div>
    <div v-else class="rule-timing">
      <div class="rule-override">
        <button v-for="mode in ['inherit','soft','hard']" :key="mode" class="wizard-choice" :class="{selected:(selectedRuleTask.policy||'inherit')===mode}" :aria-pressed="(selectedRuleTask.policy||'inherit')===mode" @click="selectedRuleTask.policy=mode as any">{{mode==='inherit'?'跟随宿舍':mode==='soft'?'只作提示':'按时间完成'}}</button>
      </div>
      <div v-if="selectedRuleTask.key!=='water'&&(hard(selectedRuleTask)||selectedRuleTask.rotation==='rotation')" class="rule-time-panel">
        <div class="time-field-switch" role="group" aria-label="选择时间">
          <button :class="{selected:ruleTimeField==='execution_time'}" @click="ruleTimeField='execution_time'">执行</button>
          <button :class="{selected:ruleTimeField==='deadline'}" @click="ruleTimeField='deadline'">截止</button>
        </div>
        <TimeWheelSetting v-if="ruleTimeField==='execution_time'" v-model="selectedRuleTask.execution_time" label="执行时间" compact/>
        <TimeWheelSetting v-else v-model="selectedRuleTask.deadline" label="截止时间" compact/>
      </div>
    </div>
  </div>
</Transition></template></template>
<template v-else-if="current.kind==='policy'||current.kind==='task-policy'"><button v-for="mode in (current.kind==='task-policy'?['inherit','soft','hard']:['soft','hard'])" :key="mode" data-enter class="wizard-choice policy-option" :aria-pressed="(current.task?.policy||draft.policy)===mode" :class="{selected:(current.task?.policy||draft.policy)===mode}" @click="current.task?current.task.policy=mode as any:draft.policy=mode as any"><strong>{{mode==='inherit'?'跟随宿舍':mode==='soft'?'只作提示':'按时间完成'}}</strong><span>{{mode==='inherit'?'使用宿舍的统一模式':mode==='soft'?'只作提示，按你们的节奏完成':'设定时间完成，允许室友代做'}}</span></button><button v-if="current.kind==='policy'" data-enter class="wizard-text" :aria-expanded="advanced" @click="advanced=!advanced">{{advanced?'收起独立模式':'为不同任务单独设置 ›'}}</button></template>
<template v-else-if="current.kind==='time'"><div class="wizard-times time-step" data-enter><div class="time-field-switch" role="group" aria-label="选择时间"><button :class="{selected:workspaceTimeField==='execution_time'}" @click="workspaceTimeField='execution_time'">执行时间</button><button :class="{selected:workspaceTimeField==='deadline'}" @click="workspaceTimeField='deadline'">截止时间</button></div><TimeWheelSetting v-if="workspaceTimeField==='execution_time'" v-model="current.task!.execution_time" label="执行时间" compact/><TimeWheelSetting v-else v-model="current.task!.deadline" label="截止时间" compact/></div></template>
<template v-else-if="current.kind==='rotation'"><template v-if="current.task!.key!=='water'"><div class="rotation-choice-cards"><button data-enter class="wizard-choice" :class="{selected:current.task!.rotation==='round'}" :aria-pressed="current.task!.rotation==='round'" @click="setTaskCycle(current.task!,'round')"><strong>大家做完再开始下一轮</strong></button><button data-enter class="wizard-choice" :class="{selected:current.task!.rotation==='rotation'}" :aria-pressed="current.task!.rotation==='rotation'" @click="setTaskCycle(current.task!,'scheduled')"><strong>按时间安排</strong></button><button data-enter class="wizard-choice" :class="{selected:current.task!.rotation==='completion'}" :aria-pressed="current.task!.rotation==='completion'" @click="setTaskCycle(current.task!,'completion')"><strong>做完交给下一位</strong></button></div></template><button v-else class="wizard-choice policy-option selected" data-enter aria-pressed="true"><strong>做完交给下一位</strong></button><button v-if="workspace" data-enter class="wizard-text" @click="emit('order')">查看轮换顺序 ›</button></template>
<div v-else-if="current.kind==='preview'" class="preview-step" data-enter><p>使用正式页面组件查看这份草稿。</p><button class="wizard-primary" data-testid="open-live-preview" @click="openPreview">打开实时预览</button></div>
</section></Transition></div><Transition name="wizard-tip"><p v-if="localError||error" class="wizard-error" role="alert">{{localError||error}}</p></Transition></div>
<footer v-if="!invite" class="wizard-footer"><button class="wizard-text" :disabled="index===0||busy" @click="go(index-1)">上一步</button><button v-if="current.kind!=='preview'" class="wizard-primary" :disabled="busy" @click="proceed">继续</button><button v-else class="wizard-primary" :disabled="busy" @click="submit">{{busy?'正在保存…':experience?'完成体验':workspace?'保存设置':'确认创建'}}</button><button v-if="current.kind!=='preview'" class="wizard-text" @click="workspace?go(steps.length-1):openPreview()">预览</button></footer>
<SpotlightTour v-if="tour" :steps="tourSteps" @done="tourDone"/><LiveDraftPreview v-if="previewMounted" :draft="draft" :open="previewOpen" @close="previewOpen=false"/></section></template>
<style scoped>
.dorm-wizard{--wizard-height:100dvh;position:fixed;inset-inline:0;top:var(--wizard-top,0px);height:var(--wizard-height);z-index:200;max-width:540px;margin:auto;box-sizing:border-box;padding:calc(16px + env(safe-area-inset-top,0px)) 24px 0;display:flex;flex-direction:column;min-width:0;background:var(--canvas);color:var(--ink);--step-duration:320ms;--step-ease:cubic-bezier(.22,1,.36,1)}.wizard-guide{position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;flex:0 0 126px;padding-top:8px;box-sizing:border-box;transition:flex-basis 260ms var(--step-ease)}.guide-ball{width:72px;height:72px;flex-shrink:0;transform-origin:center top;transition:transform 280ms var(--step-ease)}.wizard-tip{margin:0;font-size:13px;line-height:1.5;color:var(--muted);text-align:center;max-width:90%;min-height:20px}.wizard-help,.wizard-close{position:absolute;top:8px;width:44px;height:44px;border:0;background:none;color:var(--muted);font-size:20px;border-radius:50%}.wizard-help{left:-8px}.wizard-close{right:-8px}.wizard-body{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain;scrollbar-width:none;padding:32px 3px 24px;margin-inline:-3px;overflow-x:hidden}.wizard-body::-webkit-scrollbar{display:none}.wizard-stage{display:grid;align-items:start;min-width:0}.wizard-step{grid-area:1/1;min-width:0}.wizard-step.v-leave-active{pointer-events:none}.wizard-body h1{font-size:32px;font-weight:700;line-height:1.2;letter-spacing:-.025em;margin:0 0 40px;text-wrap:balance}.wizard-fields{display:grid;gap:32px}.wizard-fields label{display:grid;gap:12px;font-size:14px;color:var(--muted)}.wizard-fields input{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--line);border-radius:20px;padding:20px;color:var(--ink);background:color-mix(in srgb,var(--canvas) 94%,transparent);font:inherit;font-size:22px;line-height:1.5;transition:transform 240ms var(--step-ease),box-shadow 240ms}.wizard-fields input:focus{transform:scale(1.01);outline:none;box-shadow:inset 0 1px 2px #ffffff50,0 0 0 2px color-mix(in srgb,var(--ink) 12%,transparent)}.wizard-fields input:focus-visible{outline:2px solid var(--ink);outline-offset:4px}.wizard-footer{flex-shrink:0;display:flex;align-items:center;gap:20px;padding:20px 0 calc(16px + env(safe-area-inset-bottom,0px));background:var(--canvas)}button{font:inherit;cursor:pointer}.wizard-primary{flex:1;border:0;border-radius:28px;min-height:54px;padding:14px 24px;background:var(--ink);color:var(--canvas);font-weight:600}.wizard-text{border:0;background:none;color:var(--muted);padding:12px 0;font-size:14px;min-height:44px}.dorm-wizard button{transition:transform 260ms var(--step-ease),opacity 180ms}.dorm-wizard button:active:not(:disabled):not(.wizard-choice){transform:scale(.97)}button:disabled{opacity:.4}.wizard-choice{transform:perspective(700px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));background:var(--canvas);color:var(--ink);border:1px solid var(--line);border-radius:24px}.wizard-choice[data-pressed='1']{transform:perspective(700px) translateY(2px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) scale(.992);transition:transform 100ms var(--step-ease)}.wizard-choice.selected{background:color-mix(in srgb,var(--ink) 5%,var(--canvas));box-shadow:inset 0 0 0 1px var(--ink)}.template-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.template-card{display:grid;justify-items:start;gap:16px;padding:24px 20px;text-align:left;min-height:160px}.template-card .van-icon{font-size:24px}.template-card strong{font-size:20px}.template-card span{font-size:13px;color:var(--muted)}.add-task{margin-block:16px}.policy-option{display:grid;width:100%;gap:12px;text-align:left;padding:28px 24px;margin-bottom:20px;min-height:124px}.policy-option strong{font-size:26px}.policy-option span{font-size:14px;color:var(--muted);line-height:1.5}.wizard-secondary{font-size:13px;color:var(--muted);line-height:1.6;margin:20px 0 0}.wizard-error{padding:16px;border:1px solid var(--line);border-radius:16px;font-size:14px;line-height:1.5}.wizard-times{display:grid;gap:32px}.wizard-times>div{min-width:0}.wizard-times p{font-size:14px;color:var(--muted);margin:0 0 12px}.wizard-times :deep(.van-picker){background:transparent}.wizard-times :deep(.van-picker-column__item){font-size:30px;font-variant-numeric:tabular-nums}.wizard-times :deep(.van-picker__mask){background-image:linear-gradient(180deg,var(--canvas),transparent),linear-gradient(0deg,var(--canvas),transparent)}.workspace-task-list{display:grid;gap:16px}.workspace-task-row{display:flex;gap:12px;align-items:center}.workspace-task-row>.wizard-choice{flex:1;min-width:0;display:grid;grid-template-columns:1fr auto;text-align:left;gap:8px;padding:20px}.workspace-task-row strong{font-size:22px}.workspace-task-row span{font-size:12px;color:var(--muted);grid-column:1}.workspace-task-row .van-icon{grid-column:2;grid-row:1/3;align-self:center}.delete-confirm{padding:20px;border:1px solid var(--line);border-radius:20px}.delete-confirm button{padding:12px;background:none;color:var(--ink);border:0}.empty-guide{display:grid;justify-items:center;color:var(--muted);font-size:14px}.empty-guide>span{font-size:28px}.wizard-tip-enter-active,.wizard-tip-leave-active{transition:transform 180ms var(--step-ease),opacity 160ms}.wizard-tip-enter-from{opacity:0;transform:translateY(4px)}.wizard-tip-leave-to{opacity:0;transform:translateY(-4px)}.is-compact .wizard-guide{flex-basis:86px}.is-compact .guide-ball{transform:scale(.72)}.is-compact .wizard-tip{transform:translateY(-18px);font-size:12px}.is-compact .wizard-body{padding-top:20px}.is-compact .wizard-body h1{margin-bottom:24px;font-size:28px}.wizard-complete .wizard-guide{align-items:flex-start;flex-direction:row;flex-basis:84px;gap:4px}.wizard-complete .guide-ball{transform:scale(.72);transform-origin:left center}.wizard-complete .wizard-tip{align-self:center}.wizard-complete .wizard-help{left:auto;right:44px;top:56px}.wizard-complete .wizard-close{top:56px}.finish-title{animation:finish-arrive 320ms var(--step-ease) 80ms both}.invite-result{display:grid;gap:16px;text-align:center;padding:32px 0;animation:finish-arrive 360ms var(--step-ease) 430ms both}.invite-result>span,.invite-result p{font-size:13px;color:var(--muted);margin:0}.invite-result>strong{font-size:36px;letter-spacing:.14em}.invite-result>button:not(.wizard-primary){border:0;background:none;color:var(--ink);min-height:44px}.created-summary{display:grid;gap:8px;padding:18px 20px;border:1px solid var(--line);border-radius:20px}.created-summary strong{font-size:20px}.created-summary span{font-size:13px;color:var(--muted)}.preview-step{display:grid;gap:18px}.preview-step p{margin:0;color:var(--muted);font-size:15px}.preview-open{visibility:hidden;pointer-events:none}@keyframes finish-arrive{from{opacity:0;transform:translateY(14px) scale(.985)}}@media(max-width:350px){.dorm-wizard{padding-inline:16px}.wizard-body h1{font-size:28px}.template-card{padding:20px 16px}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.wizard-choice{transform:none!important}}
</style>



<style scoped>
.dorm-wizard .wizard-body h1 {
  font-size: 34px;
}
.dorm-wizard .wizard-fields input {
  -webkit-appearance: none;
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
  outline: none;
  box-shadow: none;
  transform-origin: center;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 220ms var(--step-ease),
    border-color 180ms ease-out,
    box-shadow 180ms ease-out;
}
.dorm-wizard .wizard-fields input:focus {
  transform: scale(1.004);
  border-color: color-mix(in srgb, var(--ink) 22%, var(--line));
  outline: none;
  box-shadow: none;
}
.dorm-wizard .wizard-fields input:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--ink) 28%, var(--line));
  box-shadow: none;
}
.dorm-wizard .wizard-footer .wizard-text {
  min-width: 52px;
  min-height: 48px;
  padding: 12px 4px;
  touch-action: manipulation;
}
.dorm-wizard .wizard-footer .wizard-primary {
  min-height: 54px;
  touch-action: manipulation;
}
.dorm-wizard .wizard-body h1,
.dorm-wizard.is-compact .wizard-body h1 {
  font-size: 34px;
}
.dorm-wizard.is-compact .wizard-body h1 {
  font-size: 30px;
}
.guide-ball {
  will-change: rotate;
}
@media (max-width: 350px) {
  .dorm-wizard .wizard-body h1,
  .dorm-wizard.is-compact .wizard-body h1 {
    font-size: 30px;
  }
}
</style>

<style scoped>
.creation-task-edit{display:grid;gap:16px}
.creation-task-picks{display:flex;gap:8px;overflow:auto hidden;scrollbar-width:none;margin:24px 0 0;padding:2px 1px 6px}
.creation-task-picks::-webkit-scrollbar{display:none}
.creation-task-picks button{flex:0 0 auto;min-height:42px;padding:9px 14px;border:1px solid var(--line);border-radius:999px;background:color-mix(in srgb,var(--canvas) 92%,transparent);color:var(--muted);font-size:13px}
.creation-task-picks button.selected{color:var(--ink);border-color:var(--ink);background:color-mix(in srgb,var(--ink) 5%,var(--canvas))}
.creation-task-picks button span{margin-left:8px;font-size:11px;opacity:.7}
.rule-primary{display:grid;gap:8px}
.rule-mode-picks{display:grid;gap:8px}
.rule-mode-picks .wizard-choice{display:flex;align-items:center;min-height:56px;padding:14px 18px;text-align:left}
.rule-mode-picks strong{font-size:18px}
.rule-mode-picks span{font-size:13px;color:var(--muted)}
.rule-task-picks{margin-top:18px}
.rule-primary .rule-task-picks{margin:0 0 8px}
.rule-detail{margin-top:18px;padding:18px;border:1px solid var(--line);border-radius:22px}
.rule-detail>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.rule-detail>header strong{font-size:20px}
.rule-override{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.rule-override .wizard-choice{min-height:44px}
.rule-facets{display:flex;gap:8px;margin:18px 0 8px;padding:4px;border-radius:999px;background:color-mix(in srgb,var(--ink) 6%,var(--canvas))}
.rule-facets button{flex:1;min-height:38px;border:0;border-radius:999px;background:transparent;color:var(--muted)}
.rule-facets button.selected{background:var(--canvas);color:var(--ink);box-shadow:0 1px 3px #0002}
.rule-rotation{display:grid;gap:10px;margin-top:14px}
.rule-rotation .wizard-choice{display:grid;gap:6px;padding:16px;text-align:left}
.rule-rotation strong,.rule-fixed strong{font-size:17px}
.rule-rotation span,.rule-fixed span{font-size:12px;color:var(--muted)}
.rule-fixed{display:grid;gap:6px;padding:16px;margin-top:14px;border-radius:16px;background:color-mix(in srgb,var(--ink) 4%,var(--canvas))}
</style>

<style scoped>
.dorm-wizard.is-page-arrangement .wizard-guide {
  flex-basis: 98px;
  gap: 4px;
  padding-top: 0;
}
.dorm-wizard.is-page-arrangement .guide-ball {
  transform: scale(.7);
  transform-origin: center top;
}
.dorm-wizard.is-page-arrangement .wizard-tip {
  min-height: 18px;
  font-size: 12px;
}
.dorm-wizard.is-page-arrangement .wizard-body {
  padding-top: 16px;
  padding-bottom: 10px;
}
.dorm-wizard.is-page-arrangement .wizard-body h1 {
  margin-bottom: 18px;
}
.dorm-wizard.is-page-arrangement .wizard-footer {
  padding-top: 12px;
}
@media (max-height: 700px) {
  .dorm-wizard.is-page-arrangement .wizard-guide { flex-basis: 84px; }
  .dorm-wizard.is-page-arrangement .wizard-body { padding-top: 10px; }
  .dorm-wizard.is-page-arrangement .wizard-body h1 { margin-bottom: 14px; }
  .dorm-wizard.is-page-arrangement .wizard-footer { padding-top: 8px; }
}
</style>

<style scoped>
.dorm-wizard:not(.is-workspace) .wizard-step[data-step="tasks"] h1,
.dorm-wizard:not(.is-workspace) .wizard-step[data-step="rules"] h1 {
  margin-bottom: 24px;
}
.dorm-wizard:not(.is-workspace) .template-grid {
  gap: 10px;
}
.dorm-wizard:not(.is-workspace) .template-card {
  min-height: 92px;
  gap: 8px;
  padding: 14px 16px;
}
.dorm-wizard:not(.is-workspace) .template-card strong {
  font-size: 17px;
}
.dorm-wizard:not(.is-workspace) .template-card .van-icon,
.dorm-wizard:not(.is-workspace) .template-card span {
  display: none;
}
.dorm-wizard:not(.is-workspace) .add-task {
  margin-block: 6px 0;
}
.creation-task-picks button span {
  display: none;
}
.rule-mode-picks {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.rule-mode-picks .wizard-choice {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 1px;
  min-height: 68px;
  padding: 6px 8px;
  text-align: center;
}
.dorm-wizard:not(.is-workspace) .rule-mode-picks > .wizard-choice:last-child:nth-child(odd) {
  grid-column: 1 / -1;
  justify-self: center;
  width: 100%;
  max-width: calc((100% - 10px) / 2);
  box-sizing: border-box;
}
.rule-mode-picks strong {
  font-size: 16px;
  line-height: 1.2;
}
.rule-mode-picks span {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.2;
}
.rule-advanced-toggle {
  margin-top: 8px;
}
.rule-task-picks {
  margin-top: 10px;
}
.rule-task-picks button {
  min-height: 40px;
  padding-inline: 14px;
}
.rule-detail {
  margin-top: 8px;
  padding: 8px 10px;
}
.rule-detail > header {
  margin-bottom: 5px;
}
.rule-detail > header strong {
  font-size: 17px;
}
.rule-override {
  gap: 6px;
}
.rule-override .wizard-choice {
  min-height: 36px;
  padding: 5px 3px;
  border-radius: 14px;
  font-size: 12px;
  white-space: nowrap;
}
.rule-facets {
  margin: 6px 0 0;
}
.rule-time-panel {
  display: grid;
  justify-items: center;
  gap: 2px;
  margin-top: 4px;
}
.time-field-switch {
  display: flex;
  width: min(100%, 280px);
  gap: 4px;
  padding: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 6%, var(--canvas));
}
.time-field-switch button {
  flex: 1;
  min-width: 0;
  min-height: 36px;
  padding: 6px 10px;
  border: 0;
  border-radius: 999px;
  color: var(--muted);
  background: transparent;
  font: inherit;
  font-size: 14px;
  transition: color 180ms ease-out, background-color 180ms ease-out, transform 220ms var(--step-ease);
}
.time-field-switch button.selected {
  color: var(--ink);
  background: var(--canvas);
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
}
.rule-time-panel :deep(.time-wheel-setting > span) {
  display: none;
}
.rule-time-panel :deep(.time-wheel-setting > strong) {
  font-size: 30px;
}
.rule-time-panel :deep(.time-wheel-setting .van-picker) {
  margin-top: 0;
}
.rule-rotation,
.rotation-choice-cards {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.rule-rotation .wizard-choice,
.rotation-choice-cards .wizard-choice {
  min-height: 58px;
  padding: 10px 8px;
  justify-items: center;
  text-align: center;
}
.rule-rotation .wizard-choice {
  gap: 3px;
  min-height: 64px;
  padding: 8px 7px;
}
.rule-rotation strong,
.rotation-choice-cards strong {
  font-size: 15px;
}
.rule-rotation strong {
  font-size: 14px;
  line-height: 1.2;
}
.rule-rotation span {
  font-size: 11px;
  line-height: 1.2;
}
.rule-fixed {
  margin-top: 10px;
  padding: 12px;
  text-align: center;
}
.time-step {
  justify-items: center;
  gap: 12px;
}
.time-step .time-field-switch {
  width: 100%;
  max-width: 340px;
}
.time-step :deep(.time-wheel-setting) {
  width: 100%;
  max-width: 340px;
}
.dorm-wizard.is-rules .wizard-body {
  padding-top: 14px;
  padding-bottom: 8px;
}
.dorm-wizard.is-rules .wizard-body h1 {
  margin-bottom: 16px;
}
.wizard-panel-enter-active,
.wizard-panel-leave-active {
  transition: opacity 180ms ease-out, transform 240ms var(--step-ease);
}
.wizard-panel-enter-from,
.wizard-panel-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(.99);
}
@media (max-height: 700px) {
  .dorm-wizard:not(.is-workspace) .wizard-step[data-step="tasks"] h1,
  .dorm-wizard:not(.is-workspace) .wizard-step[data-step="rules"] h1 {
    margin-bottom: 18px;
  }
  .dorm-wizard:not(.is-workspace) .template-card {
    min-height: 78px;
  }
  .rule-detail {
    padding: 7px 8px;
  }
  .dorm-wizard.is-rules .wizard-body { padding-top: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .time-field-switch button,
  .wizard-panel-enter-active,
  .wizard-panel-leave-active {
    transition: none !important;
  }
}
</style>
