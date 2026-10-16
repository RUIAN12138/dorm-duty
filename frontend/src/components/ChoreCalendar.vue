<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, onMounted } from "vue";
import { TabsRoot, TabsContent } from "reka-ui";
import {
  choreRequest,
  type ChoreMember,
  type ChoreRecord,
  type ChoreActivity,
  type ChoreBoardData,
  type ChoreCategory,
} from "../api/chores";
import CompactRecordList from "./CompactRecordList.vue";
import HintPopover from "./HintPopover.vue";
import ActivitySummary from "./ActivitySummary.vue";
import HistoryEditor from "./HistoryEditor.vue";
import MemberMark from "./MemberMark.vue";
import ElasticSheet from "./ElasticSheet.vue";
import ChoreTypeIcon from "./ChoreTypeIcon.vue";
import ElasticSegments from "./ElasticSegments.vue";
import RecordTimeline from "./RecordTimeline.vue";
import { useMonthCarousel, shiftMonth } from "../interaction/monthCarousel";
const props = defineProps<{
  month: string;
  invite?: string;
  token?: string;
  version?: number;
  rounds?: ChoreBoardData["rounds"];
  categories?: ChoreCategory[];
  creator?: boolean;
  undoIds?: number[];
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
  refresh: [];
  settings: [key: ChoreCategory["key"]];
}>();
const selected = ref("");
const calendarRoot = ref<HTMLElement>(),
  roomHeight = ref(600);
function fitViewport() {
  const top =
    (calendarRoot.value?.getBoundingClientRect().top || 76) + window.scrollY;
  const nav =
    document.querySelector(".chore-bottom-nav")?.getBoundingClientRect()
      .height || 67;
  roomHeight.value = Math.max(
    280,
    Math.floor(window.innerHeight - top - nav - 12),
  );
}
let layoutObserver: ResizeObserver | undefined;
onMounted(() => {
  fitViewport();
  window.addEventListener("resize", fitViewport);
  window.visualViewport?.addEventListener("resize", fitViewport);
  layoutObserver = new ResizeObserver(fitViewport);
  if (calendarRoot.value?.parentElement)
    layoutObserver.observe(calendarRoot.value.parentElement);
});
onBeforeUnmount(() => {
  layoutObserver?.disconnect();
  window.removeEventListener("resize", fitViewport);
  window.visualViewport?.removeEventListener("resize", fitViewport);
});
const activity = ref<ChoreActivity | null>(null),
  activityError = ref(""),
  activityLoading = ref(false);
let activityController: AbortController | undefined;
async function loadActivity() {
  activityController?.abort();
  const current = new AbortController();
  activityController = current;
  activityError.value = "";
  activityLoading.value = true;
  try {
    const result = await choreRequest<ChoreActivity>(
      `/chores/activity?invite_code=${encodeURIComponent(props.invite || "")}`,
      props.token || "",
      { signal: current.signal },
    );
    if (!current.signal.aborted) activity.value = result;
  } catch (e) {
    if (!current.signal.aborted) activityError.value = (e as Error).message;
  } finally {
    if (!current.signal.aborted) activityLoading.value = false;
  }
}
watch(
  () => [props.invite, props.token, props.version, props.today],
  () => void loadActivity(),
  { immediate: true },
);
onBeforeUnmount(() => activityController?.abort());
const historyOpen = ref(false),
  historyRecord = ref<ChoreRecord | null>(null),
  historyDate = ref("");
