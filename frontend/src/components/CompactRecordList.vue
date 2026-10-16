<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import type { ChoreRecord } from "../api/chores";
import MemberMark from "./MemberMark.vue";
import { horizontalIntent } from "../interaction/gestures";
const props = defineProps<{
  records: ChoreRecord[];
  today: string;
  month: string;
}>();
const emit = defineEmits<{ select: [date: string] }>();
const root = ref<HTMLElement>(),
  page = ref(0),
  capacity = ref(4);
const total = computed(() =>
  Math.max(1, Math.ceil(props.records.length / capacity.value)),
);
const visible = computed(() =>
  props.records.slice(
    page.value * capacity.value,
    (page.value + 1) * capacity.value,
  ),
);
function setPage(value: number) {
  page.value = Math.max(0, Math.min(total.value - 1, value));
}
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(() => {
    capacity.value = Math.max(
      1,
      Math.min(5, Math.floor(((root.value?.clientHeight || 340) - 52) / 68)),
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
const time = (s: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(s));
let pointer: { id: number; x: number; y: number } | null = null,
  suppress = 0;
function down(e: PointerEvent) {
  e.stopPropagation();
  if (e.isPrimary && e.button === 0)
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
}
function up(e: PointerEvent) {
  if (!pointer || pointer.id !== e.pointerId) return;
  const x = e.clientX - pointer.x,
    y = e.clientY - pointer.y;
  pointer = null;
  if (horizontalIntent(x, y) === "horizontal" && Math.abs(x) > 44) {
    setPage(page.value + (x < 0 ? 1 : -1));
    suppress = performance.now() + 500;
  }
}
function selected(record: ChoreRecord, e: MouseEvent) {
  if (e.detail && performance.now() < suppress) return;
  emit("select", record.completed_date);
}
</script>
<template>
  <section
    ref="root"
    class="compact-records"
    data-testid="calendar-list"
    aria-label="完成记录列表"
    data-page-gesture
    @pointerdown="down"
    @pointerup="up"
    @pointercancel="pointer = null"
  >
    <div v-if="!records.length" class="compact-record-empty">
      <h2>这个月还没有记录</h2>
      <p>完成值日后，会留在这里。</p>
    </div>
    <Transition v-else name="record-page" mode="out-in"
      ><div :key="page" class="compact-record-page" :data-page="page">
        <button
          v-for="record in visible"
          :key="record.id"
          class="compact-record-row"
          :data-testid="`calendar-list-record-${record.id}`"
          :aria-label="`${record.assignee_name}，${record.name}，${record.completed_date} ${time(record.completed_at)}`"
          @click="selected(record, $event)"
        >
          <MemberMark :id="record.marker_id" :size="28" /><span
            class="compact-record-who"
            ><strong>{{ record.assignee_name }}</strong
            ><span>{{ record.name }}</span></span
          ><time :datetime="record.completed_at"
            ><span>{{
              record.completed_date === today
                ? "今天"
                : `${Number(record.completed_date.slice(5, 7))}月${Number(record.completed_date.slice(8))}日`
            }}</span
            ><span>{{ time(record.completed_at) }}</span></time
          ><van-icon name="arrow" aria-hidden="true" />
        </button></div
    ></Transition>
    <div v-if="records.length" class="record-pagination">
      <button
        aria-label="上一页记录"
        :disabled="page === 0"
        @click="setPage(page - 1)"
      >
        <van-icon name="arrow-left" aria-hidden="true" /></button
      ><span aria-live="polite">{{ page + 1 }} / {{ total }}</span
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
.compact-record-page {
  display: grid;
  gap: 8px;
  align-content: start;
  flex: 1;
  min-height: 0;
}
.compact-record-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  min-height: 60px;
  max-height: 80px;
  padding: 10px 12px;
  border: var(--ui-card-border);
  border-radius: var(--ui-card-radius);
  background: var(--ui-surface);
  color: var(--ui-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 140ms var(--ui-ease-out);
}
.compact-record-row:active {
  transform: scale(0.98);
}
.compact-record-who {
  display: grid;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.compact-record-who strong {
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.compact-record-who > span,
time {
  font-size: 13px;
  color: var(--ui-text-muted);
}
time {
  display: grid;
  gap: 4px;
  text-align: right;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.van-icon {
  font-size: 13px;
  color: #999;
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
.record-page-enter-active,
.record-page-leave-active {
  transition: opacity 140ms var(--ui-ease-out);
}
.record-page-enter-from,
.record-page-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .compact-record-row,
  .record-page-enter-active,
  .record-page-leave-active {
    transition: none;
  }
  .compact-record-row:active {
    transform: none;
  }
}
</style>
