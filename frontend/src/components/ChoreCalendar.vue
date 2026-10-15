<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { TabsRoot, TabsContent } from "reka-ui";
import type { ChoreMember, ChoreRecord } from "../api/chores";
import MemberMark from "./MemberMark.vue";
import ElasticSheet from "./ElasticSheet.vue";
import ChoreTypeIcon from "./ChoreTypeIcon.vue";
import ElasticSegments from "./ElasticSegments.vue";
import RecordTimeline from "./RecordTimeline.vue";
import { motionAllowed } from "../interaction/motion";
import { useMonthCarousel, shiftMonth } from "../interaction/monthCarousel";
const props = defineProps<{
  month: string;
  today: string;
  records: ChoreRecord[];
  neighbors?: Record<string, ChoreRecord[]>;
  members: ChoreMember[];
  loading?: boolean;
  memberId?: number;
  busy?: boolean;
  undoError?: string;
}>();
const emit = defineEmits<{
  change: [month: string];
  closed: [];
  undo: [id: number];
}>();
const selected = ref("");
const monthViewport = ref<HTMLElement>(),
  monthTrack = ref<HTMLElement>();
const carousel = useMonthCarousel(
  () => props.month,
  () => !!props.loading,
  (value) => emit("change", value),
  monthViewport,
  monthTrack,
);
const expandedPast = ref(new Set<string>());
const collapsedToday = ref("");
const isExpanded = (date: string) =>
  date === props.today
    ? collapsedToday.value !== date
    : expandedPast.value.has(date);
