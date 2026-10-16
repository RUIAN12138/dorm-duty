<script setup lang="ts">
import { ref, onBeforeUnmount } from "vue";
import {
  horizontalIntent,
  createVelocityTracker,
} from "../interaction/gestures";
import { motionAllowed } from "../interaction/motion";
// React Bits Stack: overlapping cards with depth; Carousel: velocity and snap.
// Vue implementation, no React source or runtime bundled.
const props = defineProps<{
  modelValue: number;
  labels: string[];
  label: string;
}>();
const emit = defineEmits<{ "update:modelValue": [index: number] }>();
const stage = ref<HTMLElement>(),
  offset = ref(0),
  dragging = ref(false),
  settling = ref(false);
let gesture: {
  id: number;
  x: number;
  y: number;
  horizontal: boolean;
  target: HTMLElement;
  velocity: ReturnType<typeof createVelocityTracker>;
} | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const width = () => stage.value?.clientWidth || 300;
function target() {
  return (
    (props.modelValue + (offset.value > 0 ? -1 : 1) + props.labels.length) %
    props.labels.length
  );
}
function depth(index: number) {
  if (index === props.modelValue) return 0;
  let next = target();
  if (next < 0 || next >= props.labels.length)
    next =
      props.modelValue === props.labels.length - 1
        ? props.modelValue - 1
        : props.modelValue + 1;
  const order = [
    next,
    ...props.labels
      .map((_, i) => i)
      .filter((i) => i !== props.modelValue && i !== next),
  ];
  return order.indexOf(index) + 1;
}
function pose(index: number) {
  const d = depth(index),
    p = Math.min(1, Math.abs(offset.value) / (width() * 0.8));
  if (d === 0)
    return {
      zIndex: 10,
      opacity: 1,
      transform: `translate3d(${offset.value}px,0,0) rotateZ(${offset.value / 65}deg) rotateY(${-offset.value / 110}deg)`,
    };
  if (d === 1)
    return {
      zIndex: 9,
      opacity: 1,
      transform: `translate3d(${9 * (1 - p)}px,${-18 * (1 - p)}px,${-12 * (1 - p)}px) rotateZ(${2.8 * (1 - p)}deg) scale(${0.96 + 0.04 * p})`,
    };
  const layer = Math.min(2, d - 1);
  return {
    zIndex: 8 - layer,
    opacity: d < 5 ? 1 : 0,
    transform: `translate3d(${-6 * layer}px,${-18 * layer}px,${-12 * layer}px) rotateZ(${-2 * layer}deg) scale(${1 - 0.04 * layer})`,
  };
}
function dotPose(index: number) {
  const progress = Math.min(1, Math.abs(offset.value) / (width() * 0.8));
  const weight =
    index === props.modelValue
      ? 1 - progress
      : index === target()
        ? progress
        : 0;
  return {
    opacity: weight,
    transform: `scale(${1 + weight * 0.35})`,
  };
}
function release() {
  const old = gesture;
  gesture = null;
  dragging.value = false;
  if (old?.target.hasPointerCapture(old.id))
    old.target.releasePointerCapture(old.id);
}
function choose(requested: number) {
  const index = (requested + props.labels.length) % props.labels.length;
  if (props.labels.length < 2 || index === props.modelValue || settling.value) {
    offset.value = 0;
    return;
  }
  release();
  if (!motionAllowed()) {
    offset.value = 0;
    emit("update:modelValue", index);
    return;
  }
  settling.value = true;
  offset.value = (requested > props.modelValue ? -1 : 1) * (width() + 48);
  clearTimeout(timer);
  timer = setTimeout(() => {
    emit("update:modelValue", index);
    offset.value = 0;
    settling.value = false;
  }, 220);
}
function down(e: PointerEvent) {
  e.stopPropagation();
  if (!e.isPrimary || e.button !== 0 || gesture || settling.value) return;
  gesture = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    horizontal: false,
    target: e.currentTarget as HTMLElement,
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
      release();
      return;
    }
    if (intent !== "horizontal") return;
    gesture.horizontal = true;
    dragging.value = true;
    gesture.target.setPointerCapture(e.pointerId);
  }
  e.preventDefault();
  offset.value = x;
}
function up(e: PointerEvent, cancel = false) {
  if (!gesture || gesture.id !== e.pointerId) return;
  // Touch implicitly captures the original text/face. Transferring capture to
  // the stage emits a bubbling lostpointercapture from that child; it is not
  // cancellation while the stage still owns this pointer.
  if (
    e.type === "lostpointercapture" &&
    gesture.target.hasPointerCapture(e.pointerId)
  )
    return;
  const old = gesture,
    x = offset.value,
    projected = x + old.velocity.read(performance.now()) * 100;
  release();
  if (
    !cancel &&
    old.horizontal &&
    (Math.abs(x) > width() * 0.22 ||
      (Math.abs(x) > 24 && Math.abs(projected) > 90))
  ) {
    const next = props.modelValue + (x < 0 ? 1 : -1);
    choose(next);
    return;
  }
  offset.value = 0;
}
function quiet() {
  if (!motionAllowed()) {
    clearTimeout(timer);
    release();
    offset.value = 0;
    settling.value = false;
  }
}
const media = matchMedia("(prefers-reduced-motion: reduce)");
media.addEventListener("change", quiet);
document.addEventListener("visibilitychange", quiet);
window.addEventListener("ui-motion-change", quiet);
onBeforeUnmount(() => {
  clearTimeout(timer);
  release();
  media.removeEventListener("change", quiet);
  document.removeEventListener("visibilitychange", quiet);
  window.removeEventListener("ui-motion-change", quiet);
});
</script>
<template>
  <section class="swipe-card-deck" :aria-label="label" data-page-gesture>
    <div
      ref="stage"
      class="deck-stage"
      :class="{ 'is-dragging': dragging, 'is-settling': settling }"
      tabindex="0"
      :aria-label="`${label}，左右滑动切换`"
      @keydown.left.prevent="choose(modelValue - 1)"
      @keydown.right.prevent="choose(modelValue + 1)"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up($event)"
      @pointercancel="up($event, true)"
      @lostpointercapture="up($event, true)"
      @dragstart.prevent
    >
      <article
        v-for="(name, index) in labels"
        :key="name"
        class="deck-card"
        :class="{ 'is-front': index === modelValue }"
        :style="pose(index)"
        :aria-label="name"
        :aria-hidden="index !== modelValue"
        :inert="index !== modelValue ? true : undefined"
        :data-card-index="index"
      >
        <div class="deck-card-face">
          <slot :index="index" :active="index === modelValue" />
        </div>
      </article>
    </div>
    <div
      class="deck-dots"
      :class="{ 'is-dragging': dragging, 'is-settling': settling }"
      aria-hidden="true"
    >
      <span
        v-for="(_, index) in labels"
        :key="index"
        :class="{ 'is-current': index === modelValue }"
        ><i class="deck-dot-fill" :style="dotPose(index)" />
      </span>
    </div>
    <span class="sr-only" aria-live="polite"
      >{{ labels[modelValue] }}，第 {{ modelValue + 1 }} 张，共
      {{ labels.length }} 张</span
    >
  </section>
