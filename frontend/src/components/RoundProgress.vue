<script setup lang="ts">
import "../interaction/memberNames.css";
import {
  computed,
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import { animate as springAnimate, useMotionValue } from "motion-v";
import { motionTokens } from "../interaction/motion";
import type { ChoreBoardData } from "../api/chores";
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
const emit = defineEmits<{ count: [count: number] }>();
const filter = ref<"completed" | "pending">("completed");
const people = computed(() =>
  filter.value === "completed"
    ? [...(props.round.completions || [])].sort(
        (a, b) => a.completed_at.localeCompare(b.completed_at) || a.id - b.id,
      )
    : props.round.members
        .filter((m) => !m.completed)
        .map((m) => ({ ...m, id: m.user_id, completed_at: "" })),
);
const host = ref<HTMLElement>(),
  header = ref<HTMLElement>(),
  ranking = ref<HTMLElement>();
const compression = useMotionValue(0);
let compressed = false,
  headerHeight = 0,
  resize: ResizeObserver | undefined;
function paintCompression(value: number) {
  if (
    props.compact ||
    !host.value ||
    !header.value ||
    !host.value.closest(".has-fixed-content")
  )
    return;
  const display = header.value.querySelector<HTMLElement>(
    ".round-progress-display",
  );
  const diameter = display?.offsetHeight || 0;
  const delta = Math.max(0, diameter * 0.55);
  if (display)
    display.style.transform = `translateY(${-4 * value}px) scale(${1 - value * 0.55},${1 - value * 0.55 + Math.sin(value * Math.PI) * 0.018})`;
  for (const el of header.value.querySelectorAll<HTMLElement>(
    ".round-summary,.round-filters",
  ))
    el.style.transform = `translateY(${-delta * value}px)`;
  if (ranking.value) {
    ranking.value.style.top = `${headerHeight}px`;
    ranking.value.style.height = `${Math.max(0, host.value.clientHeight - headerHeight + delta)}px`;
    ranking.value.style.transform = `translateY(${-delta * value}px)`;
  }
}
const unsubscribe = compression.on("change", paintCompression);
function compress(value: boolean) {
  if (compressed === value) return;
  compressed = value;
  if (!motionAllowed()) compression.jump(value ? 1 : 0);
  else
    springAnimate(compression, value ? 1 : 0, {
      ...motionTokens.settle,
      stiffness: 440,
      damping: 32,
      velocity: compression.getVelocity(),
    });
}
function measure() {
  headerHeight = header.value?.offsetHeight || 0;
  paintCompression(compression.get());
}
function scrollRanking() {
  const top = ranking.value?.scrollTop || 0;
  if (top > 8) compress(true);
  else if (top === 0) compress(false);
}
// A short list can be clipped by the expanded ring yet fit the preallocated
// native viewport. Accept the scroll intent too, without animating its height
// or adding a blank spacer merely to manufacture scroll range.
let listPointerY: number | null = null;
function listPointerDown(event: PointerEvent) {
  if (event.isPrimary) listPointerY = event.clientY;
}
function listPointerMove(event: PointerEvent) {
  if (listPointerY === null) return;
  const dy = event.clientY - listPointerY;
  if (dy < -8) compress(true);
  else if (dy > 8 && (ranking.value?.scrollTop || 0) < 1) compress(false);
}
function wheelRanking(event: WheelEvent) {
  if (event.deltaY > 0) compress(true);
  else if (event.deltaY < 0 && (ranking.value?.scrollTop || 0) < 1)
    compress(false);
}
function keyRanking(event: KeyboardEvent) {
  if (["ArrowDown", "PageDown", "End"].includes(event.key)) compress(true);
  else if (
    ["ArrowUp", "PageUp", "Home"].includes(event.key) &&
    (ranking.value?.scrollTop || 0) < 1
  )
    compress(false);
}

watch(
  [
    filter,
    () => props.active,
    () => props.round.key,
    () => props.round.sequence,
  ],
  async (_, previous) => {
    if (
      previous &&
      (!props.active ||
        previous[2] !== props.round.key ||
        previous[3] !== props.round.sequence)
    )
      filter.value = "completed";
    await nextTick();
    if (ranking.value) ranking.value.scrollTop = 0;
    compress(false);
    measure();
  },
);
watch(people, (value) => emit("count", value.length), { immediate: true });
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
  compression.jump(compressed ? 1 : 0);
}
onMounted(() => {
  resize = new ResizeObserver(measure);
  if (host.value) resize.observe(host.value);
  if (header.value) resize.observe(header.value);
  measure();
  document.addEventListener("visibilitychange", finishWhenMotionUnavailable);
  reducedMotion.addEventListener("change", finishWhenMotionUnavailable);
  window.addEventListener("ui-motion-change", finishWhenMotionUnavailable);
});
onBeforeUnmount(() => {
  resize?.disconnect();
  unsubscribe();
  compression.destroy();
  stop();
  document.removeEventListener("visibilitychange", finishWhenMotionUnavailable);
  reducedMotion.removeEventListener("change", finishWhenMotionUnavailable);
  window.removeEventListener("ui-motion-change", finishWhenMotionUnavailable);
});
</script>
<template>
  <div
    ref="host"
    class="round-achievement"
    :class="{ 'quiet-motion': !motionAllowed(), 'is-compact': compact }"
  >
    <div ref="header" class="round-header">
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
              ><span v-for="digit in digits" :key="digit">{{
                digit
              }}</span></span
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
      <p v-if="!compact && completed" class="round-summary">
        {{ completed === round.total ? "全员完成" : "本轮已完成" }}
      </p>
      <div
        v-if="!compact"
        class="round-filters"
        role="group"
        aria-label="本轮名单"
      >
        <button
          :aria-pressed="filter === 'completed'"
          @click="filter = 'completed'"
        >
          已完成 {{ completed }}
        </button>
        <button
          :aria-pressed="filter === 'pending'"
          @click="filter = 'pending'"
        >
          未完成 {{ round.total - completed }}
        </button>
      </div>
    </div>
    <div
      v-if="!compact"
      ref="ranking"
      class="round-ranking-viewport"
      data-native-scroll
      tabindex="0"
      aria-label="本轮成员名单"
      @scroll.passive="scrollRanking"
      @wheel.passive="wheelRanking"
      @pointerdown.passive="listPointerDown"
      @pointermove.passive="listPointerMove"
      @pointerup="listPointerY = null"
      @pointercancel="listPointerY = null"
      @keydown="keyRanking"
    >
      <TransitionGroup
        v-if="people.length"
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
          <span class="rank-number">{{
            String(index + 1).padStart(2, "0")
          }}</span
          ><strong>{{ person.nickname }}</strong
          ><van-icon
            :name="filter === 'completed' ? 'success' : 'circle'"
            aria-hidden="true"
          />
        </li>
      </TransitionGroup>
      <p v-if="!people.length" class="round-empty">
        {{ filter === "completed" ? "等待第一位室友" : "全员完成" }}
      </p>
    </div>
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
.round-ring-visual > svg {
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
  stroke: var(--app-tone-hf0f0f0, #f0f0f0);
}
.round-progress-value {
  stroke: var(--app-tone-h111, #111);
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
  color: var(--app-tone-h999, #999);
  margin-top: 24px;
}
.round-summary {
  text-align: center;
  margin: 0 0 24px;
  font-size: 15px;
  color: var(--app-tone-h777, #777);
}
.round-plus {
  position: absolute;
  left: calc(50% - 18px);
  top: calc(50% - 16px);
  font-size: 23px;
  font-weight: 650;
  pointer-events: none;
  background: var(--app-tone-hfff, #fff);
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
  border-bottom: 1px solid var(--app-tone-heee, #eee);
}
.round-ranking li > strong {
  flex: 1;
  font-size: 18px;
  font-weight: 500;
}
.rank-number {
  width: 22px;
  color: var(--app-tone-h999, #999);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.round-ranking .van-icon {
  color: var(--app-tone-haaa, #aaa);
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
  color: var(--app-tone-h999, #999);
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

<style scoped>
.has-fixed-content .round-achievement {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.has-fixed-content .round-progress-display {
  flex-shrink: 0;
  width: min(224px, 27dvh);
}
.has-fixed-content .round-summary {
  flex-shrink: 0;
  margin: 8px 0 16px;
}
.has-fixed-content .round-ranking {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  touch-action: pan-y;
}
</style>

<style scoped>
.has-fixed-content .round-empty {
  margin: 8px 0 16px;
  flex-shrink: 0;
}
</style>

<style scoped>
.round-achievement {
  position: relative;
  isolation: isolate;
}
.round-header {
  position: relative;
  z-index: 1;
  pointer-events: none;
}
.round-progress-display {
  transform-origin: 50% 0;
}
.round-filters {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 0 0 12px;
  pointer-events: auto;
}
.round-filters button {
  border: 0;
  border-radius: 16px;
  padding: 8px 14px;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 14px;
  transition:
    transform var(--ui-release-time) var(--ui-ease-out),
    background-color 160ms;
}
.round-filters button[aria-pressed="true"] {
  background: var(--ui-surface-muted);
  color: var(--ui-ink);
}
.round-filters button:active {
  transform: scale(0.96);
}
.round-ranking-viewport {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
}
.has-fixed-content .round-ranking-viewport {
  position: absolute;
  inset-inline: 0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.has-fixed-content .round-ranking {
  overflow: visible;
}
.has-fixed-content .round-achievement {
  overflow: hidden;
  display: block;
}
@media (prefers-reduced-motion: reduce) {
  .round-filters button {
    transition: none;
  }
}
</style>
