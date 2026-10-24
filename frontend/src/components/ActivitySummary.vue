<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import type {
  ChoreActivity,
  ChoreBoardData,
  ChoreCategory,
} from "../api/chores";
import { revealPage, cancelPageReveal } from "../interaction/pageReveal";
import TaskCategoryIcon from "./TaskCategoryIcon.vue";
import HintPopover from "./HintPopover.vue";
import SwipeCardDeck from "./SwipeCardDeck.vue";
import ElasticSheet from "./ElasticSheet.vue";
import { darkTheme } from "../interaction/theme";
import {
  statsColorFor,
  saveStatsTaskColor,
  resetStatsColors,
  statsInk,
  statsFill,
  statsElapsedShade,
} from "../interaction/statsPalette";
const colorsOpen = ref(false),
  previewDark = ref(false);
const paletteTask = ref("floor");
const paletteColor = computed(() =>
  statsColorFor(paletteTask.value, previewDark.value),
);
const swatches = [
  ["灰", "#aaaaaa"],
  ["沙", "#b98a48"],
  ["杏", "#c88c6c"],
  ["粉", "#c8819a"],
  ["紫", "#9986bc"],
  ["蓝", "#759fc1"],
  ["青", "#75aaa9"],
  ["绿", "#8aa784"],
];
function chooseColor(color: string) {
  saveStatsTaskColor(paletteTask.value, color, previewDark.value);
}
const summary = ref<HTMLElement>();
function settleThemePalette() {
  // The existing circular page reveal owns theme changes. Capture settled
  // card colours rather than ending that reveal with a second colour jump.
  for (const el of summary.value?.querySelectorAll(
    ".stat-card, .palette-ramp span",
  ) || [])
    for (const animation of el.getAnimations())
      if (
        "transitionProperty" in animation &&
        ["background-color", "color"].includes(
          String(animation.transitionProperty),
        )
      )
        try {
          animation.finish();
        } catch {
          /* Already finished. */
        }
}
onMounted(() => {
  window.addEventListener("ui-theme-snapshot", settleThemePalette);
  revealPage(summary.value || null, ".summary-heading,.swipe-card-deck", 55, {
    duration: 300,
    distance: 12,
    scale: 0.985,
  });
});
onBeforeUnmount(() => {
  if (summary.value) cancelPageReveal(summary.value);
  window.removeEventListener("ui-theme-snapshot", settleThemePalette);
});
function openColors() {
  previewDark.value = darkTheme.value;
  paletteTask.value = names.value[current.value]?.[0] || "floor";
  colorsOpen.value = true;
}
function warningStyle(task: string, shade: number | null) {
  const background = statsFill(
    statsColorFor(task, false),
    shade ?? 0,
    darkTheme.value,
    statsColorFor(task, true),
  );
  return { background, color: statsInk(background) };
}
const props = defineProps<{
  active?: boolean;
  activity: ChoreActivity;
  rounds: ChoreBoardData["rounds"];
  categories?: ChoreCategory[];
  creator?: boolean;
  memory?: { current: number; pausedUntil: number };
}>();
const emit = defineEmits<{ settings: [key: ChoreCategory["key"]] }>();
const current = ref(props.memory?.current || 0),
  now = ref(Date.now());
