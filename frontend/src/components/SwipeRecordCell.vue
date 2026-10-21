<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from "vue";
import {
  createVelocityTracker,
  horizontalIntent,
  rubberBand,
} from "../interaction/gestures";
const props = withDefaults(
  defineProps<{
    enabled?: boolean;
    open?: boolean;
    busy?: boolean;
    count?: number;
    label: string;
    testId?: string;
  }>(),
  { count: 1 },
);
const emit = defineEmits<{ "update:open": [open: boolean] }>();
const root = ref<HTMLElement>(),
  toggle = ref<HTMLButtonElement>();
const offset = ref(0),
  dragging = ref(false);
const width = computed(() => Math.max(1, props.count) * 64);
const actionId = useId();
let gesture: {
  id: number;
  x: number;
  y: number;
  base: number;
  wasOpen: boolean;
  surface: HTMLElement;
  velocity: ReturnType<typeof createVelocityTracker>;
} | null = null;
let suppressUntil = 0;
function releaseCapture() {
  const old = gesture;
  gesture = null;
  dragging.value = false;
  if (old?.surface.hasPointerCapture(old.id))
    old.surface.releasePointerCapture(old.id);
}
function setOpen(value: boolean) {
  emit("update:open", value && !!props.enabled && !props.busy);
  offset.value = value && props.enabled && !props.busy ? -width.value : 0;
}
function close(restoreFocus = false) {
  if (dragging.value) suppressUntil = performance.now() + 500;
  releaseCapture();
  setOpen(false);
  if (restoreFocus)
    void nextTick(() => toggle.value?.focus({ preventScroll: true }));
}
function hidden() {
  if (document.hidden) close();
}
function blur() {
  if (props.open || gesture) close();
}
function down(event: PointerEvent) {
  if (
    !props.enabled ||
    props.busy ||
    gesture ||
    !event.isPrimary ||
    event.button !== 0 ||
    (event.target as Element).closest("button,a,input,textarea,select")
  )
    return;
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    base: offset.value,
    wasOpen: !!props.open,
    surface: event.currentTarget as HTMLElement,
    velocity: createVelocityTracker(offset.value, performance.now()),
  };
}
function move(event: PointerEvent) {
  const current = gesture;
  if (!current || current.id !== event.pointerId) return;
  const x = event.clientX - current.x,
    y = event.clientY - current.y;
  if (!dragging.value) {
    const intent = horizontalIntent(x, y);
    if (intent === "vertical") return releaseCapture();
    if (intent !== "horizontal") return;
    dragging.value = true;
    current.surface.setPointerCapture(event.pointerId);
    // The parent closes another row as soon as this gesture claims the lane.
    emit("update:open", true);
  }
  if (event.cancelable) event.preventDefault();
  const raw = current.base + x;
  offset.value =
    raw > 0
      ? rubberBand(raw, 24)
      : raw < -width.value
        ? -width.value + rubberBand(raw + width.value, 24)
        : raw;
  current.velocity.add(offset.value, performance.now());
}
function finish(event: PointerEvent, cancelled = false) {
  const current = gesture;
  if (!current || current.id !== event.pointerId) return;
  const moved = dragging.value,
    velocity = current.velocity.read(performance.now());
  releaseCapture();
  if (!moved) return;
  suppressUntil = performance.now() + 500;
  setOpen(
    cancelled
      ? current.wasOpen
      : velocity < -0.35 ||
          (velocity <= 0.35 && offset.value < -width.value * 0.4),
  );
}
function lostCapture(event: PointerEvent) {
  // Touch starts with implicit capture on the inner name/icon. Replacing it
  // with our front surface emits a bubbling loss from that child. Only loss
  // of this surface's own capture can cancel the swipe.
  if (event.target === event.currentTarget) finish(event, true);
}
function frontClick(event: MouseEvent) {
  if (performance.now() < suppressUntil) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (props.open && !(event.target as Element).closest("button")) {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}
function guardClick(event: MouseEvent) {
  // Releasing capture can retarget the drag's synthetic click onto a newly
  // exposed action. Only a fresh pointerdown or keyboard activation may act.
  if (event.detail > 0 && performance.now() < suppressUntil) {
    event.preventDefault();
    event.stopPropagation();
    suppressUntil = 0;
  }
}
function outside(event: PointerEvent) {
  if (
    props.open &&
    event.target instanceof Node &&
    !root.value?.contains(event.target)
  )
    close();
}
function scroll(event: Event) {
  if (
    props.open &&
    event.target instanceof Element &&
    event.target.contains(root.value || null)
  )
    close();
}
function key(event: KeyboardEvent) {
  if (event.key === "Escape" && props.open) {
    event.preventDefault();
    event.stopPropagation();
    close(true);
  } else if (
    event.target === toggle.value &&
    ["ArrowLeft", "ArrowRight"].includes(event.key)
  ) {
    event.preventDefault();
    setOpen(event.key === "ArrowLeft");
  }
}
watch(
  () => [props.open, props.enabled, props.busy, props.count] as const,
  () => {
    if (!props.enabled || props.busy) return close();
    if (!gesture) offset.value = props.open ? -width.value : 0;
  },
  { immediate: true },
);
onMounted(() => {
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("scroll", scroll, true);
  document.addEventListener("visibilitychange", hidden);
  window.addEventListener("blur", blur);
});
onBeforeUnmount(() => {
  releaseCapture();
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("scroll", scroll, true);
  document.removeEventListener("visibilitychange", hidden);
  window.removeEventListener("blur", blur);
});
defineExpose({ close });
</script>
<template>
  <div
    v-if="enabled"
    ref="root"
    class="swipe-record-cell"
    :class="{ 'is-open': open, 'is-dragging': dragging }"
    :style="{
      '--swipe-action-width': `${width}px`,
      '--swipe-reveal': Math.min(1, Math.max(0, -offset / width)),
    }"
    :aria-label="label"
    role="group"
    :data-testid="testId"
    data-page-gesture
    data-native-scroll
    @pointerdown.capture="suppressUntil = 0"
    @click.capture="guardClick"
    @keydown="key"
  >
    <div
      :id="actionId"
      class="swipe-record-actions"
      :inert="!open || undefined"
      :aria-hidden="!open"
    >
      <slot name="actions" :close="close" />
    </div>
    <div
      class="swipe-record-front"
      :style="{
        transform: offset || dragging ? `translate3d(${offset}px,0,0)` : 'none',
      }"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="finish($event)"
      @pointercancel="finish($event, true)"
      @lostpointercapture="lostCapture"
      @click.capture="frontClick"
    >
      <slot />
      <button
        ref="toggle"
        type="button"
        class="record-swipe-toggle"
        :disabled="busy"
        :aria-expanded="open"
        :aria-controls="actionId"
        :aria-label="`${open ? '关闭' : '显示'}${label}操作`"
        @click.stop="setOpen(!open)"
      >
        <span aria-hidden="true">···</span>
      </button>
    </div>
  </div>
  <slot v-else />
