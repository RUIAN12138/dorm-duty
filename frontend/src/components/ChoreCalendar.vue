<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ChoreMember, ChoreRecord } from "../api/chores";
import MemberMark from "./MemberMark.vue";
import ElasticSheet from "./ElasticSheet.vue";
import ChoreTypeIcon from "./ChoreTypeIcon.vue";
const props = defineProps<{
  month: string;
  today: string;
  records: ChoreRecord[];
  members: ChoreMember[];
  loading?: boolean;
}>();
const emit = defineEmits<{ change: [month: string]; closed: [] }>();
const selected = ref("");
const view = ref<"calendar" | "list">("calendar");
try {
  if (sessionStorage.getItem("dorm-calendar-view-v1") === "list")
    view.value = "list";
} catch {
  /* Use the calendar default when storage is unavailable. */
}
watch(view, (value) => {
  selected.value = "";
  try {
    sessionStorage.setItem("dorm-calendar-view-v1", value);
  } catch {
    /* This visit still works. */
  }
});
const listRecords = computed(() =>
  props.records
    .filter((record) => record.completed_date.startsWith(`${props.month}-`))
    .slice()
    .sort(
      (a, b) => b.completed_at.localeCompare(a.completed_at) || b.id - a.id,
    ),
);
function completionTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
const monthDirection = ref(1);
const weekNames = ["一", "二", "三", "四", "五", "六", "日"];
const monthText = computed(
  () =>
    `${Number(props.month.slice(0, 4))}年 ${Number(props.month.slice(5))}月`,
);
const cells = computed(() => {
  const [year = 2026, month = 1] = props.month.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const before = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const total = Math.ceil((before + count) / 7) * 7;
  return Array.from({ length: total }, (_, index) => {
    const day = index - before + 1;
    if (day < 1 || day > count) return null;
    const date = `${props.month}-${String(day).padStart(2, "0")}`;
    const records = props.records.filter(
      (record) => record.completed_date === date,
    );
    const marks = [
      ...new Map(
        records.map((record) => {
          const type =
            record.key === "water" ? ("water" as const) : ("duty" as const);
          return [`${record.assignee_id}:${type}`, { ...record, type }];
        }),
      ).values(),
    ];
    const duty = marks.find((mark) => mark.type === "duty");
    const water = marks.find((mark) => mark.type === "water");
    const visibleMarks = duty && water ? [duty, water] : marks.slice(0, 2);
    return { day, date, records, marks, visibleMarks };
  });
});
const selectedRecords = computed(() =>
  props.records.filter((record) => record.completed_date === selected.value),
);
function step(amount: number) {
  const [year = 2026, month = 1] = props.month.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  emit(
    "change",
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
  );
}
function time(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
watch(
  () => props.month,
  (next, previous) => {
    monthDirection.value = next > previous ? 1 : -1;
    selected.value = "";
  },
);
</script>
<template>
  <section
    class="chore-calendar"
    aria-labelledby="calendar-title"
    data-testid="chore-calendar"
  >
    <header>
      <div>
        <h1 id="calendar-title">{{ monthText }}</h1>
      </div>
      <div class="calendar-nav">
        <button
          aria-label="上一个月"
          data-testid="calendar-prev"
          :disabled="loading"
          @click="step(-1)"
        >
          <van-icon name="arrow-left" /></button
        ><button
          aria-label="下一个月"
          data-testid="calendar-next"
          :disabled="loading"
          @click="step(1)"
        >
          <van-icon name="arrow" />
        </button>
      </div>
    </header>
    <div
      class="calendar-view-selector"
      role="group"
      aria-label="完成记录显示方式"
    >
      <button
        type="button"
        :aria-pressed="view === 'calendar'"
        @click="view = 'calendar'"
        data-testid="calendar-view-grid"
      >
        日历
      </button>
      <button
        type="button"
        :aria-pressed="view === 'list'"
        @click="view = 'list'"
        data-testid="calendar-view-list"
      >
        列表
      </button>
    </div>
    <div v-if="view === 'calendar'" class="calendar-mode">
      <div class="chore-weekdays" aria-hidden="true">
        <span v-for="name in weekNames" :key="name">{{ name }}</span>
      </div>
      <div class="month-stage">
        <Transition :name="monthDirection > 0 ? 'month-next' : 'month-prev'">
          <div :key="month" class="chore-calendar-grid" :aria-busy="loading">
            <template
              v-for="(cell, index) in cells"
              :key="cell?.date || `blank-${index}`"
            >
              <button
                v-if="cell"
                :class="{
                  'is-today': cell.date === today,
                  'is-selected': cell.date === selected,
                }"
                :aria-label="`${cell.date}，${cell.records.length ? `${cell.records.length}项完成记录，${cell.marks.map((mark) => `${mark.assignee_name}${mark.type === 'water' ? '抬水' : '值日'}`).join('，')}` : '无完成记录'}`"
                :aria-pressed="cell.date === selected"
                :data-testid="`calendar-day-${cell.date}`"
                @click="selected = selected === cell.date ? '' : cell.date"
              >
                <span class="calendar-day-number"
                  >{{ cell.day
                  }}<small v-if="cell.marks.length > 2" class="calendar-more"
                    >+{{ cell.marks.length - 2 }}</small
                  ></span
                ><span class="calendar-cell-marks"
                  ><span
                    v-for="mark in cell.visibleMarks"
                    :key="`${mark.assignee_id}:${mark.type}`"
                    class="calendar-task-mark"
                    :data-task-type="mark.type"
                    :title="`${mark.assignee_name} · ${mark.type === 'water' ? '抬水' : '值日'}`"
                    aria-hidden="true"
                    ><MemberMark
                      :id="mark.marker_id"
                      :size="14" /><ChoreTypeIcon :type="mark.type"
                  /></span>
                </span></button
              ><span v-else class="calendar-blank" aria-hidden="true"></span>
            </template>
          </div>
        </Transition>
      </div>
      <div class="calendar-type-legend" aria-label="任务标记图例">
        <span><ChoreTypeIcon type="duty" />值日</span>
        <span><ChoreTypeIcon type="water" />抬水</span>
      </div>
    </div>
    <div
      v-else
      class="calendar-list"
      data-testid="calendar-list"
      :aria-busy="loading"
    >
      <p v-if="!listRecords.length" class="calendar-list-empty">
        本月还没有完成记录
      </p>
      <ol v-else>
        <li
          v-for="record in listRecords"
          :key="record.id"
          :data-testid="`calendar-list-record-${record.id}`"
        >
          <MemberMark :id="record.marker_id" :size="22" />
          <div>
            <strong>{{ record.assignee_name }}</strong
            ><span>{{ record.name }}</span>
          </div>
          <time :datetime="record.completed_at">{{
            completionTime(record.completed_at)
          }}</time>
        </li>
      </ol>
    </div>
    <ElasticSheet
      :model-value="!!selected"
      :title="`${Number(selected.slice(5, 7))}月${Number(selected.slice(8))}日`"
      @update:model-value="selected = $event ? selected : ''"
      @closed="emit('closed')"
    >
      <div
        v-if="selected"
        class="calendar-details"
        data-testid="calendar-day-details"
        aria-live="polite"
      >
        <p v-if="!selectedRecords.length">暂无完成记录</p>
        <div
          v-for="record in selectedRecords"
          :key="record.id"
          class="calendar-record"
        >
          <MemberMark :id="record.marker_id" :size="22" /><ChoreTypeIcon
            :type="record.key === 'water' ? 'water' : 'duty'"
          /><span
            ><strong>{{ record.assignee_name }}</strong
            ><small>{{ record.name }}</small></span
          ><time :datetime="record.completed_at">{{
            time(record.completed_at)
          }}</time>
        </div>
      </div>
    </ElasticSheet>
    <details
      v-if="view === 'calendar'"
      class="calendar-legend"
      aria-label="室友标记图例"
    >
      <summary>
        室友标记<van-icon name="arrow-down" aria-hidden="true" />
      </summary>
      <div>
        <span v-for="person in members" :key="person.user_id"
          ><MemberMark :id="person.marker_id" :size="16" /><span>{{
            person.nickname
          }}</span></span
        >
      </div>
    </details>
  </section>