watch(current, (value) => {
  if (props.memory) props.memory.current = value;
});
const timer = setInterval(() => (now.value = Date.now()), 60000);
onBeforeUnmount(() => clearInterval(timer));
const builtinNames: [string, string][] = [
  ["floor", "地板"],
  ["toilet", "厕所"],
  ["sink", "洗手池"],
  ["water", "抬水"],
];
const names = computed<[string, string][]>(() =>
  props.categories?.length
    ? props.categories.map((category) => [category.key, category.name])
    : builtinNames,
);
const cards = computed(() =>
  names.value.map(([key, name]) => {
    const at = props.activity.last_completed?.find(
      (r) => r.key === key,
    )?.completed_at;
    const validAt = at && Number.isFinite(Date.parse(at)) ? at : undefined;
    const minutes = validAt
      ? Math.max(0, Math.floor((now.value - Date.parse(validAt)) / 60000))
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
      at: validAt,
      number,
      unit,
      shade: days === null ? null : statsElapsedShade(days),
      tone:
        days === null
          ? "empty"
          : days >= interval * 2
            ? "alert"
            : days >= interval
              ? "warm"
              : "neutral",
      date: validAt
        ? new Intl.DateTimeFormat("zh-CN", {
            timeZone: "Asia/Shanghai",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date(validAt))
        : "",
    };
  }),
);
</script>
<template>
  <section
    ref="summary"
    class="activity-summary"
    data-testid="activity-summary"
  >
    <div class="summary-heading">
      <span>距上次完成</span
      ><HintPopover
        title="间隔提醒"
        text="按全宿舍该任务最近一次有效打卡计算。每项任务可单独设置间隔，刚完成为白色，每过一天轻微加深。各项任务的日间、夜间颜色可单独选择，保存在此设备。颜色只作提醒，暂无记录单独显示。"
        label="查看间隔提醒规则"
      />
      <div class="summary-actions">
        <button
          class="interval-settings"
          aria-label="统计提醒颜色"
          @click="openColors"
        >
          颜色</button
        ><button
          v-if="creator"
          class="interval-settings"
          @click="emit('settings', cards[current]!.key as ChoreCategory['key'])"
        >
          设置间隔
        </button>
      </div>
    </div>
    <SwipeCardDeck
      v-model="current"
      :labels="cards.map((c) => c.name)"
      label="分类统计卡片"
      :autoplay="active !== false && !colorsOpen"
      :autoplay-memory="memory"
      ><template #default="{ index }">
        <div
          class="stat-card"
          :data-testid="`stats-${cards[index]!.key}`"
          :data-tone="cards[index]!.tone"
          :style="warningStyle(cards[index]!.key, cards[index]!.shade)"
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
    <ElasticSheet v-model="colorsOpen" title="提醒颜色" motion="bottom">
      <div class="palette-tasks" role="group" aria-label="设置哪项任务的颜色">
        <button
          v-for="[key, name] in names"
          :key="key"
          :aria-pressed="paletteTask === key"
          @click="paletteTask = key!"
        >
          {{ name }}
        </button>
      </div>
      <div class="palette-mode" role="group" aria-label="颜色预览外观">
        <button :aria-pressed="!previewDark" @click="previewDark = false">
          日间预览
        </button>
        <button :aria-pressed="previewDark" @click="previewDark = true">
          夜间预览
        </button>
      </div>
      <div class="palette-ramp" aria-label="随间隔逐渐加深的颜色预览">
        <span
          v-for="step in 5"
          :key="step"
          :style="{
            background: statsFill(
              statsColorFor(paletteTask, false),
              (step - 1) / 4,
              previewDark,
              statsColorFor(paletteTask, true),
            ),
          }"
        />
      </div>
      <div class="palette-swatches" role="group" aria-label="预设颜色">
        <button
          v-for="[name, color] in swatches"
          :key="color"
          :aria-label="`${name}色`"
          :aria-pressed="paletteColor === color"
          :style="{ '--swatch': color }"
          @click="chooseColor(color!)"
        >
          <span aria-hidden="true">{{
            paletteColor === color ? "✓" : ""
          }}</span>
        </button>
      </div>
      <label class="palette-color-row"
        ><span>自定义颜色</span>
        <input
          type="color"
          aria-label="统计基色"
          :value="paletteColor"
          @input="chooseColor(($event.target as HTMLInputElement).value)"
        />
      </label>
      <button class="palette-reset" @click="resetStatsColors()">
        恢复默认颜色
      </button>
    </ElasticSheet>
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
.summary-actions {
  display: flex;
  align-items: center;
  gap: 4px;
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
  background: var(--app-tone-hf7f7f5, #f7f7f5);
  color: var(--app-tone-h191919, #191919);
}
.stat-card[data-tone="empty"] {
  background: var(--app-tone-hf5f5f5, #f5f5f5);
  color: var(--app-tone-h777, #777);
}
@media (prefers-reduced-motion: no-preference) {
  .stat-card,
  .palette-ramp span {
    transition:
      background-color 320ms var(--ui-ease-out),
      color 220ms var(--ui-ease-out);
  }
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

<style scoped>
.palette-mode {
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: 18px;
  background: var(--ui-surface-muted);
  margin-bottom: 16px;
}
.palette-mode button {
  flex: 1;
  min-height: 42px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
}
.palette-mode button[aria-pressed="true"] {
  background: var(--ui-surface);
  color: var(--ui-ink);
}
.palette-ramp {
  display: flex;
  gap: 5px;
  margin-bottom: 12px;
}
.palette-ramp span {
  flex: 1;
  height: 38px;
  border-radius: 10px;
  border: var(--ui-card-border);
}
.palette-color-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  border-bottom: var(--ui-card-border);
}
.palette-color-row input {
  appearance: none;
  -webkit-appearance: none;
  width: 56px;
  height: 40px;
  border: var(--ui-card-border);
  border-radius: 12px;
  padding: 4px;
  background: var(--ui-surface);
  cursor: pointer;
}
.palette-color-row input::-webkit-color-swatch-wrapper {
  padding: 0;
}
.palette-color-row input::-webkit-color-swatch {
  border: 0;
  border-radius: 7px;
}
.palette-reset {
  display: block;
  min-height: 44px;
  margin: 20px auto 0;
  background: none;
  border: 0;
  color: var(--ui-text-muted);
  font: inherit;
}
</style>

<style scoped>
.palette-tasks {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 16px;
}
.palette-tasks button {
  min-height: 44px;
  border: var(--ui-card-border);
  border-radius: 14px;
  color: var(--ui-ink);
  background: var(--ui-surface);
  font: inherit;
  font-size: 14px;
}
.palette-tasks button[aria-pressed="true"] {
  background: var(--ui-ink);
  color: var(--ui-surface);
}
.palette-swatches {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 3px;
  margin: 16px 0;
}
.palette-swatches button {
  display: grid;
  place-items: center;
  padding: 0;
  min-height: 40px;
  border: 0;
  border-radius: 50%;
  background: transparent;
}
.palette-swatches span {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--swatch);
  color: #111;
  border: 1px solid #0002;
}
.palette-swatches button[aria-pressed="true"] span {
  outline: 1px solid var(--ui-ink);
  outline-offset: 3px;
}
</style>
