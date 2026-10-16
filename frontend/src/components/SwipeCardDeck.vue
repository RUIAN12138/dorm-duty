<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { motionAllowed } from "../interaction/motion";
import {
  createVelocityTracker,
  rubberBand,
  horizontalIntent,
} from "../interaction/gestures";
const props = defineProps<{
  modelValue: number;
  labels: string[];
  label: string;
}>();
const emit = defineEmits<{ "update:modelValue": [index: number] }>();
const stage = ref<HTMLElement>(),
  offset = ref(0),
  dragging = ref(false),
  leaving = ref(false);
let gesture: {
  id: number;
  x: number;
  y: number;
  element: HTMLElement;
  horizontal: boolean;
  velocity: ReturnType<typeof createVelocityTracker>;
} | null = null;
let timer: ReturnType<typeof setTimeout> | undefined,
  suppressUntil = 0;
function depth(index: number) {
  return (index - props.modelValue + props.labels.length) % props.labels.length;
}
function pose(index: number) {
  const d = depth(index),
    front = d === 0;
  return {
    zIndex: props.labels.length - d,
    opacity: d < 3 ? 1 : 0,
    transform: front
      ? `translate3d(${offset.value}px,0,0) rotate(${offset.value / 65}deg)`
      : `translate3d(${d * 4}px,${-d * 18}px,0) rotate(${d % 2 ? -2 : 2}deg) scale(${1 - d * 0.035})`,
    pointerEvents: front ? ("auto" as const) : ("none" as const),
  };
}
function reset() {
  const old = gesture;
  gesture = null;
  dragging.value = false;
  if (old?.element.hasPointerCapture(old.id))
    old.element.releasePointerCapture(old.id);
}
function choose(index: number) {
  if (
    index < 0 ||
    index >= props.labels.length ||
    index === props.modelValue ||
    leaving.value
  )
    return;
  reset();
  if (!motionAllowed()) {
    offset.value = 0;
    emit("update:modelValue", index);
    return;
  }
  leaving.value = true;
  offset.value =
    (index > props.modelValue ? -1 : 1) *
    (stage.value?.clientWidth || 320) *
    1.15;
  clearTimeout(timer);
  timer = setTimeout(() => {
    emit("update:modelValue", index);
    offset.value = 0;
    leaving.value = false;
  }, 180);
}
function down(e: PointerEvent) {
  e.stopPropagation();
  if (
    !e.isPrimary ||
    e.button !== 0 ||
    gesture ||
    leaving.value ||
    (e.target instanceof Element &&
      e.target.closest("button,a,input,select,textarea"))
  )
    return;
  gesture = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    element: e.currentTarget as HTMLElement,
    horizontal: false,
    velocity: createVelocityTracker(e.clientX, performance.now()),
  };
}
function move(e: PointerEvent) {
  if (!gesture || gesture.id !== e.pointerId) return;
  const x = e.clientX - gesture.x,
    y = e.clientY - gesture.y;
  gesture.velocity.add(e.clientX, performance.now());
  if (!gesture.horizontal) {
    const intent = horizontalIntent(x, y);
    if (intent === "vertical") {
      reset();
      return;
    }
    if (intent !== "horizontal") return;
    gesture.horizontal = true;
    dragging.value = true;
    gesture.element.setPointerCapture(e.pointerId);
  }
  e.preventDefault();
  e.stopPropagation();
  const blocked =
    (x > 0 && props.modelValue === 0) ||
    (x < 0 && props.modelValue === props.labels.length - 1);
  offset.value = blocked ? rubberBand(x, 64) : x;
  suppressUntil = performance.now() + 500;
}
function up(e: PointerEvent, cancel = false) {
  if (!gesture || gesture.id !== e.pointerId) return;
  const x = offset.value,
    projected = x + gesture.velocity.read(performance.now()) * 100;
  const commit =
    !cancel &&
    gesture.horizontal &&
    (Math.abs(x) > 52 || (Math.abs(x) > 24 && Math.abs(projected) > 90));
  reset();
  if (commit) {
    const next = props.modelValue + (x < 0 ? 1 : -1);
    if (next >= 0 && next < props.labels.length) {
      choose(next);
      return;
    }
  }
  offset.value = 0;
}
function click(e: MouseEvent) {
  if (e.detail && performance.now() < suppressUntil) {
    e.preventDefault();
    e.stopPropagation();
  }
}
function inactive() {
  if (!motionAllowed()) {
    clearTimeout(timer);
    reset();
    offset.value = 0;
    leaving.value = false;
  }
}
const media = matchMedia("(prefers-reduced-motion: reduce)");
media.addEventListener("change", inactive);
window.addEventListener("ui-motion-change", inactive);
document.addEventListener("visibilitychange", inactive);
onBeforeUnmount(() => {
  clearTimeout(timer);
  reset();
  media.removeEventListener("change", inactive);
  window.removeEventListener("ui-motion-change", inactive);
  document.removeEventListener("visibilitychange", inactive);
});
watch(
  () => props.labels.length,
  () => {
    reset();
    offset.value = 0;
    if (props.modelValue >= props.labels.length) emit("update:modelValue", 0);
  },
);
</script>
<template>
  <section class="swipe-card-deck" :aria-label="label" data-page-gesture>
    <div
      ref="stage"
      class="deck-stage"
      :class="{ 'is-dragging': dragging, 'is-leaving': leaving }"
      tabindex="0"
      @keydown.left.prevent="choose(modelValue - 1)"
      @keydown.right.prevent="choose(modelValue + 1)"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up($event)"
      @pointercancel="up($event, true)"
      @lostpointercapture="up($event, true)"
      @click.capture="click"
    >
      <article
        v-for="(name, index) in labels"
        :key="name"
        class="deck-card"
        :class="{ 'is-front': index === modelValue }"
        :style="pose(index)"
        :aria-hidden="index !== modelValue"
        :inert="index !== modelValue ? true : undefined"
        :aria-label="name"
        :data-card-index="index"
      >
        <slot :index="index" :active="index === modelValue" />
      </article>
    </div>
    <div class="deck-controls">
      <button
        aria-label="上一张统计卡片"
        :disabled="modelValue === 0 || leaving"
        @click="choose(modelValue - 1)"
      >
        <van-icon name="arrow-left" aria-hidden="true" />
      </button>
      <div class="deck-dots" aria-label="选择统计卡片">
        <button
          v-for="(name, index) in labels"
          :key="name"
          :aria-label="`查看${name}统计`"
          :aria-current="index === modelValue ? 'true' : undefined"
          :disabled="leaving"
          @click="choose(index)"
        >
          <span />
        </button>
      </div>
      <button
        aria-label="下一张统计卡片"
        :disabled="modelValue === labels.length - 1 || leaving"
        @click="choose(modelValue + 1)"
      >
        <van-icon name="arrow" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>
