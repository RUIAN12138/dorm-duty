<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { animate } from 'motion-v';
import { motionAllowed, motionTokens } from '../../interaction/motion';
import { observeElementSize } from './observeElementSize.mjs';

const props = defineProps<{ modelValue: number; labels: string[]; navLabel?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const host = ref<HTMLElement>();
const thumb = ref<HTMLElement>();
const fill = ref<HTMLElement>();
const hostWidth = ref(0);
const pressed = ref(false);
const dragging = ref(false);
const thumbVisible = ref(false);
const stretch = ref(0);
let position = props.modelValue;
let flight: ReturnType<typeof animate> | undefined;
let targetPosition = 0;
let flightRevision = 0;
let hideAfterSettle = false;
let stopObservingSize: (() => void) | undefined;
let clickSuppressedUntil = 0;
let gesture: {
  pointerId: number;
  startX: number;
  startY: number;
  rect: DOMRect;
  dragging: boolean;
  index: number;
  lastX: number;
  lastAt: number;
} | null = null;

const lastIndex = () => Math.max(0, props.labels.length - 1);
const bound = (value: number) => Math.max(0, Math.min(lastIndex(), value));
const hitWidth = () => Math.max(44, Math.min(64, (hostWidth.value - 48) / Math.max(1, lastIndex())));
const progressNodes = computed(() => {
  const count = Math.min(5, props.labels.length);
  return Array.from({ length: count }, (_, index) => {
    const position = count <= 1 ? 0 : index * lastIndex() / (count - 1);
    return {
      index,
      position,
      left: 24 + Math.max(0, hostWidth.value - 48) * (count <= 1 ? 0 : index / (count - 1)),
      complete: position <= props.modelValue + 0.001,
      current: Math.abs(position - props.modelValue) < 0.5,
    };
  });
});

function paint(value: number) {
  position = bound(value);
  const fraction = position / Math.max(1, lastIndex());
  const x = 24 + Math.max(0, hostWidth.value - 48) * fraction;
  if (thumb.value) thumb.value.style.transform = `translate3d(${x}px,0,0) translateX(-50%)`;
  if (fill.value) fill.value.style.transform = `scaleX(${fraction})`;
}

function settle(value: number, hide = false) {
  const target = bound(value);
  hideAfterSettle = hide;
  if (flight && targetPosition === target) return;
  flight?.stop();
  flight = undefined;
  targetPosition = target;
  const revision = ++flightRevision;
  if (!motionAllowed()) {
    paint(target);
    if (hideAfterSettle) thumbVisible.value = false;
    return;
  }
  flight = animate(position, target, {
    ...motionTokens.selection,
    onUpdate: paint,
    onComplete: () => {
      if (revision !== flightRevision || gesture) return;
      if (hideAfterSettle) thumbVisible.value = false;
      flight = undefined;
    },
  });
}

function vibrateForStep() {
  // navigator.vibrate is supported in some Android WebViews; iOS Safari ignores it.
  try {
    navigator.vibrate?.(6);
  } catch {
    // Haptics are an optional enhancement; progress navigation remains usable.
  }
}

function updateStep(index: number) {
  const next = bound(index);
  const previous = gesture?.index ?? props.modelValue;
  if (next === previous) return;
  if (gesture) gesture.index = next;
  emit('update:modelValue', next);
  for (let step = 0; step < Math.abs(next - previous); step++) vibrateForStep();
}

function stepAt(clientX: number, rect: DOMRect) {
  const first = 24;
  const span = Math.max(1, rect.width - first * 2);
  const fraction = Math.max(0, Math.min(1, (clientX - rect.left - first) / span));
  return fraction * lastIndex();
}

function applyHorizontalPoint(clientX: number, active: NonNullable<typeof gesture>) {
  const raw = stepAt(clientX, active.rect);
  paint(raw);

  // A small hysteresis prevents the live page from flickering at step boundaries.
  const current = active.index;
  const candidate = Math.round(raw);
  const crossed = candidate > current
    ? raw >= current + 0.58
    : candidate < current
      ? raw <= current - 0.58
      : false;
  if (crossed) updateStep(candidate);
}

function down(event: PointerEvent) {
  if (event.button !== 0 || gesture || props.labels.length < 2) return;
  flight?.stop();
  flight = undefined;
  flightRevision++;
  hideAfterSettle = false;
  thumbVisible.value = true;
  pressed.value = true;
  stretch.value = 0.045;
  gesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    rect: host.value!.getBoundingClientRect(),
    dragging: false,
    index: props.modelValue,
    lastX: event.clientX,
    lastAt: performance.now(),
  };
  paint(props.modelValue);
}