</template>
<style scoped>
.swipe-record-cell {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
}
.swipe-record-front {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  background: var(--ui-surface);
  touch-action: pan-y;
  transition: transform 260ms var(--ui-ease-out);
}
.is-dragging .swipe-record-actions,
.is-dragging .swipe-record-front {
  transition: none;
  will-change: transform;
}
.swipe-record-front > :deep(.record-row) {
  flex: 1;
  min-width: 0;
}
.swipe-record-actions {
  position: absolute;
  inset: 7px 0 7px auto;
  display: flex;
  align-items: stretch;
  width: var(--swipe-action-width);
  gap: 6px;
  padding-left: 8px;
  box-sizing: border-box;
  transform: translateX(calc((1 - var(--swipe-reveal)) * 18px))
    scale(calc(0.92 + var(--swipe-reveal) * 0.08));
  opacity: var(--swipe-reveal);
  transform-origin: right center;
  transition:
    transform 260ms var(--ui-ease-out),
    opacity 180ms var(--ui-ease-out);
}
.swipe-record-actions :deep(button) {
  flex: 1;
  min-width: 0;
  border: 0;
  border-radius: 18px;
  padding: 8px 4px;
  background: var(--ui-surface-muted);
  color: var(--ui-ink);
  font: inherit;
  font-size: var(--ui-small-size);
  cursor: pointer;
  transition: transform var(--ui-release-time) var(--ui-ease-out);
}
.swipe-record-actions :deep(.swipe-undo) {
  background: #c94040;
  color: #fff;
}
.swipe-record-actions :deep(.swipe-edit) {
  background: #278451;
  color: #fff;
}
.swipe-record-actions :deep(button:active:not(:disabled)) {
  transform: scale(0.96);
}
.swipe-record-actions :deep(button:disabled) {
  opacity: 0.4;
}
.record-swipe-toggle:not(:focus-visible) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.record-swipe-toggle {
  flex: none;
  width: 28px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  color: var(--ui-text-muted);
  background: transparent;
  font-size: 22px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: transform var(--ui-release-time) var(--ui-ease-out);
}
.record-swipe-toggle:active:not(:disabled) {
  transform: scale(0.96);
}
.record-swipe-toggle:focus-visible,
.swipe-record-actions :deep(button:focus-visible) {
  outline: 2px solid var(--ui-ink);
  outline-offset: -3px;
}
@media (prefers-reduced-motion: reduce) {
  .swipe-record-front,
  .record-swipe-toggle,
  .swipe-record-actions :deep(button) {
    transition: none;
  }
  .record-swipe-toggle:active,
  .swipe-record-actions :deep(button:active) {
    transform: none;
  }
}
</style>
