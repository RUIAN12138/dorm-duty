<script setup lang="ts">
import { computed, ref } from "vue";
import type { ChoreActivity, ChoreBoardData } from "../api/chores";
import { activityStreak } from "../interaction/activity";
import TaskCategoryIcon from "./TaskCategoryIcon.vue";
import HintPopover from "./HintPopover.vue";
import SwipeCardDeck from "./SwipeCardDeck.vue";
const props = defineProps<{
  activity: ChoreActivity;
  rounds: ChoreBoardData["rounds"];
}>();
const current = ref(0);
const names = [
  ["floor", "地板"],
  ["toilet", "厕所"],
  ["sink", "洗手池"],
  ["water", "抬水"],
];
const cards = computed(() =>
  names.map(([key, name]) => {
    const days = props.activity.daily.filter((d) => d.key === key),
      round = props.rounds.find((r) => r.key === key);
    return {
      key: key!,
      name: name!,
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
      <span>近三月</span
      ><HintPopover
        title="统计口径"
        text="本月及前两月的真实打卡。连续天数只表示连续有记录的日期。本轮完成率按已完成人数计算；抬水没有固定完成配额。"
        label="查看统计口径"
      />
    </div>
    <SwipeCardDeck
      v-model="current"
      :labels="cards.map((card) => card.name)"
      label="分类统计卡片"
    >
      <template #default="{ index }"
        ><div class="stat-card" :data-testid="`stats-${cards[index]!.key}`">
          <header>
            <TaskCategoryIcon :kind="cards[index]!.key" />
            <h2>{{ cards[index]!.name }}</h2>
          </header>
          <div class="stat-total">
            <strong>{{ cards[index]!.total }}</strong
            ><span>次完成</span>
          </div>
          <dl>
            <div>
              <dt>本轮完成率</dt>
              <dd>
                {{
                  cards[index]!.rate === null ? "—" : `${cards[index]!.rate}%`
                }}
              </dd>
            </div>
            <div>
              <dt>当前连续</dt>
              <dd>{{ cards[index]!.current }}<span>天</span></dd>
            </div>
            <div>
              <dt>最长连续</dt>
              <dd>{{ cards[index]!.longest }}<span>天</span></dd>
            </div>
          </dl>
        </div></template
      >
    </SwipeCardDeck>
  </section>
</template>
<style scoped>
.activity-summary {
  min-width: 0;
  padding-top: var(--ui-card-gap);
}
.summary-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  color: var(--ui-text-muted);
  font-size: var(--ui-small-size);
}
.stat-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding: 24px;
  box-sizing: border-box;
}
header {
  display: flex;
  align-items: center;
  gap: var(--ui-card-gap);
}
h2 {
  font-size: var(--ui-card-title-size);
  line-height: var(--ui-title-leading);
  margin: 0;
}
.stat-total {
  display: flex;
  align-items: baseline;
  gap: var(--ui-card-gap);
  padding: 16px 0;
}
.stat-total strong {
  font-size: clamp(52px, 9svh, 80px);
  line-height: 1;
  font-weight: 650;
  letter-spacing: -3px;
  font-variant-numeric: tabular-nums;
}
.stat-total > span {
  font-size: var(--ui-small-size);
  color: var(--ui-text-muted);
}
dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-card-gap);
  margin: 0;
  padding-top: 16px;
  border-top: var(--ui-card-border);
}
dt {
  font-size: 12px;
  color: var(--ui-text-muted);
  white-space: nowrap;
}
dd {
  margin: 8px 0 0;
  font-size: 24px;
  line-height: 1.15;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
dd span {
  font-size: 13px;
  font-weight: 400;
  margin-left: 3px;
}
@media (max-height: 650px) {
  .stat-card {
    padding: 16px;
  }
  .stat-card :deep(.task-category-icon) {
    width: 36px;
    height: 36px;
  }
  .stat-total {
    padding: 8px 0;
  }
  .stat-total strong {
    font-size: 52px;
  }
}
</style>