function move(event: PointerEvent) {
  const active = gesture;
  if (!active || event.pointerId !== active.pointerId) return;
  const dx = event.clientX - active.startX;
  const dy = event.clientY - active.startY;
  if (!active.dragging && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
    gesture = null;
    pressed.value = false;
    dragging.value = false;
    stretch.value = 0;
    settle(props.modelValue, true);
    return;
  }
  if (!active.dragging && Math.abs(dx) < 5) return;
  active.dragging = true;
  dragging.value = true;
  if (host.value && !host.value.hasPointerCapture(event.pointerId)) {
    host.value.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
  applyHorizontalPoint(event.clientX, active);
  const now = performance.now();
  const speed = Math.abs(event.clientX - active.lastX) / Math.max(1, now - active.lastAt);
  stretch.value = Math.min(0.085, 0.035 + speed * 0.012);
  active.lastX = event.clientX;
  active.lastAt = now;
}

function up(event: PointerEvent) {
  const active = gesture;
  if (!active || event.pointerId !== active.pointerId) return;

  const dx = event.clientX - active.startX;
  const dy = event.clientY - active.startY;
  if (!active.dragging && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
    gesture = null;
    pressed.value = false;
    dragging.value = false;
    stretch.value = 0;
    settle(props.modelValue);
    return;
  }
  if (!active.dragging && Math.abs(dx) >= 5) {
    active.dragging = true;
    dragging.value = true;
  }

  // Use pointerup as the final sample. Some touch stacks coalesce the last
  // pointermove, so the thumb and page must settle from the actual release point.
  if (active.dragging) applyHorizontalPoint(event.clientX, active);
  gesture = null;
  pressed.value = false;
  dragging.value = false;
  stretch.value = 0;
  if (active.dragging) {
    clickSuppressedUntil = performance.now() + 350;
    const target = bound(Math.round(position));
    if (target !== active.index) {
      emit('update:modelValue', target);
      for (let step = 0; step < Math.abs(target - active.index); step++) vibrateForStep();
    }
    settle(target, true);
  } else {
    // The subsequent click selects the hit target or track coordinate. Keep
    // the thumb visible until that event has resolved the tap.
    settle(props.modelValue);
  }
}

function cancel(event?: PointerEvent) {
  if (event && gesture && event.pointerId !== gesture.pointerId) return;
  gesture = null;
  pressed.value = false;
  dragging.value = false;
  stretch.value = 0;
  settle(props.modelValue, true);
}

function select(index: number) {
  if (performance.now() < clickSuppressedUntil) return;
  const next = bound(index);
  flightRevision++;
  hideAfterSettle = true;
  thumbVisible.value = true;
  if (next !== props.modelValue) {
    emit('update:modelValue', next);
    vibrateForStep();
  }
  settle(next, true);
}

function tapTrack(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (target.closest('.progress-hit')) return;
  const rect = host.value?.getBoundingClientRect();
  if (rect) select(Math.round(stepAt(event.clientX, rect)));
}

async function keydown(event: KeyboardEvent, index: number) {
  let next = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next += 1;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next -= 1;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = lastIndex();
  else return;
  event.preventDefault();
  select(next);
  await nextTick();
  host.value?.querySelectorAll<HTMLButtonElement>('.progress-hit')[bound(next)]?.focus();
}

watch(() => [props.modelValue, props.labels.length], () => {
  if (!gesture?.dragging) settle(props.modelValue, thumbVisible.value && hideAfterSettle);
});

onMounted(() => {
  const resize = () => {
    hostWidth.value = host.value?.clientWidth || 0;
    paint(props.modelValue);
  };
  resize();
  if (host.value) stopObservingSize = observeElementSize(host.value, resize, window);
});
onBeforeUnmount(() => {
  flight?.stop();
  stopObservingSize?.();
  stopObservingSize = undefined;
});
</script>

<template>
  <nav
    ref="host"
    class="creation-progress"
    :aria-label="navLabel || '新宿舍创建进度'"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="cancel"
    @lostpointercapture="cancel"
    @click="tapTrack"
  >
    <div class="progress-track" aria-hidden="true"><i ref="fill" /></div>
    <i
      v-for="node in progressNodes"
      :key="`node-${node.index}`"
      class="progress-node"
      :class="{ 'is-complete': node.complete, 'is-current': node.current }"
      :style="{ left: `${node.left}px` }"
      aria-hidden="true"
    />
    <div
      ref="thumb"
      class="progress-glass"
      :class="{ 'is-visible': thumbVisible, 'is-pressed': pressed, 'is-dragging': dragging }"
      :style="{ '--thumb-stretch': stretch }"
      aria-hidden="true"
    ><span class="progress-glass-surface" /></div>
    <button
      v-for="(label, index) in labels"
      :key="label"
      class="progress-hit"
      :style="{ left: `${24 + Math.max(0, hostWidth - 48) * index / Math.max(1, labels.length - 1)}px`, width: `${hitWidth()}px`, marginLeft: `${-hitWidth() / 2}px` }"
      :aria-label="`前往${label}`"
      :aria-current="modelValue === index ? 'step' : undefined"
      @click="select(index)"
      @keydown="keydown($event, index)"
    />
  </nav>
</template>

<style scoped>
.creation-progress {
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 64px;
  flex: 0 0 64px;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.progress-track {
  position: absolute;
  z-index: -2;
  left: 24px;
  right: 24px;
  top: 22px;
  height: 20px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 14%, var(--canvas));
}
.progress-track i {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--ink);
  transform: scaleX(0);
  transform-origin: left center;
  will-change: transform;
}
.progress-node {
  position: absolute;
  z-index: -1;
  top: 28px;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--ink) 16%, var(--canvas));
  border-radius: 50%;
  background: color-mix(in srgb, var(--ink) 20%, var(--canvas));
  pointer-events: none;
}
.progress-node.is-complete {
  border-color: color-mix(in srgb, var(--canvas) 76%, var(--ink));
  background: var(--ink);
}
.progress-node.is-current {
  width: 10px;
  height: 10px;
  top: 27px;
  margin-left: -5px;
}
.progress-glass {
  position: absolute;
  z-index: -1;
  left: 0;
  top: 10px;
  width: 44px;
  height: 44px;
  will-change: transform;
  pointer-events: none;
}
.progress-glass-surface {
  position: absolute;
  inset: 4px;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--ink) 8%, transparent);
  border-radius: 14px;
  background: linear-gradient(145deg,
    color-mix(in srgb, var(--canvas) 62%, transparent),
    color-mix(in srgb, var(--canvas) 38%, transparent) 58%,
    color-mix(in srgb, var(--canvas) 54%, transparent));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 62%), 0 1px 3px rgb(0 0 0 / 4%);
  -webkit-backdrop-filter: blur(10px) saturate(1.06);
  backdrop-filter: blur(10px) saturate(1.06);
  transform: scaleX(calc(1 + var(--thumb-stretch, 0) * .65)) scaleY(calc(1 - var(--thumb-stretch, 0)));
  opacity: 0;
  transition: transform 220ms cubic-bezier(.22,1,.36,1), opacity 160ms cubic-bezier(.22,1,.36,1);
  will-change: transform;
  pointer-events: none;
}
.progress-glass:not(.is-visible) .progress-glass-surface {
  opacity: 0;
}
.progress-glass.is-visible .progress-glass-surface {
  opacity: 1;
}
.progress-glass.is-dragging .progress-glass-surface {
  transition: none;
}
.progress-glass.is-pressed:not(.is-dragging) .progress-glass-surface {
  transform: scaleX(1.075) scaleY(.9);
  transition-duration: 120ms;
}
.progress-glass-surface::before {
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  background: linear-gradient(145deg, rgb(255 255 255 / 44%), rgb(255 255 255 / 9%) 42%, transparent 68%);
  content: "";
  opacity: .58;
  pointer-events: none;
}
.progress-hit {
  position: absolute;
  inset-block: 0;
  z-index: 1;
  min-width: 44px;
  padding: 0;
  border: 0;
  border-radius: 18px;
  background: transparent;
  cursor: pointer;
  touch-action: pan-y;
}
.progress-hit:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: -3px;
}
:global(html[data-theme="dark"]) .progress-node:not(.is-complete) {
  border-color: rgb(255 255 255 / 22%);
  background: color-mix(in srgb, var(--canvas) 76%, var(--ink));
}
:global(html[data-theme="dark"]) .progress-glass-surface {
  border-color: rgb(255 255 255 / 13%);
  background: linear-gradient(145deg, rgb(255 255 255 / 15%), rgb(255 255 255 / 6%) 58%, rgb(0 0 0 / 10%));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 19%), 0 2px 6px rgb(0 0 0 / 24%);
}
:global(html[data-theme="dark"]) .progress-glass-surface::before {
  background: linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 5%) 42%, transparent 68%);
  opacity: .78;
}
@media (prefers-reduced-motion: reduce) {
  .progress-glass-surface,
  .progress-track i {
    transition: none !important;
  }
}
</style>
