<script setup lang="ts">
import { animate } from "motion-v";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ChoreBoardData, ChoreTask } from "../../api/chores";
import TaskTitle from "../TaskTitle.vue";
import WaterNudge from "../WaterNudge.vue";
import WaterHandoffName from "../WaterHandoffName.vue";
import CompletionAction from "../CompletionAction.vue";
import { createTaskSwipe } from "../../interaction/taskSwipe";
import { motionAllowed } from "../../interaction/motion";
const props = defineProps<{ board: ChoreBoardData; scope: string; busy: boolean; statuses: Record<number,string>; receipt?: ChoreTask | null; demo?: boolean; selectedKey?: string; handoffActive?: boolean }>();
const emit = defineEmits<{ nudge:[ChoreTask]; details:[ChoreTask,MouseEvent]; complete:[ChoreTask]; undo:[ChoreTask]; hint:[string]; select:[ChoreTask | undefined] }>();
const key = ref(props.selectedKey || "water"), direction = ref(1), dragging = ref(false), moving = ref(false);
const strip = ref<HTMLElement>(), peekWord = ref<HTMLElement>(), surface = ref<HTMLElement>();
const selectedPeople = ref<Record<string,number>>({});
const groups = computed(() => {
  const source = props.board.nudge_tasks || props.board.workspace_tasks || [...props.board.today_tasks, ...(props.board.water_task ? [props.board.water_task] : [])];
  const ordered = props.board.configuration?.tasks || props.board.categories;
  return ordered.filter(category => category.enabled).map(category => {
    const list = source.filter(task => task.key === category.key);
    const candidates = list.filter(task => task.status === "pending")
      .filter((task, i, all) => all.findIndex(item => item.assignee_id === task.assignee_id) === i);
    const task = candidates.find(item => item.assignee_id === selectedPeople.value[category.key])
      || list.find(item => item.status === "pending") || list[0];
    return { key:category.key, name:category.name, task, candidates };
  }).filter(group => group.task).sort((a,b) => Number(b.key === 'water') - Number(a.key === 'water'));
});
const index = computed(() => Math.max(0,groups.value.findIndex(group => group.key === key.value)));
const active = computed(() => groups.value[index.value]);
const neighbor = computed(() => groups.value[index.value+1] || groups.value[index.value-1]);
const neighborSide = computed(() => index.value+1 < groups.value.length ? 1 : -1);
const caption = computed(() => active.value?.task?.assignee_id === props.board.member.user_id
  ? active.value.key === "water" ? "没水时轮到你：" : "这项任务轮到你："
  : `${active.value?.name || "任务"}轮到：`);
const heroSize = computed(() => {
  const task = active.value?.task;
  const text = task?.assignee_id === props.board.member.user_id ? active.value?.name || "" : task?.assignee_name || "";
  return Array.from(text).length>16 ? "clamp(20px,5.2vw,24px)" : Array.from(text).length>8 ? "clamp(30px,9vw,40px)" : undefined;
});
const hints = computed(() => ["点一下名字，轻轻提醒", ...((active.value?.candidates.length || 0) > 1 ? ["上滑大字，换个人提醒"] : []), ...(groups.value.length > 1 ? ["左右滑动，看看其他任务"] : []), "轻轻敲一下，让室友知道"]);
const hintIndex = ref(0);
const currentStatus = computed(() => active.value?.task ? props.statuses[active.value.task.id] ||
  (active.value.task.status === "completed" ? "这项任务已完成" : hints.value[hintIndex.value % hints.value.length]) : "");