</template>
<style scoped>
.chore-calendar {
  padding: 0;
}
.calendar-view-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  background: #f3f3f3;
  border-radius: 14px;
  margin-bottom: 24px;
}
.calendar-view-selector button {
  border: 0;
  border-radius: 10px;
  min-height: 40px;
  background: transparent;
  color: #666;
  font-size: 16px;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}
.calendar-view-selector button[aria-pressed="true"] {
  background: #fff;
  color: #111;
}
.calendar-view-selector button:active {
  transform: scale(0.97);
}
.calendar-list ol {
  list-style: none;
  margin: 0;
  padding: 0;
}
.calendar-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 0;
  border-bottom: 1px solid #eee;
}
.calendar-list li > div {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  overflow-wrap: anywhere;
}
.calendar-list strong {
  font-size: 18px;
  font-weight: 600;
}
.calendar-list li > div > span {
  font-size: 16px;
}
.calendar-list time {
  font-size: 14px;
  white-space: nowrap;
}
.calendar-list-empty {
  color: #666;
  font-size: 17px;
  padding: 32px 0;
  text-align: center;
}
@media (prefers-reduced-motion: reduce) {
  .calendar-view-selector button {
    transition: none;
  }
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 0 20px;
}
.calendar-eyebrow {
  color: #666;
  font-size: 10px;
  letter-spacing: 0.4px;
}
h1 {
  font-weight: 650;
  font-size: clamp(25px, 7.5vw, 32px);
  line-height: 1.2;
  letter-spacing: -0.8px;
  margin: 0;
}
.calendar-nav {
  display: flex;
  gap: 3px;
}
.calendar-nav button {
  display: grid;
  place-items: center;
  width: 36px;
  height: 44px;
  background: none;
  border: 0;
  color: #111;
}
.chore-weekdays,
.chore-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.chore-weekdays span {
  text-align: center;
  font-size: 13px;
  color: #666;
  padding: 0 0 12px;
}
.chore-calendar-grid button {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  min-height: 52px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: #111;
  padding: 7px 0 5px;
  gap: 5px;
}
.chore-calendar-grid button.is-today {
  background: #efefef;
}
.chore-calendar-grid button.is-selected {
  border-color: #111;
}
.calendar-day-number {
  position: relative;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  line-height: 17px;
}
.calendar-more {
  position: absolute;
  top: -3px;
  left: calc(100% + 2px);
  color: #777;
  font-size: 9px;
  line-height: 1;
}
.is-today .calendar-day-number {
  text-decoration: underline;
  text-underline-offset: 4px;
}
.calendar-cell-marks {
  height: 22px;
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  overflow: hidden;
}
.calendar-task-mark {
  position: relative;
  width: 18px;
  height: 22px;
  flex-shrink: 0;
}
.calendar-task-mark .chore-type-icon {
  position: absolute;
  right: 0;
  bottom: 0;
  font-size: 11px;
  background: #fff;
  border-radius: 3px;
}
.calendar-type-legend {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  padding-top: 12px;
}
.calendar-type-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #555;
  font-size: 14px;
}
.calendar-record > .chore-type-icon {
  font-size: 18px;
}
.calendar-cell-marks small {
  font-size: 10px;
  color: #666;
}
.calendar-details {
  margin: 0;
}
h3 {
  font-size: 12px;
  font-weight: 550;
  margin: 0 0 10px;
}
.calendar-details p,
.calendar-empty-note {
  color: #777;
  font-size: 16px;
  line-height: 1.7;
}
.calendar-empty-note {
  padding: 0 5px;
  margin: 12px 0 0;
}
.calendar-record {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 16px 0;
  border-bottom: 1px solid #eee;
}
.calendar-record > span {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  align-items: center;
}
.calendar-record strong {
  font-size: 17px;
  font-weight: 550;
  overflow-wrap: anywhere;
}
.calendar-record small,
time {
  color: #666;
  font-size: 14px;
}
.calendar-legend {
  border-top: 1px solid #eee;
  margin-top: 14px;
}
.calendar-legend > div > span {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #555;
  max-width: 100%;
}
.calendar-legend > div > span > span {
  overflow-wrap: anywhere;
}
@media (max-width: 350px) {
  .calendar-cell-marks {
    gap: 0;
  }
}
.calendar-legend summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  color: #555;
  font-size: 14px;
  list-style: none;
  cursor: pointer;
}
.calendar-legend summary::-webkit-details-marker {
  display: none;
}
.calendar-legend > div {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  padding: 8px 0 12px;
}
.month-stage {
  position: relative;
}
.chore-calendar-grid {
  width: 100%;
}
.calendar-nav button,
.chore-calendar-grid button {
  transition:
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 160ms ease;
}
.calendar-nav button:active,
.chore-calendar-grid button:active {
  transform: scale(0.94);
}
@media (max-height: 650px) {
  .calendar-view-selector {
    margin-bottom: 14px;
  }
  .calendar-view-selector button {
    min-height: 36px;
  }
  .calendar-type-legend {
    padding-top: 8px;
  }
  .calendar-legend {
    margin-top: 8px;
  }
  header {
    padding-bottom: 14px;
  }
  .chore-calendar-grid button {
    min-height: 40px;
    padding-top: 0;
    padding-bottom: 0;
    gap: 1px;
  }
  .chore-weekdays span {
    padding-bottom: 6px;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .month-next-enter-active,
  .month-prev-enter-active {
    transition:
      transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 200ms ease;
  }
  .month-next-leave-active,
  .month-prev-leave-active {
    position: absolute;
    top: 0;
    pointer-events: none;
    transition:
      opacity 100ms ease,
      transform 160ms ease;
  }
  .month-next-enter-from,
  .month-prev-leave-to {
    opacity: 0;
    transform: translateX(12px);
  }
  .month-prev-enter-from,
  .month-next-leave-to {
    opacity: 0;
    transform: translateX(-12px);
  }
}
</style>