function editHistory(record: ChoreRecord | null = null) {
  if (
    !props.token ||
    !props.memberId ||
    (record && record.assignee_id !== props.memberId && !props.creator)
  )
    return;
  historyRecord.value = record;
  historyDate.value = selected.value || props.today;
  selected.value = "";
  historyOpen.value = true;
}
function historySaved() {
  void loadActivity();
  emit("refresh");
}

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
const view = ref<"calendar" | "list" | "stats">("calendar");
const viewOptions = [
  { value: "calendar", label: "日历", testId: "calendar-view-grid" },
  { value: "list", label: "列表", testId: "calendar-view-list" },
  { value: "stats", label: "统计", testId: "calendar-view-stats" },
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
  () =>
    recordsByDate.value.get(selected.value) ||
    activity.value?.recent_records.filter(
      (r) => r.completed_date === selected.value,
    ) ||
    [],
);
function showDay(date: string) {
  if (!date.startsWith(props.month)) emit("change", date.slice(0, 7));
  selected.value = date;
}
function step(amount: number) {
  carousel.step(amount);
}
watch(
  () => props.month,
  (next) => {
    if (!selected.value.startsWith(next)) selected.value = "";
  },
);
</script>
<template>
  <TabsRoot
    :model-value="view"
    @update:model-value="
      view =
        $event === 'list' ? 'list' : $event === 'stats' ? 'stats' : 'calendar'
    "
    as-child
  >
    <section
      ref="calendarRoot"
      class="chore-calendar compact-calendar"
      :style="{ '--calendar-room-height': `${roomHeight}px` }"
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
          <button
            v-if="token"
            data-testid="history-add"
            aria-label="补记完成记录"
            @click="editHistory()"
          >
            <van-icon name="plus" aria-hidden="true" />
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
                  class="month-page"
                  :class="{
                    'month-page-even': Number(page.key.slice(5)) % 2 === 0,
                  }"
                  :data-month="page.key"
                  :aria-hidden="page.delta !== 0 ? true : undefined"
                  :inert="page.delta !== 0 ? true : undefined"
                  :aria-busy="loading"
                >
                  <div class="month-page-heading" aria-hidden="true">
                    <strong>{{ Number(page.key.slice(5)) }}月</strong
                    ><span>{{ page.key.slice(0, 4) }}</span>
                  </div>
                  <div class="chore-weekdays" aria-hidden="true">
                    <span v-for="name in weekNames" :key="name">{{
                      name
                    }}</span>
                  </div>
                  <div
                    class="chore-calendar-grid"
                    :data-month="page.key"
                    :inert="page.delta !== 0 ? true : undefined"
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
                        :data-heat="Math.min(4, cell.records.length)"
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
                        <span class="calendar-day-number">{{
                          cell.day
                        }}</span></button
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
          </div>
          <div class="calendar-type-legend" aria-label="任务标记图例">
            <span class="calendar-heat-key"
              >少<i
                v-for="level in 4"
                :key="level"
                :data-heat="level"
              />多</span
            >
          </div>
        </div>
      </TabsContent>
      <TabsContent value="list" as-child
        ><CompactRecordList
          :records="listRecords"
          :today="today"
          :month="month"
          :member-id="memberId"
          :busy="busy"
          :editable="!!token"
          :creator="creator"
          :undo-ids="undoIds"
          @undo="emit('undo', $event)"
          @edit="editHistory"
          @select="showDay"
      /></TabsContent>
      <TabsContent value="stats" class="stats-mode"
        ><ActivitySummary
          v-if="activity && !activityError"
          :activity="activity"
          :rounds="rounds || []"
          :categories="categories"
          :creator="creator"
          @settings="emit('settings', $event)"
        />
        <p v-if="activityLoading" role="status">正在读取统计…</p></TabsContent
      >
      <p v-if="activityError" role="alert" class="activity-error">
        {{ activityError
        }}<button class="calendar-ghost" @click="loadActivity">重试</button>
      </p>
      <HistoryEditor
        v-if="token && memberId"
        v-model="historyOpen"
        :record="historyRecord"
        :date="historyDate"
        :today="today"
        :version="version || 0"
        :token="token"
        :member-id="memberId"
        :members="members"
        :creator="!!creator"
        @saved="historySaved"
      />
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
          <p v-if="loading" role="status">正在读取记录…</p>
          <p v-else-if="!selectedRecords.length">暂无完成记录</p>
          <button
            v-if="token && selected <= today"
            class="calendar-ghost"
            @click="editHistory()"
          >
            补记这一天
          </button>
          <RecordTimeline
            v-if="selectedRecords.length"
            :records="selectedRecords"
            :member-id="memberId"
            :busy="busy"
            :editable="!!token"
            :creator="creator"
            :undo-ids="undoIds"
            @edit="editHistory"
            @undo="emit('undo', $event)"
          />
        </div>
      </ElasticSheet>
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
.month-stage > .month-page {
  padding: 10px 5px 0;
  border-radius: 18px;
  background: #fff;
  box-shadow:
    inset 1px 0 #efefef,
    inset -1px 0 #efefef;
}
.month-page.month-page-even {
  background: #fafafa;
}
.month-page-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 8px 16px;
  gap: 10px;
  color: #888;
  font-size: 12px;
  letter-spacing: 0.5px;
}
.month-page-heading strong {
  font-size: 17px;
  letter-spacing: -0.3px;
  color: #444;
  font-weight: 550;
}
.month-stage > .month-page {
  flex: 0 0 100%;
  min-width: 0;
}
.chore-calendar-grid {
  grid-auto-rows: minmax(62px, auto);
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
  .month-page .chore-calendar-grid {
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

<style scoped>
header {
  padding-bottom: var(--ui-space-md);
  gap: var(--ui-card-gap);
}
h1 {
  font-size: var(--ui-title-size);
  line-height: var(--ui-title-leading);
}
h1 > span {
  font-size: var(--ui-title-size);
}
h1 small {
  font-size: var(--ui-small-size);
}
.calendar-surface {
  margin-top: var(--ui-space-md);
  padding: var(--ui-card-padding);
  border: var(--ui-card-border);
  border-radius: var(--ui-card-radius);
  box-shadow: none;
  background: var(--ui-surface);
}
.chore-weekdays span {
  font-size: var(--ui-caption-size);
}
.chore-calendar-grid button {
  min-height: 68px;
  transition: none !important;
}
.chore-calendar-grid button:active {
  transform: none !important;
}
.day-record-dots {
  display: flex;
  gap: 3px;
  justify-content: center;
  height: 4px;
}
.day-record-dots i {
  width: 3px;
  height: 3px;
  background: var(--ui-ink);
  border-radius: 50%;
}
.recent-days {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--ui-card-gap);
  margin: var(--ui-space-md) 0;
}
.recent-days button {
  display: grid;
  gap: var(--ui-card-gap);
  min-width: 0;
  justify-items: center;
  padding: var(--ui-space-sm) 0;
  border: var(--ui-card-border);
  border-radius: var(--ui-card-radius);
  background: var(--ui-surface);
  font: inherit;
  font-size: var(--ui-caption-size);
  color: var(--ui-text-muted);
}
.recent-days strong {
  font-size: var(--ui-card-title-size);
  color: var(--ui-ink);
  font-variant-numeric: tabular-nums;
}
.calendar-ghost {
  min-height: 44px;
  border: 0;
  background: none;
  padding: var(--ui-space-sm) 0;
  font: inherit;
  font-size: var(--ui-small-size);
  color: var(--ui-ink);
  cursor: pointer;
}
.activity-error {
  font-size: var(--ui-small-size);
  color: var(--ui-text-muted);
  padding: var(--ui-space-sm) 0;
}
</style>

<style scoped>
.month-stage > .month-page {
  box-shadow: none;
  border-inline: var(--ui-card-border);
}
</style>

<style scoped>
.compact-calendar {
  display: flex;
  flex-direction: column;
  height: var(--calendar-room-height);
  min-height: 0;
  gap: 0;
  padding: 0;
}
.compact-calendar > header {
  flex-shrink: 0;
  min-height: 44px;
  padding: 0 0 12px;
  gap: 12px;
}
.compact-calendar h1 {
  margin: 0 !important;
  font-size: 28px;
  line-height: 1.15;
  gap: 8px;
}
.compact-calendar h1 > span {
  font-size: 28px;
}
.compact-calendar h1 small {
  font-size: 13px;
}
.calendar-nav {
  gap: 4px;
}
.calendar-nav button {
  width: 40px;
  height: 40px;
  border-radius: 13px;
}
.compact-calendar :deep(.calendar-view-selector) {
  flex-shrink: 0;
  margin-bottom: 12px;
  padding: 3px;
}
.compact-calendar :deep(.calendar-view-selector button) {
  min-height: 38px;
  font-size: 14px;
}
.compact-calendar > .calendar-mode,
.compact-calendar > .compact-records,
.compact-calendar > .stats-mode {
  flex: 1;
  min-height: 0;
}
.calendar-mode {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.compact-calendar .calendar-surface {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 8px;
  max-height: 440px;
  height: 100%;
  min-height: 0;
  border-radius: 16px;
}
.month-viewport {
  flex: 1;
  min-height: 0;
  width: 100%;
}
.month-stage {
  height: 100%;
  will-change: auto;
}
.month-page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  padding: 4px !important;
  border-radius: 12px !important;
}
.month-page-heading {
  min-height: 24px;
  padding: 0 4px;
  flex-shrink: 0;
}
.month-page-heading strong {
  font-size: 15px;
}
.month-page-heading > span {
  font-size: 12px;
}
.chore-weekdays {
  flex-shrink: 0;
  height: 24px;
  gap: 2px;
}
.chore-weekdays span {
  font-size: 12px;
  padding: 4px 0;
}
.chore-calendar-grid {
  flex: 1;
  min-height: 0;
  grid-template-rows: repeat(6, minmax(0, 1fr));
  gap: 2px;
}
.compact-calendar .chore-calendar-grid button {
  min-height: 0;
  height: 100%;
  padding: 1px 0;
  gap: 0;
  border-radius: 9px;
  justify-content: center;
}
.calendar-day-number {
  font-size: 14px;
  min-width: 22px;
  height: 22px;
}
.calendar-cell-marks {
  height: 14px;
  gap: 2px;
}
.calendar-task-mark {
  height: 13px;
  width: 17px;
  overflow: visible;
}
.calendar-task-mark :deep(.member-mark) {
  width: 12px !important;
  height: 12px !important;
}
.calendar-task-mark .chore-type-icon {
  width: 7px;
  height: 7px;
  right: -2px;
  bottom: 0;
  border-width: 1px;
}
.day-record-dots {
  height: 3px;
  gap: 2px;
}
.day-record-dots i {
  width: 2px;
  height: 2px;
}
.calendar-more {
  font-size: 9px;
  top: 0;
  right: 0;
}
.calendar-type-legend {
  flex-shrink: 0;
  min-height: 24px;
  margin: 4px 0 0;
  padding: 0 4px;
  gap: 12px;
  font-size: 11px;
}
.calendar-type-legend .chore-type-icon {
  width: 10px;
  height: 10px;
}
.calendar-heat-key {
  margin-left: auto;
  gap: 3px !important;
}
.calendar-heat-key i {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  display: block;
}
[data-heat="1"] {
  background: #f2f2f2 !important;
}
[data-heat="2"] {
  background: #e4e4e4 !important;
}
[data-heat="3"] {
  background: #d3d3d3 !important;
}
[data-heat="4"] {
  background: #bdbdbd !important;
}
.compact-calendar .is-selected {
  outline: 1px solid var(--ui-ink);
  outline-offset: -1px;
}
.compact-calendar > .activity-error {
  font-size: 13px;
  margin: 0;
  padding: 4px 0;
}
.stats-mode {
  display: flex;
  flex-direction: column;
}
.stats-mode :deep(.activity-summary) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 0;
}
.stats-mode :deep(.summary-heading) {
  min-height: 24px;
  flex-shrink: 0;
}
.stats-mode :deep(.swipe-card-deck) {
  flex: 1;
  min-height: 0;
  padding-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stats-mode :deep(.deck-stage) {
  flex: 1;
  height: auto;
  min-height: 0;
  max-height: 350px;
  margin: 28px 12px 8px;
}
.stats-mode :deep(.deck-dots) {
  flex-shrink: 0;
}
.stats-mode :deep(.deck-controls) {
  flex-shrink: 0;
  min-height: 44px;
}
@media (max-height: 650px) {
  .calendar-type-legend {
    min-height: 18px;
    font-size: 10px;
  }
  .calendar-day-number {
    height: 19px;
    min-width: 19px;
    font-size: 13px;
  }
  .calendar-cell-marks {
    height: 12px;
  }
  .calendar-task-mark {
    height: 12px;
  }
  .month-page-heading {
    min-height: 20px;
  }
  .chore-weekdays {
    height: 20px;
  }
  .compact-calendar :deep(.calendar-view-selector) {
    margin-bottom: 8px;
  }
  .compact-calendar > header {
    padding-bottom: 8px;
  }
  .stats-mode :deep(.summary-heading) {
    min-height: 20px;
  }
  .stats-mode :deep(.swipe-card-deck) {
    padding-top: 0;
  }
}
</style>

<style scoped>
.compact-calendar .calendar-task-mark {
  width: 13px;
  height: 12px;
  flex: 0 0 13px;
}
.compact-calendar .calendar-cell-marks {
  gap: 1px;
  flex-shrink: 0;
}
.compact-calendar .calendar-task-mark .chore-type-icon {
  right: 0;
  bottom: 0;
}
.compact-calendar .calendar-day-number {
  flex-shrink: 0;
}
.compact-calendar .day-record-dots {
  flex-shrink: 0;
}
</style>
<style scoped>
/* Reka keeps inactive panel shells hidden; layout styles must not unhide them. */
.compact-calendar > [hidden] {
  display: none !important;
}
</style>
