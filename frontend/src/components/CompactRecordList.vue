<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { motionAllowed } from "../interaction/motion";
import type { ChoreRecord } from "../api/chores";
import RecordTimeline from "./RecordTimeline.vue";
const props = defineProps<{
  records: ChoreRecord[];
  today: string;
  month: string;
  memberId?: number;
  busy?: boolean;
  editable?: boolean;
  creator?: boolean;
  undoIds?: number[];
}>();
const emit = defineEmits<{
  select: [date: string];
  undo: [id: number];
  edit: [record: ChoreRecord];
}>();
const root = ref<HTMLElement>(),
  page = ref(0),
  capacity = ref(3),
  expanded = ref(new Set<string>()),
  collapsedToday = ref("");
const groups = computed(() => {
  const dates = new Map<string, ChoreRecord[]>();
  for (const record of props.records) {
    const rows = dates.get(record.completed_date) || [];
    rows.push(record);
    dates.set(record.completed_date, rows);
  }
  return [...dates].map(([date, records]) => ({ date, records }));
});
const total = computed(() =>
  Math.max(1, Math.ceil(groups.value.length / capacity.value)),
);
const visible = computed(() =>
  groups.value.slice(
    page.value * capacity.value,
    (page.value + 1) * capacity.value,
  ),
);
const isOpen = (date: string) =>
  date === props.today
    ? collapsedToday.value !== date
    : expanded.value.has(date);
let positions: { el: HTMLElement; top: number }[] = [];
function captureLayout() {
  positions = [
    ...(root.value?.querySelectorAll<HTMLElement>(".record-stack") || []),
  ].map((el) => ({ el, top: el.getBoundingClientRect().top }));
}
function settleLayout() {
  const before = positions;
  positions = [];
  if (!motionAllowed()) return;
  // Measure the new layout without an earlier FLIP transform. The saved
  // positions already include its current visual pose when interrupted.
  for (const { el } of before) el.getAnimations().forEach((a) => a.cancel());
  const moves = before.map(({ el, top }) => ({
    el,
    delta: top - el.getBoundingClientRect().top,
  }));
  for (const { el, delta } of moves) {
    if (Math.abs(delta) > 1)
      el.animate(
        [
          { transform: `translate3d(0,${delta}px,0)` },
          { transform: "translate3d(0,0,0)" },
        ],
        { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" },
      );
  }
}
function toggle(date: string) {
  captureLayout();
  if (date === props.today) collapsedToday.value = isOpen(date) ? date : "";
  else {
    const next = new Set(expanded.value);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    expanded.value = next;
  }
  void nextTick(settleLayout);
}
function setPage(value: number) {
  page.value = Math.max(0, Math.min(total.value - 1, value));
}
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(() => {
    capacity.value = Math.max(
      1,
      Math.min(5, Math.floor(((root.value?.clientHeight || 340) - 52) / 104)),
    );
    setPage(page.value);
  });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());
watch(
  () => props.month,
  () => (page.value = 0),
);
watch(total, () => setPage(page.value));
watch(
  () => props.today,
  (_, old) => {
    const next = new Set(expanded.value);
    next.delete(old);
    expanded.value = next;
    collapsedToday.value = "";
  },
);
const label = (date: string) =>
  date === props.today
    ? "今天"
    : `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
</script>
<template>
  <section
    ref="root"
    class="compact-records"
    data-testid="calendar-list"
    aria-label="完成记录列表"
    data-page-gesture
  >
    <div v-if="!records.length" class="compact-record-empty">
      <h2>这个月还没有记录</h2>
      <p>完成值日后，会留在这里。</p>
    </div>
    <div v-else class="folded-record-page" :data-page="page">
      <RecordTimeline
        v-for="(group, index) in visible"
        :key="group.date"
        :date="group.date"
        :label="label(group.date)"
        :style="{ '--group-delay': `${Math.min(index, 8) * 32}ms` }"
        :records="group.records"
        :member-id="memberId"
        :busy="busy"
        :expanded="isOpen(group.date)"
        list
        :editable="editable"
        :creator="creator"
        :undo-ids="undoIds"
        @toggle="toggle(group.date)"
        @before-layout="captureLayout"
        @after-layout="settleLayout"
        @edit="emit('edit', $event)"
        @undo="emit('undo', $event)"
      />
    </div>
    <div v-if="total > 1" class="record-pagination">
      <button
        aria-label="上一页记录"
        :disabled="page === 0"
        @click="setPage(page - 1)"
      >
        <van-icon name="arrow-left" aria-hidden="true" /></button
      ><span>{{ page + 1 }} / {{ total }}</span
      ><button
        aria-label="下一页记录"
        :disabled="page === total - 1"
        @click="setPage(page + 1)"
      >
        <van-icon name="arrow" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>
<style scoped>
.compact-records {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  touch-action: pan-y;
}
.folded-record-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-anchor: none;
  overscroll-behavior: contain;
  padding: 0 1px 14px;
  scrollbar-width: thin;
}
.folded-record-page :deep(.record-stack) {
  margin: 8px 0 24px;
}
.folded-record-page :deep(.record-row) {
  min-height: 68px;
  padding: 12px 0;
  gap: 8px;
}
.folded-record-page :deep(.record-avatar) {
  width: 32px;
  height: 32px;
  background: none;
}
.folded-record-page :deep(.record-description strong) {
  font-size: 16px;
}
.record-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin-top: auto;
  min-height: 44px;
  font-size: 14px;
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
}
.record-pagination button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}
.record-pagination button:disabled {
  opacity: 0.25;
}
.compact-record-empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  flex: 1;
  text-align: center;
}
.compact-record-empty h2 {
  font-size: 20px;
  margin: 0;
}
.compact-record-empty p {
  font-size: 14px;
  color: var(--ui-text-muted);
  margin: 0;
}
</style>
