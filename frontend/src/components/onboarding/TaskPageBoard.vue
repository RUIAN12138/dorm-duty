<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { LayoutGroup, motion } from 'motion-v';
import { motionAllowed, motionTokens } from '../../interaction/motion';
import type { DormDraft, TaskKey } from '../../interaction/dormDraft';

const props = withDefaults(defineProps<{ draft: DormDraft; compact?: boolean }>(), {
  compact: false,
});

const dragged = ref<TaskKey | null>(null);
const hover = ref('');
const notice = ref('');
const ghost = ref<{ name: string; x: number; y: number } | null>(null);
let hold: ReturnType<typeof setTimeout> | undefined;
let suppressTaskClickUntil = 0;
let point: {
  id: number;
  x: number;
  y: number;
  active: boolean;
  key: TaskKey;
} | null = null;

function assign(key: TaskKey, page: 'duty' | 'water') {
  const task = props.draft.tasks.find((item) => item.key === key);
  if (!task) return;
  if (
    page === 'duty' && task.page !== 'duty' &&
    props.draft.tasks.filter((item) => item.enabled && item.page === 'duty').length >= 4
  ) {
    notice.value = '值日页最多放四项';
    return;
  }
  task.page = page;
  notice.value = '';
}

function moveTask(key: TaskKey) {
  if (performance.now() < suppressTaskClickUntil) return;
  const task = props.draft.tasks.find((item) => item.key === key);
  if (task) assign(key, task.page === 'duty' ? 'water' : 'duty');
}

function changeSecondPage(kind: 'tasks' | 'nudge') {
  props.draft.second_page_kind = kind;
  notice.value = '';
}

function down(event: PointerEvent, key: TaskKey) {
  if (event.button !== 0 || point) return;
  point = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false, key };
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  hold = setTimeout(() => {
    if (!point) return;
    point.active = true;
    dragged.value = key;
    const task = props.draft.tasks.find((item) => item.key === key);
    if (task) ghost.value = { name: task.name || '未命名任务', x: point.x, y: point.y };
  }, 260);
}

function move(event: PointerEvent) {
  if (!point || point.id !== event.pointerId) return;
  if (!point.active) {
    if (Math.hypot(event.clientX - point.x, event.clientY - point.y) > 8) {
      // A scroll gesture must not turn into a task tap when the pointer is released.
      suppressTaskClickUntil = performance.now() + 350;
      up();
    }
    return;
  }

  event.preventDefault();
  if (ghost.value) ghost.value = { ...ghost.value, x: event.clientX, y: event.clientY };
  const zone = document.elementsFromPoint(event.clientX, event.clientY)
    .find((element) => element.hasAttribute('data-task-zone')) as HTMLElement | undefined;
  hover.value = zone?.dataset.taskZone || '';
  if (hover.value === 'duty' || hover.value === 'water') assign(point.key, hover.value);
}

function up(event?: PointerEvent) {
  if (event && point && point.id !== event.pointerId) return;
  const wasDragging = point?.active ?? false;
  window.removeEventListener('pointermove', move);
  window.removeEventListener('pointerup', up);
  window.removeEventListener('pointercancel', up);
  if (wasDragging) suppressTaskClickUntil = performance.now() + 400;
  clearTimeout(hold);
  dragged.value = null;
  ghost.value = null;
  point = null;
  hover.value = '';
}

onBeforeUnmount(() => up());
</script>

<template>
  <div v-if="compact" class="page-board page-board--compact" data-enter>
    <LayoutGroup id="new-room-page-assignment">
      <section
        v-for="page in ['duty', 'water'] as const"
        :key="page"
        class="page-column"
        :class="[`page-column--${page}`, { target: hover === page }]"
        :data-task-zone="page"
      >
        <header class="page-column__heading">
          <strong>{{ page === 'duty' ? '值日页' : '第二页面' }}</strong>
          <div v-if="page === 'water'" class="page-kind" role="group" aria-label="第二页面类型">
            <button
              type="button"
              :class="{ selected: draft.second_page_kind !== 'nudge' }"
              :aria-pressed="draft.second_page_kind !== 'nudge'"
              @click="changeSecondPage('tasks')"
            >任务</button>
            <button
              type="button"
              :class="{ selected: draft.second_page_kind === 'nudge' }"
              :aria-pressed="draft.second_page_kind === 'nudge'"
              @click="changeSecondPage('nudge')"
            >催促</button>
          </div>
        </header>
        <div class="page-tasks page-tasks--compact" :class="{ 'page-tasks--empty': !draft.tasks.some(task => task.enabled && task.page === page) }">
          <motion.button
            v-for="task in draft.tasks.filter(item => item.enabled && item.page === page)"
            :key="task.key"
            :layout-id="`new-room-page-task-${task.key}`"
            layout="position"
            :transition="motionAllowed() ? motionTokens.layout : { duration: 0 }"
            type="button"
            class="page-task page-task--compact"
            :class="{ lifting: dragged === task.key }"
            :aria-label="`${task.name || '未命名任务'}，轻点切换页面，长按拖动`"
            @pointerdown="down($event, task.key)"
            @click="moveTask(task.key)"
          >{{ task.name || '未命名任务' }}</motion.button>
          <span v-if="!draft.tasks.some(task => task.enabled && task.page === page)" class="page-empty">暂无任务</span>
        </div>
      </section>
    </LayoutGroup>
    <p v-if="notice" class="page-notice" role="status">{{ notice }}</p>
    <Teleport to="body">
      <div v-if="ghost" class="task-ghost" :style="{ left: `${ghost.x}px`, top: `${ghost.y}px` }">{{ ghost.name }}</div>
    </Teleport>
  </div>

  <div v-else class="page-board page-board--legacy" data-enter>
    <section
      v-for="page in ['duty', 'water'] as const"
      :key="page"
      :data-task-zone="page"
      :class="{ target: hover === page }"
    >
      <header>
        <strong>{{ page === 'duty' ? '值日页' : '第二页面' }}</strong>
        <span>{{ draft.tasks.filter(task => task.enabled && task.page === page).length }}{{ page === 'duty' ? ' / 4' : '' }}</span>
      </header>
      <div class="page-tasks">
        <motion.div
          v-for="task in draft.tasks.filter(item => item.enabled && item.page === page)"
          :key="task.key"
          layout="position"
          :transition="motionAllowed() ? motionTokens.layout : { duration: 0 }"
          class="page-task"
          :class="{ lifting: dragged === task.key }"
        >
          <button @pointerdown="down($event, task.key)" :aria-label="`拖动${task.name}至另一页面`">
            <van-icon name="wap-nav" />{{ task.name || '未命名任务' }}
          </button>
          <button
            class="move-task"
            :aria-label="`将${task.name}移至${page === 'duty' ? '第二页面' : '值日页'}`"
            @click="assign(task.key, page === 'duty' ? 'water' : 'duty')"
          ><van-icon name="exchange" /></button>
        </motion.div>
        <p v-if="!draft.tasks.some(task => task.enabled && task.page === page)">把任务拖到这里</p>
      </div>
    </section>
    <p class="page-note">长按任务拖放，也可点右侧移动。</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <Teleport to="body">
      <div v-if="ghost" class="task-ghost" :style="{ left: `${ghost.x}px`, top: `${ghost.y}px` }">{{ ghost.name }}</div>
    </Teleport>
  </div>
