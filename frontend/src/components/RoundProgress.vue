<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import type { ChoreBoardData } from "../api/chores";
import MemberMark from "./MemberMark.vue";
import { motionAllowed } from "../interaction/motion";
const props = defineProps<{
  round: ChoreBoardData["rounds"][number];
  active: boolean;
  compact?: boolean;
}>();
const count = ref(0),
  ring = ref<HTMLElement>(),
  digit = ref<HTMLElement>();
const plus = ref(false),
  pulse = ref(0);
const circumference = 2 * Math.PI * 54;
const completed = computed(() =>
  Math.min(props.round.total, Math.max(0, props.round.completed)),
);
const people = computed(() =>
  [...(props.round.completions || [])].sort(
    (a, b) => a.completed_at.localeCompare(b.completed_at) || a.id - b.id,
  ),
);
let timer: ReturnType<typeof setTimeout> | undefined;
let absorption: ReturnType<typeof setTimeout> | undefined;
let animations: Animation[] = [];
function stop() {
  clearTimeout(timer);
  clearTimeout(absorption);
  animations.forEach((a) => a.cancel());
  animations = [];
  plus.value = false;
}
function absorb() {
  animations.forEach((a) => a.cancel());
  animations = [];
  if (!motionAllowed()) return;
  if (ring.value)
    animations.push(
      ring.value.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(1.035,.965)", offset: 0.28 },
          { transform: "scale(.985,1.02)", offset: 0.6 },
          { transform: "scale(1)" },
        ],
        { duration: 320, easing: "cubic-bezier(.22,1,.36,1)" },
      ),
    );
  if (digit.value)
    animations.push(
      digit.value.animate(
        [
          { transform: "translateY(8px) scale(.94)", opacity: 0.5 },
          {
            transform: "translateY(-1px) scale(1.05)",
            opacity: 1,
            offset: 0.65,
          },
          { transform: "translateY(0) scale(1)", opacity: 1 },
        ],
        { duration: 220, easing: "cubic-bezier(.22,1,.36,1)" },
      ),
    );
}
function advance() {
  if (!props.active || count.value >= completed.value) return;
  pulse.value++;
  plus.value = true;
  absorption = setTimeout(() => {
    plus.value = false;
    count.value = Math.min(count.value + 1, completed.value);
    absorb();
    timer = setTimeout(advance, 110);
  }, 160);
}
watch(
  () =>
    [
      props.active,
      props.round.key,
      props.round.sequence,
      completed.value,
    ] as const,
  (next, previous) => {
    stop();
    if (!next[0]) return;
    const reset =
      !previous?.[0] || next[1] !== previous[1] || next[2] !== previous[2];
    if (reset) count.value = 0;
    if (!motionAllowed() || document.hidden) count.value = completed.value;
    else if (count.value > completed.value) {
      count.value = completed.value;
      absorb();
    } else advance();
  },
  { immediate: true, flush: "post" },
);
onBeforeUnmount(stop);
</script>
<template>
  <div
    class="round-achievement"
    :class="{ 'quiet-motion': !motionAllowed(), 'is-compact': compact }"
  >
    <div
      ref="ring"
      class="round-progress-display"
      data-testid="round-progress-ring"
      role="progressbar"
      :aria-valuenow="completed"
      :aria-valuemin="0"
      :aria-valuemax="round.total"
      :aria-label="`本轮${completed}人已完成`"
    >
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <circle class="round-progress-track" cx="70" cy="70" r="54" />
        <circle
          class="round-progress-value"
          cx="70"
          cy="70"
          r="54"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="
            circumference * (1 - (round.total ? count / round.total : 0))
          "
        />
      </svg>
      <div class="round-progress-center" aria-hidden="true">
        <strong ref="digit" data-testid="round-count">{{ count }}</strong
        ><span>/ {{ round.total }}</span>
      </div>
      <span v-if="plus" :key="pulse" class="round-plus" aria-hidden="true"
        >+1</span
      >
    </div>
    <p v-if="!compact" class="round-summary">
      {{ completed === round.total ? "全员完成" : "本轮已完成" }}
    </p>
    <TransitionGroup
      v-if="!compact"
      name="round-rank"
      tag="ol"
      class="round-ranking"
      data-testid="round-ranking"
    >
      <li
        v-for="(person, index) in people.slice(0, count)"
        :key="person.id"
        :data-member-id="person.user_id"
      >
        <span class="rank-number">{{ String(index + 1).padStart(2, "0") }}</span
        ><MemberMark :id="person.marker_id" :size="28" /><strong>{{
          person.nickname
        }}</strong
        ><van-icon name="success" aria-hidden="true" />
      </li>
    </TransitionGroup>
    <p v-if="!compact && !completed" class="round-empty">等待第一位室友</p>
  </div>
