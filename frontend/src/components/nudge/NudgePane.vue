<script setup lang="ts">
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
const key = ref(props.selectedKey || "water"), direction = ref(1), offset = ref(0), dragging = ref(false);
const strip = ref<HTMLElement>(), surface = ref<HTMLElement>();
const groups = computed(() => {
  const source = props.board.nudge_tasks || props.board.workspace_tasks || [...props.board.today_tasks, ...(props.board.water_task ? [props.board.water_task] : [])];
  const ordered = props.board.configuration?.tasks || props.board.categories;
  return ordered.filter(category => category.enabled).map(category => {
    const list = source.filter(task => task.key === category.key);
    const task = list.find(task => task.status === "pending" && task.assignee_id !== props.board.member.user_id)
      || list.find(task => task.status === "pending") || list[0];
    return { key:category.key, name:category.name, task };
  }).filter(group => group.task).sort((a,b) => Number(b.key === 'water') - Number(a.key === 'water'));
});
const index = computed(() => Math.max(0,groups.value.findIndex(group => group.key === key.value)));
const active = computed(() => groups.value[index.value]);
const neighbor = computed(() => groups.value[index.value+1] || groups.value[index.value-1]);
const neighborSide = computed(() => index.value+1 < groups.value.length ? 1 : -1);
let discovery: Animation | undefined, discovered = false;
function stopDiscovery() { discovery?.cancel(); discovery=undefined; }
function step(delta: -1|1) {
  const group = groups.value[index.value+delta];
  if (group) { direction.value=delta; key.value=group.key; }
}
const swipe = createTaskSwipe((value,isDragging) => { stopDiscovery();offset.value=value;dragging.value=isDragging; },step);
function press(event: PointerEvent) { stopDiscovery();swipe.down(event); }
watch(() => active.value?.task, task => emit('select',task),{immediate:true});
async function discover() {
  if (discovered || groups.value.length<2 || !surface.value) return;
  discovered=true;
  emit('hint','左右滑动大字，换个任务催促。');
  await nextTick();
  if (!motionAllowed() || !strip.value || dragging.value) return;
  const x=-neighborSide.value*28;
  discovery=strip.value.animate([{transform:'translateX(0)'},{transform:`translateX(${x}px)`,offset:.38},{transform:`translateX(${x}px)`,offset:.56},{transform:'translateX(0)'}],{duration:1100,delay:220,easing:'cubic-bezier(.22,1,.36,1)'});
}
let observer: IntersectionObserver | undefined;
onMounted(() => { observer=new IntersectionObserver(entries => { if(entries.some(entry => entry.isIntersecting)) void discover(); });if(surface.value)observer.observe(surface.value); });
watch(() => groups.value.length,() => { if(surface.value?.getBoundingClientRect().width) void discover(); });
function quiet(){if(!motionAllowed())stopDiscovery();}
window.addEventListener('ui-motion-change',quiet);
onBeforeUnmount(() => { swipe.cancel();stopDiscovery();observer?.disconnect();window.removeEventListener('ui-motion-change',quiet); });
</script>
<template>
  <section class="nudge-pane" data-testid="pane-water">
    <h1 class="hero-caption" data-testid="page-swipe-title">轻轻提醒一下</h1>
    <template v-if="active?.task">
      <div ref="surface" class="nudge-title-window task-title-stage" data-testid="nudge-task-swipe" role="group" aria-label="左右滑动切换催促任务，也可使用左右方向键" tabindex="0"
        @pointerdown="press" @pointermove="swipe.move" @pointerup="swipe.up" @pointercancel="swipe.cancel" @lostpointercapture="swipe.cancel"
        @keydown.left.prevent="step(-1)" @keydown.right.prevent="step(1)" @keydown.esc="swipe.cancel">
        <div ref="strip" class="nudge-title-strip" :class="{'is-dragging':dragging}" :style="{transform:`translate3d(${offset}px,0,0)`}">
          <TaskTitle :value="active.key" :direction="direction" class="nudge-title" aria-live="polite">
            <button class="nudge-task-name" :aria-label="`查看${active.name}详情`" @click="!swipe.suppressesClick($event) && emit('details',active.task!,$event)">{{active.name}}</button>
          </TaskTitle>
          <span v-if="neighbor" class="nudge-next-title" :class="{'on-left':neighborSide<0}" aria-hidden="true">{{neighbor.name}}</span>
        </div>
      </div>
      <div class="nudge-recipient" :data-task-id="active.task.id">
        <WaterHandoffName v-if="active.key==='water'" :scope="scope" :active="handoffActive !== false" :event="board.water_handoff" :members="board.members" :target-id="active.task.assignee_id" :target-name="active.task.assignee_name">
          <WaterNudge v-if="active.task.status==='pending'&&active.task.assignee_id!==board.member.user_id" :key="active.task.id" :name="active.task.assignee_name" :task-name="active.name" @tap="emit('nudge',active.task!)" />
          <strong v-else class="rounded-member-name">{{active.task.assignee_name}}</strong>
        </WaterHandoffName>
        <WaterNudge v-else-if="active.task.status==='pending'&&active.task.assignee_id!==board.member.user_id" :key="active.task.id" :name="active.task.assignee_name" :task-name="active.name" @tap="emit('nudge',active.task!)" />
        <strong v-else class="rounded-member-name">{{active.task.assignee_name}}</strong>
      </div>
      <p class="nudge-status" role="status">{{ statuses[active.task.id] || (active.task.status==='completed'?'这项任务已完成':active.task.assignee_id===board.member.user_id?'这项任务轮到你':'点一下名字，轻轻提醒') }}</p>
      <slot v-if="active.key==='water'" name="water-actions" />
      <template v-else>
        <CompletionAction v-if="active.task.assignee_id===board.member.user_id || active.task.can_complete || active.task.completed_by===board.member.user_id" :task="active.task" :receipt="receipt" :busy="busy" :disabled="busy || (active.task.status==='pending'&&!active.task.can_complete)" :demo="demo || false" @complete="emit('complete',$event)" @undo="emit('undo',$event)" />
        <button class="nudge-detail" @click="emit('details',active.task!,$event)">查看任务</button>
      </template>
    </template>
    <p v-else class="nudge-empty">当前没有待安排的任务</p>
  </section>