<style scoped>
.swipe-card-deck {
  display: grid;
  gap: var(--ui-space-sm);
  min-width: 0;
  overflow: hidden;
  padding-top: 24px;
}
.deck-stage {
  position: relative;
  isolation: isolate;
  margin: 0 8px;
  min-width: 0;
  height: clamp(236px, calc(100svh - 370px), 350px);
  touch-action: pan-y;
  outline: none;
}
.deck-stage:focus-visible {
  outline: 2px solid var(--ui-ink);
  outline-offset: 8px;
  border-radius: var(--ui-card-radius);
}
.deck-card {
  position: absolute;
  inset: 0;
  border: var(--ui-card-border);
  border-radius: 20px;
  background: var(--ui-surface);
  transform-origin: center bottom;
  transition:
    transform 360ms var(--ui-ease-out),
    opacity 180ms var(--ui-ease-out);
  overflow: hidden;
}
.is-dragging .is-front {
  transition: none;
}
.is-leaving .is-front {
  transition:
    transform 180ms var(--ui-ease-out),
    opacity 180ms var(--ui-ease-out);
}
.deck-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}
.deck-controls > button,
.deck-dots button {
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  color: var(--ui-ink);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.deck-controls > button:disabled {
  opacity: 0.25;
  cursor: default;
}
.deck-dots {
  display: flex;
  align-items: center;
}
.deck-dots button {
  width: 32px;
}
.deck-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #d6d6d6;
  transition: transform 240ms var(--ui-ease-out);
}
.deck-dots button[aria-current] span {
  background: var(--ui-ink);
  transform: scale(1.3);
}
@media (prefers-reduced-motion: reduce) {
  .deck-card,
  .deck-dots span {
    transition: none;
  }
}
</style>