</template>
<style scoped>
.is-compact .round-progress-display {
  width: 48px;
  margin: 0;
}
.is-compact .round-progress-center strong {
  font-size: 16px;
  letter-spacing: 0;
}
.is-compact .round-progress-center span {
  display: none;
}
.is-compact .round-plus {
  animation-name: absorb-mini;
  font-size: 12px;
}
.round-progress-display {
  position: relative;
  display: grid;
  place-items: center;
  width: 192px;
  aspect-ratio: 1;
  margin: 12px auto 16px;
  isolation: isolate;
}
svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  overflow: visible;
}
circle {
  fill: none;
  stroke-width: 14;
  stroke-linecap: round;
}
.round-progress-track {
  stroke: #f0f0f0;
}
.round-progress-value {
  stroke: #111;
  transition: stroke-dashoffset 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.round-progress-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}
strong {
  font-weight: 600;
}
.round-progress-center strong {
  font-size: 58px;
  line-height: 1;
  letter-spacing: -2px;
  min-width: 1ch;
  text-align: center;
}
.round-progress-center span {
  font-size: 17px;
  color: #999;
  align-self: center;
  margin-top: 22px;
}
.round-summary {
  text-align: center;
  margin: 0 0 24px;
  font-size: 15px;
  color: #777;
}
.round-plus {
  position: absolute;
  left: 50%;
  top: 50%;
  font-size: 23px;
  font-weight: 650;
  pointer-events: none;
  animation: absorb-plus 170ms cubic-bezier(0.32, 0.72, 0, 1) both;
  background: #fff;
  border-radius: 20px;
  padding: 3px 7px;
}
.round-ranking {
  padding: 0;
  margin: 0;
  list-style: none;
  position: relative;
}
.round-ranking li {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 66px;
  border-bottom: 1px solid #eee;
}
.rank-number {
  width: 24px;
  flex-shrink: 0;
  color: #aaa;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.round-ranking strong {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 18px;
}
.round-ranking .van-icon {
  color: #999;
  font-size: 16px;
}
.round-empty {
  text-align: center;
  color: #aaa;
  margin: 22px 0;
  font-size: 15px;
}
.round-rank-enter-active {
  transition:
    opacity 230ms ease,
    transform 300ms cubic-bezier(0.22, 1.3, 0.36, 1);
}
.round-rank-leave-active {
  transition: opacity 120ms ease;
  position: absolute;
  width: 100%;
}
.round-rank-move {
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.round-rank-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.round-rank-leave-to {
  opacity: 0;
}
@keyframes absorb-mini {
  0% {
    transform: translate(18px, 18px) scale(0.92);
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  100% {
    transform: translate(6px, 5px) scale(0.65);
    opacity: 0;
  }
}
@keyframes absorb-plus {
  0% {
    transform: translate(66px, 62px) scale(0.92);
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  100% {
    transform: translate(34px, 39px) scale(0.65);
    opacity: 0;
  }
}
.quiet-motion .round-progress-value,
.quiet-motion .round-rank-enter-active,
.quiet-motion .round-rank-leave-active,
.quiet-motion .round-rank-move {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .round-plus {
    display: none;
  }
}
</style>