function toggleGroup(date: string) {
  if (date === props.today) collapsedToday.value = isExpanded(date) ? date : "";
  else {
    const next = new Set(expandedPast.value);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    expandedPast.value = next;
  }
}
watch(
  () => props.today,
  (next, previous) => {
    expandedPast.value.delete(previous);
    collapsedToday.value = "";
  },
);
const view = ref<"calendar" | "list">("calendar");
const viewOptions = [
  { value: "calendar", label: "日历", testId: "calendar-view-grid" },
  { value: "list", label: "列表", testId: "calendar-view-list" },
];
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
const groups = computed(() => {
  const map = new Map<string, ChoreRecord[]>();
  for (const record of listRecords.value) {
    const items = map.get(record.completed_date) || [];
    items.push(record);
    map.set(record.completed_date, items);
  }
  return [...map].map(([date, records]) => ({ date, records }));
});
const dateLabel = (date: string) =>
  date === props.today
    ? "今天"
    : `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;

const weekNames = ["一", "二", "三", "四", "五", "六", "日"];
const monthText = computed(
  () =>
    `${Number(props.month.slice(0, 4))}年 ${Number(props.month.slice(5))}月`,
);
const recordsByDate = computed(() => {
  const dates = new Map<string, ChoreRecord[]>();
  for (const record of [...props.records].sort(
    (a, b) => b.completed_at.localeCompare(a.completed_at) || b.id - a.id,
  )) {
    const records = dates.get(record.completed_date) || [];
    records.push(record);
    dates.set(record.completed_date, records);
  }
  return dates;
});
const months = computed(() =>
  [-1, 0, 1].map((delta) => {
    const key = shiftMonth(props.month, delta);
    const [year = 2026, month = 1] = key.split("-").map(Number);
    const records = delta === 0 ? props.records : props.neighbors?.[key] || [];
    const byDate = new Map<string, ChoreRecord[]>();
    for (const record of records) {
      const list = byDate.get(record.completed_date) || [];
      list.push(record);
      byDate.set(record.completed_date, list);
    }
    const first = new Date(Date.UTC(year, month - 1, 1));
    const before = (first.getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const total = 42; // Six stable rows prevent month changes from moving the page.
    const cells = Array.from({ length: total }, (_, index) => {
      const day = index - before + 1;
      if (day < 1 || day > count) return null;
      const date = `${key}-${String(day).padStart(2, "0")}`;
      const records = byDate.get(date) || [];
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
    return { key, delta, cells };
  }),
);
const selectedRecords = computed(
  () => recordsByDate.value.get(selected.value) || [],
);
function step(amount: number) {
  carousel.step(amount);
}
watch(
  () => props.month,
  () => {
    selected.value = "";
  },
);
</script>
<template>
  <TabsRoot
    :model-value="view"
    @update:model-value="view = $event === 'list' ? 'list' : 'calendar'"
    as-child
  >
    <section
      class="chore-calendar"
      aria-labelledby="calendar-title"
      data-testid="chore-calendar"
    >
      <header>
        <div>
          <h1
            id="calendar-title"
            :aria-label="monthText"
            data-section-swipe-handle
            data-testid="page-swipe-title"
          >
            <small>{{ month.slice(0, 4) }}年</small
            ><span>{{ Number(month.slice(5)) }}月</span>
          </h1>
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
      <ElasticSegments
        v-model="view"
        :options="viewOptions"
        group-label="完成记录显示方式"
      />
      <TabsContent value="calendar" as-child>
        <div class="calendar-mode">
          <div
            class="calendar-surface"
            @pointerdown="carousel.down"
            @pointermove="carousel.move"
            @pointerup="carousel.up"
            @pointercancel="carousel.cancel"
            @lostpointercapture="carousel.lost"
            @click.capture="carousel.click"
            @dragstart.prevent
          >
            <div class="chore-weekdays" aria-hidden="true">
              <span v-for="name in weekNames" :key="name">{{ name }}</span>
            </div>
            <div ref="monthViewport" class="month-viewport">
              <div
                ref="monthTrack"
                class="month-stage"
                :style="{
                  transform: `translate3d(calc(-100% + ${carousel.offset.value}px),0,0)`,
                }"
              >
                <div
                  v-for="page in months"
                  :key="page.key"
                  class="chore-calendar-grid"
                  :data-month="page.key"
                  :aria-hidden="page.delta !== 0 ? true : undefined"
                  :inert="page.delta !== 0 ? true : undefined"
                  :aria-busy="loading"
                >
                  <template
                    v-for="(cell, index) in page.cells"
                    :key="cell?.date || `blank-${index}`"
                  >
                    <button
                      v-if="cell"
                      :class="{
                        'is-today': cell.date === today,
                        'has-records': !!cell.records.length,
                        'is-selected': cell.date === selected,
                      }"
                      :aria-label="`${cell.date}，${cell.records.length ? `${cell.records.length}项完成记录，${cell.marks.map((mark) => `${mark.assignee_name}${mark.type === 'water' ? '抬水' : '值日'}`).join('，')}` : '无完成记录'}`"
                      :aria-pressed="cell.date === selected"
                      :data-testid="
                        page.delta === 0
                          ? `calendar-day-${cell.date}`
                          : undefined
                      "
                      @click="
                        selected = selected === cell.date ? '' : cell.date
                      "
                    >
                      <span class="calendar-day-number"
                        >{{ cell.day
                        }}<small
                          v-if="cell.marks.length > 2"
                          class="calendar-more"
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
                            :size="16" /><ChoreTypeIcon :type="mark.type"
                        /></span>
                      </span></button
                    ><span
                      v-else
                      class="calendar-blank"
                      aria-hidden="true"
                    ></span>
                  </template>
                </div>
              </div>
            </div>
          </div>
          <div class="calendar-type-legend" aria-label="任务标记图例">
            <span><ChoreTypeIcon type="duty" />值日</span>
            <span><ChoreTypeIcon type="water" />抬水</span>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="list" as-child>
        <div
          class="calendar-list"
          data-testid="calendar-list"
          :aria-busy="loading"
        >
          <p v-if="!listRecords.length" class="calendar-list-empty">
            本月还没有完成记录
          </p>
          <section
            v-for="group in groups"
            v-else
            :key="group.date"
            class="record-group"
            :class="{
              'is-stacked': !isExpanded(group.date) && group.records.length > 1,
            }"
          >
            <button
              class="records-heading"
              :aria-expanded="isExpanded(group.date)"
              :aria-controls="`records-${group.date}`"
              :data-testid="`record-group-${group.date}`"
              @click="toggleGroup(group.date)"
            >
              <h2>{{ dateLabel(group.date) }}</h2>
              <span
                >{{ group.records.length }}<van-icon name="arrow-down"
              /></span>
            </button>
            <div
              :id="`records-${group.date}`"
              class="record-group-body"
              :class="{
                'is-expanded': isExpanded(group.date),
                'quiet-motion': !motionAllowed(),
              }"
              :inert="!isExpanded(group.date) ? true : undefined"
              :aria-hidden="!isExpanded(group.date)"
            >
              <div class="record-group-clip">
                <RecordTimeline
                  :records="group.records"
                  :member-id="memberId"
                  :busy="busy"
                  :expanded="isExpanded(group.date)"
                  list
                  @undo="emit('undo', $event)"
                />
              </div>
            </div>
          </section>
        </div>
      </TabsContent>
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
          <p v-if="undoError" class="chore-inline-error" role="alert">
            {{ undoError }}
          </p>
          <p v-if="!selectedRecords.length">暂无完成记录</p>
          <RecordTimeline
            v-if="selectedRecords.length"
            :records="selectedRecords"
            :member-id="memberId"
            :busy="busy"
            @undo="emit('undo', $event)"
          />
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
  </TabsRoot>
</template>
<style scoped>
.chore-calendar {
  padding: 0;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 24px;
}
h1 {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0;
  color: var(--ui-ink);
  line-height: 1.1;
  font-weight: 600;
  letter-spacing: -1.5px;
}
h1 small {
  font-size: 15px;
  font-weight: 450;
  color: #888;
  letter-spacing: 0;
}
h1 > span {
  font-size: 42px;
}
.calendar-nav {
  display: flex;
  gap: 8px;
}
.calendar-nav button {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 15px;
  color: #333;
  background: #f5f5f5;
  cursor: pointer;
}
.calendar-surface {
  margin-top: 22px;
  padding: 16px 8px 10px;
  border: 1px solid #ededed;
  border-radius: 26px;
  background: var(--ui-surface);
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}
.chore-weekdays,
.chore-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px 2px;
}
.chore-weekdays span {
  text-align: center;
  font-size: 12px;
  color: #999;
  padding-bottom: 15px;
}
.chore-calendar-grid button {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  min-height: 62px;
  padding: 5px 0;
  border: 1px solid transparent;
  border-radius: 14px;
  gap: 3px;
  background: transparent;
  color: #444;
  cursor: pointer;
}
.chore-calendar-grid button.has-records {
  background: #f6f6f6;
  color: var(--ui-ink);
}
.chore-calendar-grid button.is-selected {
  border-color: var(--ui-ink);
  background: #f5f5f5;
}
.calendar-day-number {
  display: grid;
  place-items: center;
  min-width: 28px;
  height: 28px;
  font-size: 16px;
  line-height: 1;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.is-today .calendar-day-number {
  background: #111;
  color: #fff;
  border-radius: 50%;
}
.calendar-more {
  position: absolute;
  top: 2px;
  right: 2px;
  color: #888;
  font-size: 9px;
  line-height: 1;
}
.calendar-cell-marks {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 22px;
  width: 100%;
  overflow: hidden;
}
.calendar-task-mark {
  position: relative;
  width: 16px;
  height: 22px;
  flex-shrink: 0;
}
.calendar-task-mark .chore-type-icon {
  position: absolute;
  right: -1px;
  bottom: 0;
  font-size: 10px;
  background: var(--ui-surface);
  border-radius: 3px;
}
.calendar-type-legend {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 18px;
  padding: 13px 6px 0;
}
.calendar-type-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #888;
  font-size: 12px;
}
.records-heading {
  width: 100%;
  border: 0;
  background: none;
  text-align: left;
  font: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 0;
  border-bottom: 1px solid #eee;
}
.records-heading h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #222;
  letter-spacing: -0.5px;
}
.records-heading > span {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #999;
  font-size: 12px;
  white-space: nowrap;
}
.records-heading[aria-expanded="true"] .van-icon {
  transform: rotate(180deg);
}
.records-heading .van-icon {
  transition: transform 200ms ease;
}
.record-group-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.record-group-body.is-expanded {
  grid-template-rows: 1fr;
}
.record-group-clip {
  min-height: 0;
  overflow: hidden;
}
.record-stagger {
  opacity: 0;
  transform: translateY(-10px) scale(0.985);
  transition:
    opacity 130ms ease,
    transform 180ms ease;
}
.is-expanded .record-stagger {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition:
    opacity 190ms ease var(--record-delay),
    transform 320ms cubic-bezier(0.22, 1.3, 0.36, 1) var(--record-delay);
}
.quiet-motion,
.quiet-motion .record-stagger {
  transition: none !important;
  transform: none !important;
}
@media (prefers-reduced-motion: reduce) {
  .record-group-body,
  .record-stagger,
  .records-heading .van-icon {
    transition: none !important;
    transform: none !important;
  }
}
.record-group {
  position: relative;
  isolation: isolate;
  margin-top: 10px;
  margin-bottom: 16px;
}
.record-group::before,
.record-group::after {
  content: "";
  position: absolute;
  inset: 0 4px;
  z-index: -1;
  border: 1px solid #eee;
  border-radius: 18px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(0) scale(1);
  transition:
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 160ms ease;
}
.record-group.is-stacked::before {
  transform: translateY(5px) scale(0.98);
  opacity: 1;
}
.record-group.is-stacked::after {
  transform: translateY(10px) scale(0.95);
  opacity: 1;
}
.record-group.is-stacked .records-heading {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 18px;
  padding: 18px 16px;
}

.calendar-list-empty {
  display: grid;
  place-items: center;
  min-height: 240px;
  margin: 22px 0 0;
  border: 1px solid #eee;
  border-radius: 26px;
  color: #888;
  font-size: 16px;
}
.calendar-details > p {
  font-size: 16px;
  color: #777;
  padding: 18px 0;
}
.calendar-details > p[role="alert"] {
  color: #9c2929;
}
.calendar-legend {
  border-top: 1px solid #eee;
  margin-top: 18px;
}
.calendar-legend summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  color: #777;
  font-size: 13px;
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
.calendar-legend > div > span {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: #666;
  max-width: 100%;
}
.calendar-legend > div > span > span {
  overflow-wrap: anywhere;
}
.month-viewport {
  overflow: hidden;
  width: 100%;
}
.month-stage {
  display: flex;
  position: relative;
  width: 100%;
  will-change: transform;
}
.month-stage > .chore-calendar-grid {
  grid-auto-rows: minmax(62px, auto);
  flex: 0 0 100%;
  min-width: 0;
}
.chore-calendar-grid {
  width: 100%;
}
.calendar-nav button:active {
  transform: var(--ui-press-small);
  transition-duration: var(--ui-press-time);
}
.chore-calendar-grid button:active {
  transform: var(--ui-press-small);
  transition-duration: var(--ui-press-time);
}
@media (max-width: 350px) {
  .calendar-surface {
    padding-left: 5px;
    padding-right: 5px;
  }
  .calendar-cell-marks {
    gap: 0;
  }
  .chore-calendar-grid {
    gap: 3px 0;
  }
  h1 {
    gap: 7px;
  }
}
@media (max-height: 650px) {
  .month-stage > .chore-calendar-grid {
    grid-auto-rows: minmax(48px, auto);
  }
  header {
    padding-bottom: 16px;
  }
  .calendar-surface {
    margin-top: 16px;
    padding-top: 12px;
  }
  .chore-calendar-grid button {
    min-height: 48px;
    padding-top: 0;
    padding-bottom: 0;
    gap: 0;
  }
  .chore-weekdays span {
    padding-bottom: 8px;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .calendar-nav button,
  .chore-calendar-grid button {
    transition:
      transform var(--ui-release-time) var(--ui-ease-out),
      background-color 160ms ease,
      border-color 160ms ease;
  }
}
@media (prefers-reduced-motion: reduce) {
  .calendar-nav button:active,
  .chore-calendar-grid button:active {
    transform: none;
  }
}
</style>