</template>
<style scoped>
.swipe-card-deck {
  min-width: 0;
  isolation: isolate;
  overflow: hidden;
}
.deck-stage {
  position: relative;
  isolation: isolate;
  min-width: 0;
  min-height: 0;
  margin: 28px 12px 8px;
  touch-action: pan-y;
  outline: none;
  cursor: grab;
  perspective: 1000px;
  transform-style: preserve-3d;
  user-select: none;
  -webkit-user-select: none;
}
.deck-stage:active {
  cursor: grabbing;
}
.deck-stage:focus-visible {
  outline: 2px solid var(--ui-ink);
  outline-offset: 4px;
  border-radius: 24px;
}
.deck-card {
  position: absolute;
  inset: 0;
  min-width: 0;
  border: 0;
  border-radius: 24px;
  overflow: visible;
  background: transparent;
  transform-style: preserve-3d;
  box-shadow: 0 10px 16px #1111110b;
  transform-origin: center bottom;
  transition:
    transform 280ms var(--ui-ease-out),
    opacity 180ms var(--ui-ease-out);
}
.deck-card::before,
.deck-card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 1px solid #d4d4d1;
  background: #dfdfdc;
  pointer-events: none;
  transform: translate3d(0, 5px, -3px);
}
.deck-card::after {
  background: #eeeeeb;
  transform: translate3d(0, 2px, -1px);
}
.deck-card-face {
  position: relative;
  height: 100%;
  border: var(--ui-card-border);
  border-radius: inherit;
  overflow: hidden;
  background: var(--ui-surface);
  transform: translateZ(0);
  backface-visibility: hidden;
}
.is-dragging .deck-card {
  transition: none;
}
.is-settling .deck-card {
  transition:
    transform 220ms var(--ui-ease-out),
    opacity 180ms var(--ui-ease-out);
}
.deck-dots {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  height: 32px;
}
.deck-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ddd;
}
.deck-dot-fill {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: #111;
  transition:
    opacity 220ms var(--ui-ease-out),
    transform 220ms var(--ui-ease-out);
}
.deck-dots.is-dragging .deck-dot-fill {
  transition: none;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .deck-card,
  .deck-dot-fill {
    transition: none;
  }
}
</style>
