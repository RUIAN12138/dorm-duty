<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import type { ChoreRecord } from "../api/chores";
import ChoreRecordRow from "./ChoreRecordRow.vue";
import { motionAllowed } from "../interaction/motion";
const props = withDefaults(
  defineProps<{
    records: ChoreRecord[];
    memberId?: number;
    busy?: boolean;
    expanded?: boolean;
    list?: boolean;
  }>(),
  { expanded: true },
);
const emit = defineEmits<{ undo: [id: number] }>();
const scroller = ref<HTMLElement>(),
  focused = ref(0),
  drawing = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
function settled() {
  const el = scroller.value;
  if (!el || !props.expanded) return;
  const center = el.getBoundingClientRect().top + el.clientHeight / 2;
  const rows = [...el.querySelectorAll<HTMLElement>(".timeline-record")];
  let nearest = 0,
    distance = Infinity;
  rows.forEach((row, index) => {
    const b = row.getBoundingClientRect(),
      d = Math.abs(b.top + b.height / 2 - center);
    if (d < distance) {
      distance = d;
      nearest = index;
    }
  });
  focused.value = nearest;
  drawing.value = true;
}
function scroll() {
  clearTimeout(timer);
  drawing.value = false;
  timer = setTimeout(settled, 100);
}
watch(
  () => [props.expanded, props.records.length],
  async () => {
    clearTimeout(timer);
    drawing.value = false;
    if (props.expanded) {
      await nextTick();
      timer = setTimeout(settled, 280);
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));
</script>
<template>
  <div
    ref="scroller"
    class="record-timeline"
    :class="{ 'is-expanded': expanded, 'quiet-motion': !motionAllowed() }"
    data-testid="record-timeline"
    role="region"
    tabindex="0"
    aria-label="完成记录时间线"
    @scroll.passive="scroll"
    @scrollend="settled"
  >
    <div
      v-for="(record, index) in records"
      :key="record.id"
      class="timeline-record record-stagger"
      :class="{ 'is-focused': index === focused }"
      :style="{ '--record-delay': `${Math.min(index, 7) * 35}ms` }"
    >
      <span class="timeline-rail" aria-hidden="true"
        ><svg viewBox="0 0 2 100" preserveAspectRatio="none">
          <path
            d="M1 0V100"
            pathLength="1"
            :class="{ 'is-drawn': drawing && index <= focused }"
          /></svg
        ><i
      /></span>
      <ChoreRecordRow
        :class="{ 'calendar-record': !list }"
        :record="record"
        :own="record.assignee_id === memberId"
        :busy="busy"
        :test-id="
          list
            ? `calendar-list-record-${record.id}`
            : record.assignee_id === memberId
              ? `calendar-undo-${record.id}`
              : undefined
        "
        @toggle="emit('undo', $event)"
      />
    </div>
  </div>
</template>
<style scoped>
.record-timeline {
  max-height: 360px;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scroll-snap-type: y mandatory;
  scroll-padding-block: 18px;
  scrollbar-width: none;
  padding: 4px 0;
}
.record-timeline:focus-visible {
  outline: 2px solid #111;
  outline-offset: 3px;
  border-radius: 18px;
}
.record-timeline::-webkit-scrollbar {
  display: none;
}
.timeline-record {
  position: relative;
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 10px;
  scroll-snap-align: center;
  padding: 5px 0;
  opacity: 0;
  transform: translateY(-10px) scale(0.985);
  transition:
    opacity 130ms ease,
    transform 180ms ease;
}
.is-expanded .timeline-record {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition:
    opacity 190ms ease var(--record-delay),
    transform 320ms cubic-bezier(0.22, 1.3, 0.36, 1) var(--record-delay);
}
.timeline-rail {
  position: relative;
  display: block;
  width: 12px;
  height: 100%;
  background: linear-gradient(#eee, #eee) center/1px 100% no-repeat;
}
.timeline-rail svg {
  position: absolute;
  left: 5px;
  top: 0;
  width: 2px;
  height: 100%;
  overflow: visible;
}
.timeline-rail path {
  fill: none;
  stroke: #222;
  stroke-width: 1.5;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  transition: stroke-dashoffset 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.timeline-rail .is-drawn {
  stroke-dashoffset: 0;
}
.timeline-rail i {
  position: absolute;
  top: calc(50% - 4px);
  left: 2px;
  width: 8px;
  height: 8px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #ddd;
  box-shadow: 0 0 0 1px #eee;
}
.is-focused .timeline-rail i {
  background: #111;
  box-shadow: 0 0 0 1px #111;
}
:deep(.record-row) {
  border: 1px solid #eee;
  border-radius: 18px;
  padding: 12px;
  min-height: 88px;
  background: #fff;
  transition: background-color 180ms ease;
}
.is-focused :deep(.record-row) {
  background: #f8f8f8;
}
:deep(.record-avatar) {
  width: 36px;
  height: 36px;
  border-radius: 12px;
}
.quiet-motion .timeline-record,
.quiet-motion .timeline-rail path {
  transition: none;
  transform: none;
}
@media (prefers-reduced-motion: reduce) {
  .record-timeline {
    scroll-snap-type: none;
  }
  .timeline-record,
  .timeline-rail path {
    transition: none !important;
    transform: none !important;
  }
}
</style>