let hintTimer: ReturnType<typeof setInterval> | undefined;
let flight: ReturnType<typeof animate> | undefined, revision = 0, position = 0, grabbedAt = 0, discovered = false, discoveryMoving = false, resumeDiscovery = false;
let gestureAxis: "horizontal" | "vertical" = "horizontal";
function paint(value: number) {
  position = value;
  const stretch = motionAllowed() ? Math.min(1, Math.abs(value) / 28) : 0;
  const sx = 1 + stretch * .035, sy = 1 - stretch * .025;
  if (strip.value) strip.value.style.transform = gestureAxis === "vertical" ? `translate3d(0,${value}px,0) scale(${sy},${sx})` : `translate3d(${value}px,0,0) scale(${sx},${sy})`;
  if (peekWord.value) peekWord.value.style.transform = gestureAxis === "vertical" ? `translate3d(0,-50%,0)` : `translate3d(${value}px,-50%,0) scale(${sx},${sy})`;
}
function stopFlight() { revision++; flight?.stop(); flight=undefined;moving.value=false;discoveryMoving=false; }
function settle(target = 0, done?: () => void, discovery = false) {
  stopFlight();
  if (!motionAllowed()) { paint(0); return; }
  const id = revision;
  moving.value=true;discoveryMoving=discovery;
  flight = animate(position, target, { type:"spring", stiffness:380,damping:23,mass:.65,restDelta:.02,restSpeed:.2,
    onUpdate:paint, onComplete:() => { if (id!==revision) return; flight=undefined;moving.value=false;discoveryMoving=false;paint(target);done?.(); } });
}
function step(delta: -1|1) {
  resumeDiscovery=false;completionObserver?.disconnect();completionObserver=undefined;
  const group = groups.value[index.value+delta];
  if (group) { direction.value=delta; key.value=group.key; }
}
function stepPerson(delta: -1 | 1) {
  const group = active.value;
  if (!group) { emit('hint', '暂时无法切换，请稍后再试。'); return; }
  if (group.candidates.length < 2) {
    emit('hint', group.candidates.length === 1 ? '只有这位同学还未值日哦' : '目前没有待提醒的同学。');
    return;
  }
  const current = group.candidates.findIndex(task => task.id === group.task?.id);
  const next = group.candidates[(current + delta + group.candidates.length) % group.candidates.length];
  if (next) selectedPeople.value = { ...selectedPeople.value, [group.key]: next.assignee_id };
  else emit('hint', '暂时无法切换，请稍后再试。');
}
const swipe = createTaskSwipe((value,isDragging,axis) => {
  dragging.value=isDragging;
  if (isDragging) { gestureAxis=axis || "horizontal";stopFlight();paint(motionAllowed() ? grabbedAt + value : 0); }
  else settle();
},step,{enabled:()=> true,step:stepPerson});
function captureClick(event: MouseEvent) {
  if (swipe.suppressesClick(event)) { event.preventDefault();event.stopImmediatePropagation(); }
}
function press(event: PointerEvent) {
  if (!event.isPrimary || event.button!==0) return;
  resumeDiscovery=false;completionObserver?.disconnect();completionObserver=undefined;
  stopFlight();grabbedAt=position;swipe.down(event);
}
watch(() => active.value?.task, task => emit('select',task),{immediate:true});
async function discover() {
  if (discovered || groups.value.length<2 || !surface.value) return;
  discovered=true;
  gestureAxis="horizontal";
  emit('hint',(active.value?.candidates.length || 0) > 1 ? '左右换任务，上下换负责人。' : '左右滑动大字，换个任务催促。');
  await nextTick();
  if (!motionAllowed() || !strip.value || dragging.value) return;
  settle(-neighborSide.value*28,() => settle(0,undefined,true),true);
}
let completionObserver: MutationObserver | undefined;
function interruptDiscovery(event: PointerEvent) {
  const button = event.target instanceof Element ? event.target.closest('.completion-surface') : null;
  if (!button || !discoveryMoving) return;
  stopFlight();resumeDiscovery=true;
  completionObserver?.disconnect();
  completionObserver=new MutationObserver(() => { void resumeWhenIdle(); });
  completionObserver.observe(button.closest('.nudge-pane')!,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-busy']});
}
async function resumeWhenIdle() {
  await nextTick();
  if (!resumeDiscovery || props.busy || surface.value?.closest('.nudge-pane')?.querySelector('.completion-surface.is-round, .handoff-name[aria-busy="true"]')) return;
  resumeDiscovery=false;completionObserver?.disconnect();completionObserver=undefined;settle();
}
function releaseCompletionPointer() { requestAnimationFrame(() => { void resumeWhenIdle(); }); }
watch(() => props.busy, busy => { if (!busy) void resumeWhenIdle(); });
let observer: IntersectionObserver | undefined;
onMounted(() => { hintTimer=setInterval(() => { if (!document.hidden && !props.statuses[active.value?.task?.id || 0]) hintIndex.value=(hintIndex.value+1)%hints.value.length; }, 6500); observer=new IntersectionObserver(entries => { if(entries.some(entry => entry.isIntersecting)) void discover(); });if(surface.value)observer.observe(surface.value); });
watch(() => groups.value.length,() => { if(surface.value?.getBoundingClientRect().width) void discover(); });
function quiet(){if(!motionAllowed()){resumeDiscovery=false;completionObserver?.disconnect();completionObserver=undefined;stopFlight();paint(0);}}
window.addEventListener('ui-motion-change',quiet);
onBeforeUnmount(() => { if (hintTimer) clearInterval(hintTimer); swipe.cancel();stopFlight();completionObserver?.disconnect();observer?.disconnect();window.removeEventListener('ui-motion-change',quiet); });
</script>
<template>
  <section class="nudge-pane water-pane" data-testid="pane-water" @pointerdown.capture="interruptDiscovery" @pointerup.capture="releaseCompletionPointer" @pointercancel.capture="resumeWhenIdle">
    <h1 class="hero-caption" data-testid="page-swipe-title">{{ caption }}</h1>
    <section v-if="active?.task" class="chore-water focus-hero">
      <div ref="surface" class="nudge-title-window water-title-stage" :data-task-key="active.key" data-testid="nudge-task-swipe" role="group" :aria-label="active.candidates.length > 1 ? '左右滑动切换任务，上下滑动切换负责人' : '左右滑动切换催促任务'" :style="{touchAction:'none'}" tabindex="0"
        @pointerdown="press" @pointermove="swipe.move" @pointerup="swipe.up" @pointercancel="swipe.cancel" @lostpointercapture="swipe.cancel"
        @click.capture="captureClick" @keydown.left.prevent="step(-1)" @keydown.right.prevent="step(1)" @keydown.up.prevent="stepPerson(1)" @keydown.down.prevent="stepPerson(-1)" @keydown.esc="swipe.cancel">
        <div ref="strip" :data-motion="dragging ? 'dragging' : moving ? 'spring' : 'idle'" class="nudge-title-strip" :class="{'is-dragging':dragging}">
          <TaskTitle :value="active.key" :direction="direction" class="nudge-title" aria-live="polite"
            :style="heroSize ? {fontSize:heroSize} : undefined">
            <WaterHandoffName v-if="active.key==='water'" :scope="scope" :active="handoffActive !== false" :event="board.water_handoff" :members="board.members" :target-id="active.task.assignee_id" :target-name="active.task.assignee_name">
              <WaterNudge v-if="active.task.status==='pending'&&active.task.assignee_id!==board.member.user_id" class="nudge-task-name" :key="active.task.id" :name="active.task.assignee_name" :task-name="active.name" @tap="emit('nudge',active.task!)" />
              <button v-else class="nudge-task-name" :aria-label="`查看${active.name}详情`" @click="!swipe.suppressesClick($event) && emit('details',active.task!,$event)">{{ active.task.assignee_id===board.member.user_id ? active.name : active.task.assignee_name }}</button>
            </WaterHandoffName>
            <WaterNudge v-else-if="active.task.status==='pending'&&active.task.assignee_id!==board.member.user_id" class="nudge-task-name" :key="active.task.id" :name="active.task.assignee_name" :task-name="active.name" @tap="emit('nudge',active.task!)" />
            <button v-else class="nudge-task-name" :aria-label="`查看${active.name}详情`" @click="!swipe.suppressesClick($event) && emit('details',active.task!,$event)">{{ active.task.assignee_id===board.member.user_id ? active.name : active.task.assignee_name }}</button>
          </TaskTitle>
        </div>
        <div v-if="neighbor" class="nudge-peek" aria-hidden="true"><span ref="peekWord" class="nudge-next-title" :class="{'on-left':neighborSide<0}">{{neighbor.name}}</span></div>
      </div>
      <slot v-if="active.key==='water'" name="water-actions" :status="currentStatus" :task="active.task" />
      <template v-else>
        <CompletionAction v-if="active.task.assignee_id===board.member.user_id || active.task.can_complete || active.task.completed_by===board.member.user_id" :task="active.task" :receipt="receipt" :busy="busy" :disabled="busy || (active.task.status==='pending'&&!active.task.can_complete)" :demo="demo || false" @complete="emit('complete',$event)" @undo="emit('undo',$event)" />
        <div class="water-nudge-actions">
          <Transition name="nudge-hint" mode="out-in"><p v-if="active.task.assignee_id!==board.member.user_id" :key="currentStatus" class="hero-date nudge-status" role="status">{{currentStatus}}</p></Transition>
          <button class="nudge-detail" @click="emit('details',active.task!,$event)">查看任务</button>
        </div>
      </template>
    </section>
    <p v-else class="nudge-empty">当前没有待安排的任务</p>
  </section>
</template>
<style scoped>
.nudge-pane{position:relative;min-width:0;min-height:calc(100svh - 170px - env(safe-area-inset-bottom));padding:0 0 24px;--task-content-lift:clamp(24px,5svh,42px)}
.hero-caption{position:absolute;top:calc(50% - 136px - var(--task-content-lift));left:0;width:100%;margin:0;font-size:clamp(19px,5.8vw,24px);line-height:1.4;font-weight:450;text-align:center}
.chore-water{position:absolute;top:calc(50% - 90px - var(--task-content-lift));left:0;width:100%;display:flex;flex-direction:column;align-items:center;gap:var(--ui-space-md)}
.nudge-title-window{position:relative;width:min(100%,300px);height:104px;min-height:104px;display:grid;align-items:center;touch-action:none;outline-offset:4px}
.nudge-title-strip{display:grid;place-items:center;transform-origin:50% 50%}
.nudge-title{grid-area:1/1;margin:0;width:100%;max-width:100%;font-size:clamp(60px,18vw,84px);line-height:1.15;font-weight:650;letter-spacing:-2px;text-align:center;overflow-wrap:anywhere}
.nudge-task-name:not(.nudge-name){font:inherit;color:var(--app-tone-h111,#111);border:0;background:none;padding:0;max-width:100%;letter-spacing:inherit;text-align:center;cursor:pointer}
button.nudge-task-name:not(.nudge-name){transition:opacity 120ms,transform 180ms}button.nudge-task-name:not(.nudge-name):active{opacity:.7;transform:scale(.985)}
.nudge-peek{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.nudge-next-title{position:absolute;left:calc(100% + 2px);top:50%;transform:translateY(-50%);font-size:clamp(60px,18vw,84px);line-height:1.15;font-weight:650;letter-spacing:-2px;white-space:nowrap;opacity:.2;pointer-events:none}.nudge-next-title.on-left{left:auto;right:calc(100% + 2px)}
.water-nudge-actions{display:flex;flex-direction:column;align-items:center;gap:8px;width:min(100%,300px)}.hero-date{min-height:24px;margin:0;font-size:16px;line-height:24px;color:var(--app-tone-h777,#777);text-align:center}
.nudge-detail{border:0;background:none;color:var(--app-tone-h555,#555);font:inherit;font-size:15px;min-height:44px;padding:6px 20px;transition:opacity 120ms,transform 180ms}.nudge-detail:active{opacity:.6;transform:scale(.97)}
.focus-hero > .completion-surface{width:min(100%,300px);height:56px}.nudge-empty{color:var(--muted);text-align:center}
@media(max-height:650px){.nudge-pane{min-height:calc(100svh - 155px);--task-content-lift:12px}.chore-water{gap:16px}}
@media(max-height:730px){.chore-water{gap:18px}}
.nudge-hint-enter-active,.nudge-hint-leave-active{transition:opacity .18s,transform .18s}.nudge-hint-enter-from{opacity:0;transform:translateY(5px)}.nudge-hint-leave-to{opacity:0;transform:translateY(-5px)}
@media(prefers-reduced-motion:reduce){.nudge-hint-enter-active,.nudge-hint-leave-active{transition:none}.nudge-task-name,.nudge-detail{transition:none!important}}
</style>
