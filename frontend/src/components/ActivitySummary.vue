<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from "vue";
import type {
  ChoreActivity,
  ChoreBoardData,
  ChoreCategory,
} from "../api/chores";
import TaskCategoryIcon from "./TaskCategoryIcon.vue";
import HintPopover from "./HintPopover.vue";
import SwipeCardDeck from "./SwipeCardDeck.vue";
const props = defineProps<{
  activity: ChoreActivity;
  rounds: ChoreBoardData["rounds"];
  categories?: ChoreCategory[];
  creator?: boolean;
}>();
const emit = defineEmits<{ settings: [key: ChoreCategory["key"]] }>();
const current = ref(0),
  now = ref(Date.now());
const timer = setInterval(() => (now.value = Date.now()), 60000);
onBeforeUnmount(() => clearInterval(timer));
const names = [
  ["floor", "地板"],
  ["toilet", "厕所"],
  ["sink", "洗手池"],
  ["water", "抬水"],
];
const cards = computed(() =>
  names.map(([key, name]) => {
    const at = props.activity.last_completed?.find(
      (r) => r.key === key,
    )?.completed_at;
    const minutes = at
      ? Math.max(0, Math.floor((now.value - Date.parse(at)) / 60000))
      : null;
    const days = minutes === null ? null : minutes / 1440;
    const interval =
      props.categories?.find((c) => c.key === key)?.reminder_interval_days || 3;
    const number =
      minutes === null
        ? "—"
        : minutes < 60
          ? minutes < 1
            ? "刚刚"
            : String(minutes)
          : minutes < 1440
            ? String(Math.floor(minutes / 60))
            : String(Math.floor(days!));
    const unit =
      minutes === null
        ? "暂无记录"
        : minutes < 1
          ? "完成"
          : minutes < 60
            ? "分钟前"
            : minutes < 1440
              ? "小时前"
              : "天前";
    return {
      key: key!,
      name: props.categories?.find((c) => c.key === key)?.name || name!,
      at,
      number,
      unit,
      tone:
        days === null
          ? "empty"
          : days >= interval * 2
            ? "alert"
            : days >= interval
              ? "warm"
              : "neutral",
      date: at
        ? new Intl.DateTimeFormat("zh-CN", {
            timeZone: "Asia/Shanghai",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date(at))
        : "",
    };
  }),
);
</script>
<template>
  <section class="activity-summary" data-testid="activity-summary">
    <div class="summary-heading">
      <span>距上次完成</span
      ><HintPopover
        title="间隔提醒"
        text="按全宿舍该任务最近一次有效打卡计算，包括修正后的历史记录。每项任务可由创建者设置间隔：达到间隔变淡橙，达到两倍变浅红。颜色只作提醒，不代表固定到期。暂无记录单独显示。"
        label="查看间隔提醒规则"
      /><button
        v-if="creator"
        class="interval-settings"
        @click="emit('settings', cards[current]!.key as ChoreCategory['key'])"
      >
        设置间隔
      </button>
    </div>
    <SwipeCardDeck
      v-model="current"
      :labels="cards.map((c) => c.name)"
      label="分类统计卡片"
      ><template #default="{ index }">
        <div
          class="stat-card"
          :data-testid="`stats-${cards[index]!.key}`"
          :data-tone="cards[index]!.tone"
        >
          <header>
            <TaskCategoryIcon :kind="cards[index]!.key" />
            <h2>{{ cards[index]!.name }}</h2>
          </header>
          <div class="stat-elapsed">
            <strong>{{ cards[index]!.number }}</strong
            ><span>{{ cards[index]!.unit }}</span>
          </div>
          <footer>
            <span>{{ cards[index]!.at ? "上次完成" : "还没有打卡记录" }}</span
            ><time v-if="cards[index]!.at" :datetime="cards[index]!.at">{{
              cards[index]!.date
            }}</time>
          </footer>
        </div>
      </template></SwipeCardDeck
    >
  </section>
</template>
<style scoped>
.activity-summary {
  min-width: 0;
  padding-top: 12px;
}
.summary-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  color: var(--ui-text-muted);
  font-size: 14px;
}
.interval-settings {
  border: 0;
  background: none;
  color: var(--ui-ink);
  font: inherit;
  padding: 8px;
  min-height: 44px;
}
.stat-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding: 24px;
  background: #f7f7f5;
  color: #191919;
}
.stat-card[data-tone="warm"] {
  background: #fff0d9;
  color: #694118;
}
.stat-card[data-tone="alert"] {
  background: #fbe1dc;
  color: #8e342b;
}
.stat-card[data-tone="empty"] {
  background: #f5f5f5;
  color: #777;
}
header {
  display: flex;
  align-items: center;
  gap: 12px;
}
h2 {
  font-size: 24px;
  line-height: 1.15;
  margin: 0;
}
.stat-elapsed {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.stat-elapsed strong {
  font-size: clamp(64px, 12svh, 108px);
  line-height: 1;
  font-weight: 650;
  letter-spacing: -4px;
  font-variant-numeric: tabular-nums;
}
.stat-elapsed > span {
  font-size: 18px;
}
footer {
  display: grid;
  gap: 6px;
  font-size: 14px;
  line-height: 1.5;
}
footer > span {
  opacity: 0.62;
}
time {
  font-variant-numeric: tabular-nums;
}
@media (max-height: 650px) {
  .stat-card {
    padding: 16px;
  }
  .stat-elapsed strong {
    font-size: 64px;
  }
  header :deep(.task-category-icon) {
    width: 32px;
    height: 32px;
  }
}
</style>
