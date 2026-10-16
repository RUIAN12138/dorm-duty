<script setup lang="ts">
import { computed } from "vue";
import type { ChoreActivity, ChoreBoardData } from "../api/chores";
import { activityStreak, shiftDay } from "../interaction/activity";
import TaskCategoryIcon from "./TaskCategoryIcon.vue";
import HintPopover from "./HintPopover.vue";
const props = defineProps<{
  activity: ChoreActivity;
  rounds: ChoreBoardData["rounds"];
}>();
defineEmits<{ day: [date: string] }>();
const names = [
  ["floor", "地板"],
  ["toilet", "厕所"],
  ["sink", "洗手池"],
  ["water", "抬水"],
];
const daily = computed(() => {
  const map = new Map<string, number>();
  for (const d of props.activity.daily)
    map.set(d.date, (map.get(d.date) || 0) + d.count);
  return map;
});
const months = computed(() => {
  const result = [];
  let key = props.activity.start.slice(0, 7);
  while (key <= props.activity.today.slice(0, 7)) {
    const [year, month] = key.split("-").map(Number) as [number, number];
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    result.push({
      key,
      label: `${month}月`,
      blanks: (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7,
      days: Array.from({ length: count }, (_, i) => {
        const date = `${key}-${String(i + 1).padStart(2, "0")}`;
        const count = daily.value.get(date) || 0;
        return {
          date,
          count,
          future: date > props.activity.today,
          level: count === 0 ? 0 : Math.min(4, count),
        };
      }),
    });
    const next = new Date(Date.UTC(year, month, 1));
    key = next.toISOString().slice(0, 7);
  }
  return result;
});
const cards = computed(() =>
  names.map(([key, name]) => {
    const days = props.activity.daily.filter((d) => d.key === key);
    const round = props.rounds.find((r) => r.key === key);
    return {
      key: key!,
      name,
      total: days.reduce((n, d) => n + d.count, 0),
      rate: round
        ? Math.round((round.completed / Math.max(1, round.total)) * 100)
        : null,
      ...activityStreak(
        days.map((d) => d.date),
        props.activity.today,
      ),
    };
  }),
);
</script>
<template>
  <section class="activity-summary" data-testid="activity-summary">
    <div class="summary-heading">
      <h2>近三月</h2>
      <HintPopover
        title="统计口径"
        text="总数与连续天数统计本月及前两个月的实际打卡。当前连续天数从今天或昨天向前计算。本轮完成率按本轮已完成人数计算；抬水没有固定完成配额。"
        label="查看统计口径"
      />
    </div>
    <div class="activity-months" aria-label="近三月打卡热力图">
      <section v-for="month in months" :key="month.key" class="activity-month">
        <h3>{{ month.label }}</h3>
        <div class="heatmap-days">
          <span v-for="i in month.blanks" :key="`blank-${i}`" /><button
            v-for="day in month.days"
            :key="day.date"
            :data-level="day.level"
            :disabled="day.future"
            :aria-label="`${day.date}，${day.count}项完成记录`"
            @click="$emit('day', day.date)"
          >
            {{ Number(day.date.slice(8)) }}
          </button>
        </div>
      </section>
    </div>
    <div class="heatmap-scale">
      <span>少</span><i v-for="i in 5" :key="i" :data-level="i - 1" /><span
        >多</span
      >
    </div>
    <article v-for="card in cards" :key="card.key" class="stat-card">
      <header>
        <TaskCategoryIcon :kind="card.key" />
        <h3>{{ card.name }}</h3>
      </header>
      <dl>
        <div>
          <dt>完成总数</dt>
          <dd>{{ card.total }}<span>次</span></dd>
        </div>
        <div>
          <dt>本轮完成率</dt>
          <dd>{{ card.rate === null ? "—" : `${card.rate}%` }}</dd>
        </div>
        <div>
          <dt>当前连续</dt>
          <dd>{{ card.current }}<span>天</span></dd>
        </div>
        <div>
          <dt>最长连续</dt>
          <dd>{{ card.longest }}<span>天</span></dd>
        </div>
      </dl>
    </article>
  </section>
</template>
<style scoped>
.activity-summary {
  display: grid;
  gap: var(--ui-space-md);
  padding-top: var(--ui-space-md);
}
h2,
h3 {
  margin: 0;
  font-size: var(--ui-card-title-size);
  line-height: var(--ui-title-leading);
}
.summary-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-card-gap);
}
.activity-months {
  display: grid;
  gap: var(--ui-space-md);
}
.activity-month {
  padding: var(--ui-card-padding);
  border: var(--ui-card-border);
  border-radius: var(--ui-card-radius);
}
.activity-month h3 {
  margin-bottom: var(--ui-space-sm);
  font-size: var(--ui-body-size);
}
.heatmap-days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--ui-card-gap);
}
.heatmap-days button {
  aspect-ratio: 1;
  min-width: 0;
  border: 0;
  border-radius: 6px;
  font: inherit;
  font-size: var(--ui-caption-size);
  cursor: pointer;
  color: var(--ui-ink);
  background: var(--ui-surface-muted);
}
.heatmap-days button:disabled {
  opacity: 0.25;
  cursor: default;
}
[data-level="1"] {
  background: #dedede !important;
}
[data-level="2"] {
  background: #b2b2b2 !important;
}
[data-level="3"] {
  background: #666 !important;
  color: #fff !important;
}
[data-level="4"] {
  background: #111 !important;
  color: #fff !important;
}
.heatmap-scale {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  color: var(--ui-text-muted);
  font-size: var(--ui-caption-size);
}
.heatmap-scale i {
  width: 12px;
  height: 12px;
  background: var(--ui-surface-muted);
  border-radius: 3px;
}
.stat-card {
  padding: var(--ui-card-padding);
  border: var(--ui-card-border);
  border-radius: var(--ui-card-radius);
}
header {
  display: flex;
  align-items: center;
  gap: var(--ui-card-gap);
}
dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-md);
  margin: var(--ui-space-md) 0 0;
}
dt {
  font-size: var(--ui-small-size);
  color: var(--ui-text-muted);
}
dd {
  margin: var(--ui-card-gap) 0 0;
  font-size: var(--ui-title-size);
  line-height: var(--ui-title-leading);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
dd span {
  font-size: var(--ui-small-size);
  font-weight: 400;
  margin-left: 6px;
}
@media (min-width: 600px) {
  .activity-months {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .heatmap-days {
    gap: 3px;
  }
  .heatmap-days button {
    font-size: 10px;
  }
}
</style>
