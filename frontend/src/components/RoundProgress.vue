<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import type { ChoreBoardData } from "../api/chores";
import MemberMark from "./MemberMark.vue";
import { motionAllowed } from "../interaction/motion";
const props = defineProps<{
  round: ChoreBoardData["rounds"][number];
  active: boolean;
  compact?: boolean;
  celebrate?: number;
}>();
const count = ref(0),
  ring = ref<HTMLElement>();
const flights = ref<{ id: number; side: number }[]>([]);
const circumference = 2 * Math.PI * 58;
const completed = computed(() =>
  Math.min(props.round.total, Math.max(0, props.round.completed)),
);
const digits = computed(() =>
  Array.from({ length: props.round.total + 1 }, (_, i) => i),
);
const people = computed(() =>
  [...(props.round.completions || [])].sort(
    (a, b) => a.completed_at.localeCompare(b.completed_at) || a.id - b.id,
  ),
);
let frame = 0,
  pulse = 0;
let timers: ReturnType<typeof setTimeout>[] = [];
let spring: Animation | undefined;
function stop() {
  cancelAnimationFrame(frame);
  timers.forEach(clearTimeout);
  timers = [];
  flights.value = [];
  spring?.cancel();
}
function absorb() {
  if (!ring.value || !motionAllowed()) return;
  const current = getComputedStyle(ring.value).transform;
  spring?.cancel();
  spring = ring.value.animate(
    [
      { transform: current === "none" ? "scale(1)" : current },
      { transform: "scale(1.035,.972)", offset: 0.22 },
      { transform: "scale(.983,1.022)", offset: 0.48 },
      { transform: "scale(1.008,.993)", offset: 0.72 },
      { transform: "scale(1)" },
    ],
    { duration: 440, easing: "cubic-bezier(.22,.7,.3,1)" },
  );
}
function flight(side: number) {
  const id = ++pulse;
  flights.value.push({ id, side });
  timers.push(setTimeout(absorb, 410));
  timers.push(
    setTimeout(() => {
      flights.value = flights.value.filter((f) => f.id !== id);
    }, 460),
  );
}
function animate(from: number, to: number) {
  count.value = from;
  const delta = to - from;
  if (delta <= 0) {
    count.value = to;
    return;
  }
  // One uninterrupted arc; particles are timed to its crossings, never drive it.
  const duration = props.compact ? 460 : Math.min(1100, 560 + delta * 110);
  const lead = 420;
  const started = performance.now();
  for (let n = Math.floor(from) + 1; n <= to; n++) {
    const crossing =
      ((Math.asin(Math.min(1, (n - from) / delta)) * 2) / Math.PI) * duration;
    timers.push(
      setTimeout(
        () => flight(n % 2 ? 1 : -1),
        Math.max(0, lead + crossing - 410),
      ),
    );
  }
  function tick(now: number) {
    const t = Math.max(0, Math.min(1, (now - started - lead) / duration));
    count.value = from + delta * Math.sin((t * Math.PI) / 2);
    if (t < 1) frame = requestAnimationFrame(tick);
    else count.value = to;
  }
  frame = requestAnimationFrame(tick);
}
watch(
  () =>
    [
      props.active,
      props.round.key,
      props.round.sequence,
      completed.value,
      props.celebrate,
      props.round.total,
    ] as const,
  (next, previous) => {
    // The receipt is followed by a board refresh. Equal server values must not
    // cancel the animation already in flight just because round was replaced.
    if (previous && next.every((value, index) => value === previous[index]))
      return;
    const from = count.value;
    stop();
    if (!next[0]) return;
    const entering =
      !previous?.[0] || next[1] !== previous[1] || next[2] !== previous[2];
    const ownCompletion =
      previous && next[4] !== previous[4] && next[3] > previous[3];
    if (
      !motionAllowed() ||
      document.hidden ||
      (props.compact && !ownCompletion)
    )
      count.value = completed.value;
    else animate(entering ? 0 : from, completed.value);
  },
  { immediate: true, flush: "post" },
);
// A preference or visibility change must finish an in-flight count immediately.
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
function finishWhenMotionUnavailable() {
  if (motionAllowed()) return;
  stop();
  count.value = completed.value;
}
onMounted(() => {
  document.addEventListener("visibilitychange", finishWhenMotionUnavailable);
  reducedMotion.addEventListener("change", finishWhenMotionUnavailable);
  window.addEventListener("ui-motion-change", finishWhenMotionUnavailable);
});
onBeforeUnmount(() => {
  stop();
  document.removeEventListener("visibilitychange", finishWhenMotionUnavailable);
  reducedMotion.removeEventListener("change", finishWhenMotionUnavailable);
  window.removeEventListener("ui-motion-change", finishWhenMotionUnavailable);
});
</script>
<template>
  <div
    class="round-achievement"
    :class="{ 'quiet-motion': !motionAllowed(), 'is-compact': compact }"
  >
    <div
      class="round-progress-display"
      data-testid="round-progress-ring"
      role="progressbar"
      :aria-valuenow="completed"
      :aria-valuemin="0"
      :aria-valuemax="round.total"
      :aria-label="`本轮${completed}人已完成`"
    >
      <div ref="ring" class="round-ring-visual">
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <circle class="round-progress-track" cx="80" cy="80" r="58" />
          <circle
            class="round-progress-value"
            cx="80"
            cy="80"
            r="58"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="
              circumference * (1 - (round.total ? count / round.total : 0))
            "
          />
        </svg>
      </div>
      <div class="round-progress-center" aria-hidden="true">
        <strong class="round-number-window"
          ><span
            class="round-number-reel"
            :style="{ transform: `translateY(${-count}em)` }"
            ><span v-for="digit in digits" :key="digit">{{ digit }}</span></span
          ></strong
        >
        <span class="round-total">/ {{ round.total }}</span>
      </div>
      <span class="round-sr" data-testid="round-count">{{
        Math.floor(count)
      }}</span>
      <span
        v-for="f in flights"
        :key="f.id"
        class="round-plus"
        :style="{ '--side': f.side }"
        aria-hidden="true"
        >+1</span
      >
    </div>
    <p v-if="!compact" class="round-summary">
      {{ completed === round.total ? "全员完成" : "本轮已完成" }}
    </p>
    <TransitionGroup
      v-if="!compact"
      appear
      name="round-rank"
      tag="ol"
      class="round-ranking"
      data-testid="round-ranking"
    >
      <li
        v-for="(person, index) in people"
        :key="person.id"
        :data-member-id="person.user_id"
        :style="{ '--rank-delay': `${Math.min(index, 8) * 55}ms` }"
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
.round-progress-display {
  position: relative;
  display: grid;
  place-items: center;
  width: 224px;
  aspect-ratio: 1;
  margin: 8px auto 16px;
  isolation: isolate;
}
.round-ring-visual {
  position: absolute;
  inset: 0;
  transform-origin: center;
}
svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  overflow: visible;
}
circle {
  fill: none;
  stroke-width: 24;
  stroke-linecap: round;
}
.round-progress-track {
  stroke: #f0f0f0;
}
.round-progress-value {
  stroke: #111;
}
.round-progress-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-variant-numeric: tabular-nums;
}
.round-number-window {
  display: block;
  height: 1em;
  overflow: hidden;
  min-width: 1ch;
  text-align: center;
  font-size: 58px;
  line-height: 1;
  font-weight: 600;
  letter-spacing: -2px;
}
.round-number-reel {
  display: flex;
  flex-direction: column;
  will-change: transform;
}
.round-number-reel > span {
  display: block;
  height: 1em;
  flex-shrink: 0;
}
.round-total {
  font-size: 17px;
  color: #999;
  margin-top: 24px;
}
.round-summary {
  text-align: center;
  margin: 0 0 24px;
  font-size: 15px;
  color: #777;
}
.round-plus {
  position: absolute;
  left: calc(50% - 18px);
  top: calc(50% - 16px);
  font-size: 23px;
  font-weight: 650;
  pointer-events: none;
  background: #fff;
  border-radius: 20px;
  padding: 3px 7px;
  animation: absorb-plus 460ms cubic-bezier(0.55, 0.03, 0.88, 0.5) both;
}
@keyframes absorb-plus {
  0% {
    opacity: 0;
    transform: translate(calc(var(--side) * 138px), 112px) scale(0.8);
  }
  25% {
    opacity: 1;
  }
  72% {
    opacity: 1;
    transform: translate(calc(var(--side) * 76px), 62px) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(calc(var(--side) * 40px), 35px) scale(0.25);
  }
}
.round-ranking {
  padding: 0;
  margin: 0;
  list-style: none;
  position: relative;
  overflow: hidden;
}
.round-ranking li {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 66px;
  border-bottom: 1px solid #eee;
}
.round-ranking li > strong {
  flex: 1;
  font-size: 18px;
  font-weight: 500;
}
.rank-number {
  width: 22px;
  color: #999;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.round-ranking .van-icon {
  color: #aaa;
  font-size: 18px;
}
.round-rank-enter-active {
  transition:
    transform 520ms cubic-bezier(0.18, 0.8, 0.25, 1) var(--rank-delay),
    opacity 360ms ease var(--rank-delay);
}
.round-rank-leave-active {
  transition:
    opacity 160ms ease,
    transform 240ms ease;
  position: absolute;
  width: 100%;
}
.round-rank-enter-from {
  opacity: 0;
  transform: translateX(42px);
}
.round-rank-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
.round-rank-move {
  transition: transform 320ms ease;
}
.round-empty {
  text-align: center;
  color: #999;
  margin: 12px 0 20px;
  font-size: 15px;
}
.round-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.is-compact .round-progress-display {
  width: 48px;
  margin: 0;
}
.is-compact circle {
  stroke-width: 22;
}
.is-compact .round-number-window {
  font-size: 16px;
  letter-spacing: 0;
}
.is-compact .round-total {
  display: none;
}
.is-compact .round-plus {
  font-size: 12px;
  left: calc(50% - 12px);
  top: calc(50% - 9px);
  animation-name: absorb-mini;
}
@keyframes absorb-mini {
  0% {
    opacity: 0;
    transform: translate(calc(var(--side) * 50px), 40px) scale(0.8);
  }
  25% {
    opacity: 1;
  }
  72% {
    opacity: 1;
    transform: translate(calc(var(--side) * 27px), 24px);
  }
  100% {
    opacity: 0;
    transform: translate(calc(var(--side) * 12px), 12px) scale(0.25);
  }
}
.quiet-motion * {
  animation: none !important;
  transition: none !important;
}
.quiet-motion .round-plus {
  display: none;
}
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
</style>