</template>
<style scoped>
.nudge-pane{display:flex;flex-direction:column;align-items:center;padding:32px 0 100px;gap:28px;min-width:0}.hero-caption{margin:0;font-size:24px;font-weight:400;text-align:center}.nudge-title-window{width:100%;overflow:hidden;touch-action:pan-y;outline-offset:4px;min-height:100px;display:grid;align-items:center}.nudge-title-strip{display:grid;position:relative;place-items:center;transition:transform 220ms cubic-bezier(.22,1,.36,1)}.nudge-title-strip.is-dragging{transition:none}.nudge-title{grid-area:1/1;margin:0;max-width:100%;font-size:clamp(48px,12vw,72px);line-height:1.25;font-weight:700}.nudge-task-name{font:inherit;color:var(--ink);border:0;background:none;padding:8px 12px;max-width:100%;overflow-wrap:anywhere;cursor:pointer;transition:opacity 120ms,transform 180ms}.nudge-task-name:active{opacity:.7;transform:scale(.985)}.nudge-next-title{position:absolute;left:calc(100% + 2px);top:50%;transform:translateY(-50%);font-size:clamp(48px,12vw,72px);font-weight:700;white-space:nowrap;opacity:.2;pointer-events:none}.nudge-next-title.on-left{left:auto;right:calc(100% + 2px)}.nudge-recipient{width:100%;min-width:0;font-size:32px;font-weight:600;text-align:center}.nudge-status{min-height:24px;margin:0;text-align:center;font-size:14px;color:var(--muted)}.nudge-detail{border:0;background:none;color:var(--muted);font:inherit;min-height:44px;padding:10px 18px;transition:opacity 120ms,transform 180ms}.nudge-detail:active{opacity:.6;transform:scale(.97)}.nudge-empty{color:var(--muted);text-align:center}@media(prefers-reduced-motion:reduce){.nudge-title-strip,.nudge-task-name,.nudge-detail{transition:none}}
</style>