</template>

<style scoped>
.page-board {
  display: grid;
  gap: 20px;
}
.page-board--legacy section {
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 20px;
  transition: box-shadow 200ms;
}
.page-board--legacy section.target {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ink) 16%, transparent);
}
.page-board--legacy header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-board--legacy header strong { font-size: 20px; }
.page-board--legacy header span,
.page-note,
.page-board--legacy .page-tasks p { font-size: 13px; color: var(--muted); }
.page-board--legacy .page-tasks { display: grid; gap: 8px; min-height: 44px; }
.page-board--legacy .page-task { display: flex; align-items: center; background: color-mix(in srgb, var(--ink) 4%, var(--canvas)); border-radius: 16px; }
.page-board--legacy .page-task > button { border: 0; background: none; color: var(--ink); min-height: 48px; padding: 12px; text-align: left; font: inherit; display: flex; gap: 12px; align-items: center; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
.page-board--legacy .page-task > button:first-child { flex: 1; }
.page-board--legacy .page-task .move-task { width: 44px; }
.page-board--legacy .page-task.lifting { opacity: .25; }
.page-board--legacy .page-task button:active { opacity: .65; }

.page-board--compact {
  position: relative;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 10px;
}
.page-column {
  min-width: 0;
  min-height: 180px;
  box-sizing: border-box;
  padding: 12px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--ink) 3.5%, var(--canvas));
  transition: background-color 220ms ease-out, transform 220ms cubic-bezier(.22,1,.36,1);
}
.page-column.target {
  background: color-mix(in srgb, var(--ink) 8%, var(--canvas));
  transform: scale(1.008);
}
.page-column__heading {
  display: flex;
  min-height: 62px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 8px;
  margin: 0 0 10px;
}
.page-column__heading strong { font-size: 18px; line-height: 1.25; font-weight: 650; }
.page-kind {
  display: flex;
  width: 100%;
  padding: 2px;
  gap: 2px;
  box-sizing: border-box;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 7%, var(--canvas));
}
.page-kind button {
  flex: 1;
  min-width: 0;
  min-height: 30px;
  padding: 3px 4px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 14px;
  touch-action: manipulation;
  transition: background-color 180ms ease-out, color 180ms ease-out, transform 220ms cubic-bezier(.22,1,.36,1);
}
.page-kind button.selected {
  background: var(--canvas);
  color: var(--ink);
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
}
.page-tasks--compact { display: grid; align-content: start; gap: 7px; min-width: 0; }
.page-task--compact {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 42px;
  box-sizing: border-box;
  overflow: hidden;
  padding: 9px 10px;
  border: 0;
  border-radius: 14px;
  background: color-mix(in srgb, var(--canvas) 76%, transparent);
  color: var(--ink);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: inherit;
  font-size: 16px;
  font-weight: 580;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: pan-y;
  cursor: grab;
  transition: background-color 180ms ease-out, opacity 180ms ease-out;
}
.page-task--compact:active { background: color-mix(in srgb, var(--ink) 8%, var(--canvas)); }
.page-task--compact.lifting { opacity: .24; }
.page-empty { padding: 10px 2px; color: var(--muted); font-size: 15px; }
.page-notice { position: absolute; inset-inline: 0; bottom: -30px; margin: 0; color: var(--muted); font-size: 14px; text-align: center; }
.task-ghost { position: fixed; z-index: 1500; transform: translate(-50%,-50%) scale(1.035); background: var(--canvas); border: 1px solid var(--line); box-shadow: 0 8px 18px rgb(0 0 0 / 12%); padding: 12px 18px; border-radius: 15px; pointer-events: none; font-size: 16px; font-weight: 600; }
@media (max-width: 350px) {
  .page-board--compact { gap: 8px; }
  .page-column { padding: 10px; }
  .page-task--compact { padding-inline: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .page-column, .page-kind button, .page-task--compact { transition: none !important; }
}
</style>
