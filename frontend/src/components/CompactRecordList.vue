<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
} from "vue";
import type { ChoreRecord } from "../api/chores";
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
  Object.assign(memory, { month: props.month, page: 0, scrollTop: 0 });
const root = ref<HTMLElement>(),
  page = ref(memory.page),
  capacity = ref(3);
const groups = computed(() => {
  const dates = new Map<string, ChoreRecord[]>();
  for (const record of props.records) {
    const rows = dates.get(record.completed_date) || [];
    rows.push(record);
    dates.set(record.completed_date, rows);
  }
  return [...dates]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, records]) => ({ date, records }));
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
function setPage(value: number) {
  page.value = Math.max(0, Math.min(total.value - 1, value));
  memory.scrollTop = 0;
}
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(() => {
    capacity.value = Math.max(
      1,
      Math.min(7, Math.floor(((root.value?.clientHeight || 300) - 48) / 72)),
    );
    setPage(page.value);
  });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());
watch(
  () => props.month,
  (month) => {
    page.value = 0;
    memory.month = month;
    memory.expanded = [];
    memory.collapsedToday = "";
    memory.scrollTop = 0;
  },
);
watch(total, () => setPage(page.value));
watch(
  page,
  (value) => {
    memory.page = value;
  },
  { flush: "sync" },
);
const label = (date: string) =>
  date === props.today
    ? "今天"
    : `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
const summary = (records: ChoreRecord[]) =>
  [...new Set(records.map((record) => record.name))].join(" · ");
</script>
<template>
  <section
    ref="root"
    class="compact-records"
    data-testid="calendar-list"
    aria-label="完成记录列表"
  >
    <div v-if="!records.length" class="compact-record-empty">
      <h2>这个月还没有记录</h2>
    </div>
    <div v-else class="record-date-page" :data-page="page">
      <button
        v-for="group in visible"
        :key="group.date"
        class="record-date"
        :aria-label="`${label(group.date)}，${group.records.length}条记录，查看详情`"
        @click="emit('select', group.date)"
      >
        <span class="record-date-copy"
          ><strong>{{ label(group.date) }}</strong
          ><span>{{ summary(group.records) }}</span></span
        ><span class="record-date-count"
          >{{ group.records.length }}<van-icon name="arrow" aria-hidden="true"
        /></span>
      </button>
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
  gap: 4px;
}
.record-date-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.record-date {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 10px 4px;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--app-tone-heee, #eee);
  text-align: left;
}
.record-date-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.record-date-copy strong {
  font-size: 16px;
  font-weight: 500;
}
.record-date-copy > span {
  font-size: 12px;
  color: var(--app-tone-h999, #999);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.record-date-count {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--app-tone-h999, #999);
  flex: none;
}
.record-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  min-height: 44px;
  margin-top: auto;
  font-size: 13px;
  color: var(--app-tone-h999, #999);
  font-variant-numeric: tabular-nums;
}
.record-pagination button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 50%;
  background: none;
}
.compact-record-empty {
  display: grid;
  place-items: center;
  flex: 1;
  text-align: center;
}
.compact-record-empty h2 {
  font-size: 18px;
  font-weight: 500;
}
</style>
