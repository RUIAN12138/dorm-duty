<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { animate } from 'motion-v';
import { motionAllowed, motionTokens } from '../../interaction/motion';
const props=defineProps<{modelValue:number;labels:string[];completed:number[]}>();
const emit=defineEmits<{'update:modelValue':[number]}>();
const host=ref<HTMLElement>(), thumb=ref<HTMLElement>(), fill=ref<HTMLElement>();
let position=0, flight:ReturnType<typeof animate>|undefined;
let gesture:{id:number;x:number;y:number;drag:boolean;rect:DOMRect;origin:number}|null=null;
let suppress=0;
const bound=(n:number)=>Math.max(0,Math.min(props.labels.length-1,n));
function paint(n:number){position=n;const width=host.value?.clientWidth||1;const x=12+(width-24)*n/Math.max(1,props.labels.length-1);if(thumb.value)thumb.value.style.transform=`translateX(${x-18}px) scale(${gesture?.drag?1.1:1})`;if(fill.value)fill.value.style.transform=`scaleX(${n/Math.max(1,props.labels.length-1)})`;}
function settle(n:number){flight?.stop(); if(!motionAllowed())return paint(n); flight=animate(position,n,{...motionTokens.selection,onUpdate:paint});}
watch(()=>[props.modelValue,props.labels.length],async()=>{await nextTick();if(!gesture?.drag)settle(props.modelValue)},{immediate:true});
function down(e:PointerEvent){if(e.button!==0||gesture)return;flight?.stop();gesture={id:e.pointerId,x:e.clientX,y:e.clientY,drag:false,rect:host.value!.getBoundingClientRect(),origin:props.modelValue};}
function move(e:PointerEvent){if(!gesture||e.pointerId!==gesture.id)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(!gesture.drag&&Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){cancel();return;}if(!gesture.drag&&Math.abs(dx)<6)return;gesture.drag=true;host.value?.setPointerCapture(e.pointerId);e.preventDefault();paint(bound((e.clientX-gesture.rect.left-12)/(gesture.rect.width-24)*(props.labels.length-1)));}
function up(){if(!gesture)return;const was=gesture.drag;gesture=null;if(was){suppress=performance.now()+400;const n=bound(Math.round(position));emit('update:modelValue',n);settle(n);}}
function cancel(){gesture=null;settle(props.modelValue);}
function tap(n:number){if(performance.now()>suppress){emit('update:modelValue',n);settle(n);}}
onBeforeUnmount(()=>flight?.stop());
</script>
<template><nav ref="host" class="wizard-steps" aria-label="创建步骤" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel">
<div class="step-track"><i ref="fill"/></div><div ref="thumb" class="step-glass" aria-hidden="true"/>
<button v-for="(label,i) in labels" :key="`${i}-${label}`" :style="{left:`calc(12px + (100% - 24px) * ${i} / ${Math.max(1,labels.length-1)})`}" :aria-label="`${i+1} ${label}`" :title="label" :aria-current="modelValue===i?'step':undefined" :class="{current:modelValue===i,done:completed.includes(i)}" @click="tap(i)"><span>{{completed.includes(i)&&modelValue!==i?'✓':i+1}}</span></button>
</nav><p class="step-caption" aria-live="polite">{{modelValue+1}} / {{labels.length}} · {{labels[modelValue]}}</p></template>
<style scoped>
.wizard-steps{position:relative;display:flex;justify-content:space-between;align-items:center;width:100%;height:44px;flex:0 0 44px;touch-action:pan-y;isolation:isolate;user-select:none;-webkit-user-select:none}.step-track{position:absolute;left:12px;right:12px;height:1px;background:var(--line);z-index:-2}.step-track i{display:block;width:100%;height:100%;background:var(--ink);transform-origin:left;transform:scaleX(0)}.step-glass{position:absolute;left:0;top:4px;width:36px;height:36px;border-radius:50%;background:color-mix(in srgb,var(--canvas) 68%,transparent);border:1px solid var(--line);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:inset 0 1px 2px #ffffff65;z-index:-1;pointer-events:none}.wizard-steps button{position:absolute;width:24px;min-width:0;height:44px;margin-left:-12px;border:0;background:none;color:var(--muted);padding:0;font-size:10px;transition:transform 220ms var(--ui-ease-out),color 180ms}.wizard-steps button.current{color:var(--ink);font-weight:700}.wizard-steps button:active{transform:scale(.94)}.step-caption{font-size:12px;color:var(--muted);margin:4px 0 0;flex-shrink:0;font-variant-numeric:tabular-nums}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
