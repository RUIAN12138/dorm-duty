<script setup lang="ts">
import "../interaction/memberNames.css";
import {
  ref,
  reactive,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { motionAllowed } from "../interaction/motion";
import type { ChoreRecord } from "../api/chores";
import RecordTimeline from "./RecordTimeline.vue";
import type { CalendarViewMemory } from "../interaction/calendarViewMemory";
const props = defineProps<{
  memory?: CalendarViewMemory["list"];
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
const memory =
  props.memory ||
  reactive({
    month: props.month,
    page: 0,
    scrollTop: 0,
    expanded: [] as string[],
    collapsedToday: "",
  });
if (memory.month !== props.month)
  Object.assign(memory, {
    month: props.month,
    page: 0,
    scrollTop: 0,
    expanded: [],
    collapsedToday: "",
  });
const openedRecordId = ref<number | null>(null);
function recordOpen(id: number, open: boolean) {
  if (open) openedRecordId.value = id;
  else if (openedRecordId.value === id) openedRecordId.value = null;
}
watch(
  () => [props.records, props.month, props.busy, props.undoIds],
  () => {
    openedRecordId.value = null;
  },
);
const scrollArea = ref<HTMLElement>();
const root = ref<HTMLElement>(),
  page = ref(memory.page),
  capacity = ref(3),
  expanded = ref(new Set<string>(memory.expanded)),
  collapsedToday = ref(memory.collapsedToday);
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
let pendingCollapseDuration: number | undefined;
const activeCollapses = new Map<HTMLElement, number>();
const layoutAnimations = new Map<HTMLElement, Animation>();
function followCollapse(
  element: HTMLElement,
  distance: number,
  duration: number,
) {
  activeCollapses.set(element, distance);
  pendingCollapseDuration = duration;
}
function captureLayout() {
  positions = [
    ...(root.value?.querySelectorAll<HTMLElement>(".record-stack") || []),
  ].map((el) => ({ el, top: el.getBoundingClientRect().top }));
}
function settleLayout() {
  const before = positions;
  positions = [];
  const collapseDuration = pendingCollapseDuration;
  pendingCollapseDuration = undefined;
  for (const element of activeCollapses.keys())
    if (!element.isConnected || !element.classList.contains("is-collapsing"))
      activeCollapses.delete(element);
  for (const [element, animation] of layoutAnimations)
    if (!element.isConnected) {
      animation.cancel();
      layoutAnimations.delete(element);
    }
  for (const { el } of before) {
    layoutAnimations.get(el)?.cancel();
    layoutAnimations.delete(el);
  }
  if (!motionAllowed()) return;
  // Measure the new layout without an earlier FLIP transform. The saved
  // positions already include its current visual pose when interrupted.
  const groups = [
    ...(root.value?.querySelectorAll<HTMLElement>(".record-stack") || []),
  ];
  let reserved = 0;
  const targets = new Map<HTMLElement, number>();
  for (const group of groups) {
    targets.set(group, -reserved);
    reserved += activeCollapses.get(group) || 0;
  }
  const moves = before.map(({ el, top }) => ({
    el,
    delta: top - el.getBoundingClientRect().top,
  }));
  for (const { el, delta } of moves) {
    const target = targets.get(el) || 0;
    if (Math.abs(delta - target) > 1) {
      const animation = el.animate(
        [
          { transform: `translate3d(0,${delta}px,0)` },
          { transform: `translate3d(0,${target}px,0)` },
        ],
        {
          duration: collapseDuration || 280,
          easing: "cubic-bezier(.22,1,.36,1)",
          fill: "both",
        },
      );
      // Hold the visually collapsed pose until RecordTimeline releases its
      // scroll reservation, then FLIP to the identical actual layout.
      layoutAnimations.set(el, animation);
      animation.onfinish = () => {
        if (target || layoutAnimations.get(el) !== animation) return;
        animation.cancel();
        layoutAnimations.delete(el);
      };
    }
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
  const next = Math.max(0, Math.min(total.value - 1, value));
  if (next !== page.value) {
    openedRecordId.value = null;
    memory.scrollTop = 0;
    if (scrollArea.value) scrollArea.value.scrollTop = 0;
  }
  page.value = next;
}
let observer: ResizeObserver | undefined;
onMounted(() => {
  void nextTick(() => {
    if (scrollArea.value) scrollArea.value.scrollTop = memory.scrollTop;
  });
  observer = new ResizeObserver(() => {
    capacity.value = Math.max(
      1,
      Math.min(5, Math.floor(((root.value?.clientHeight || 340) - 52) / 104)),
    );
    setPage(page.value);
  });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  layoutAnimations.forEach((animation) => animation.cancel());
  layoutAnimations.clear();
  activeCollapses.clear();
});
watch(
  () => props.month,
  () => {
    page.value = 0;
    memory.month = props.month;
    memory.scrollTop = 0;
    memory.expanded = [];
    expanded.value = new Set();
    collapsedToday.value = "";
  },
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
watch(
  page,
  (value) => {
    memory.page = value;
  },
  { flush: "sync" },
);
watch(
  [expanded, collapsedToday],
  () => {
    memory.expanded = [...expanded.value];
    memory.collapsedToday = collapsedToday.value;
  },
  { flush: "sync" },
);
const label = (date: string) =>
  date === props.today
    ? "今天"
    : `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
watch(capacity, () => {
  openedRecordId.value = null;
});
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
    <div
      v-else
      ref="scrollArea"
      class="folded-record-page"
      data-native-scroll
      :data-page="page"
      @scroll="memory.scrollTop = ($event.target as HTMLElement).scrollTop"
    >
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
        :open-record-id="openedRecordId"
        @record-open="recordOpen"
        @toggle="
          openedRecordId = null;
          toggle(group.date);
        "
        @before-layout="captureLayout"
        @after-layout="settleLayout"
        @collapse-start="followCollapse"
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
