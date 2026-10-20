<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import { motionAllowed } from "../interaction/motion";
import { createVelocityTracker } from "../interaction/gestures";
import {
  pagePull,
  pagePullInput,
  pageSpringStep,
} from "../interaction/pageElasticity";
defineProps<{ signedIn: boolean }>();
const surface = ref<HTMLElement>();
const height = ref(0),
  top = ref(0),
  pull = ref(0),
  dragging = ref(false);
const pose = computed(() => {
  const distance = motionAllowed() ? pull.value : 0;
  const stretch = Math.min(0.022, Math.abs(distance) / 3200);
  return {
    transform: `translate3d(0,${distance}px,0) scale(${1 - stretch},${1 + stretch})`,
    transformOrigin: distance < 0 ? "50% 100%" : "50% 0",
  };
});
let gesture: {
  id: number;
  x: number;
  y: number;
  vertical: boolean;
  base: number;
  velocity: ReturnType<typeof createVelocityTracker>;
} | null = null;
let springFrame = 0,
  springAt = 0,
  springVelocity = 0,
  wheelInput = 0;
let suppressUntil = 0,
  wheelTimer: ReturnType<typeof setTimeout> | undefined;
function down(event: PointerEvent) {
  if (
    !event.isPrimary ||
    event.button !== 0 ||
    gesture ||
    !(event.target instanceof Element)
  )
    return;
  if (
    event.target.closest(
      "input,textarea,select,[contenteditable=true],.dorm-companion",
    )
  )
    return;
  cancelAnimationFrame(springFrame);
  springFrame = 0;
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    vertical: false,
    base: pagePullInput(pull.value, height.value),
    velocity: createVelocityTracker(pull.value, performance.now()),
  };
}
function move(event: PointerEvent) {
  const active = gesture;
  if (!active || active.id !== event.pointerId) return;
  const x = event.clientX - active.x,
    y = event.clientY - active.y;
  if (!active.vertical) {
    if (Math.abs(x) > 8 && Math.abs(x) > Math.abs(y)) {
      release();
      return;
    }
    if (Math.abs(y) < 9 || Math.abs(y) < Math.abs(x) * 1.15) return;
    active.vertical = true;
    surface.value?.setPointerCapture(event.pointerId);
  }
  if (event.cancelable) event.preventDefault();
  dragging.value = true;
  pull.value = pagePull(active.base + y, height.value);
  active.velocity.add(pull.value, performance.now());
}
function spring(now: number) {
  springFrame = 0;
  if (!motionAllowed()) {
    pull.value = 0;
    return;
  }
  const next = pageSpringStep(
    pull.value,
    springVelocity,
    (now - springAt) / 1000,
  );
  springAt = now;
  springVelocity = next.velocity;
  pull.value = next.position;
  if (Math.abs(pull.value) < 0.12 && Math.abs(springVelocity) < 1) {
    pull.value = 0;
    return;
  }
  springFrame = requestAnimationFrame(spring);
}
function finishPointer(event: PointerEvent) {
  if (
    !["pointerup", "pointercancel"].includes(event.type) ||
    gesture?.id !== event.pointerId
  )
    return;
  release();
}
function release() {
  const active = gesture;
  if (!active && !dragging.value) return;
  gesture = null;
  if (dragging.value) suppressUntil = performance.now() + 350;
  dragging.value = false;
  clearTimeout(wheelTimer);
  springVelocity = Math.max(
    -900,
    Math.min(900, (active?.velocity.read(performance.now()) || 0) * 1000),
  );
  cancelAnimationFrame(springFrame);
  springAt = performance.now();
  springFrame = requestAnimationFrame(spring);
  if (active && surface.value?.hasPointerCapture(active.id))
    surface.value.releasePointerCapture(active.id);
  fit();
}
function reset() {
  const active = gesture;
  gesture = null;
  dragging.value = false;
  cancelAnimationFrame(springFrame);
  springFrame = 0;
  clearTimeout(wheelTimer);
  pull.value = 0;
  springVelocity = 0;
  if (active && surface.value?.hasPointerCapture(active.id))
    surface.value.releasePointerCapture(active.id);
}
function click(event: MouseEvent) {
  if (performance.now() < suppressUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}
function wheel(event: WheelEvent) {
  if (
    event.ctrlKey ||
    !(event.target instanceof Element) ||
    event.target.closest("input,textarea,select")
  )
    return;
  event.preventDefault();
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  if (!dragging.value) wheelInput = pagePullInput(pull.value, height.value);
  cancelAnimationFrame(springFrame);
  springFrame = 0;
  dragging.value = true;
  wheelInput -= event.deltaY * 0.72;
  pull.value = pagePull(wheelInput, height.value);
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(release, 90);
}
function fit() {
  if (gesture || dragging.value) return;
  height.value = Math.round(window.visualViewport?.height || innerHeight);
  top.value = Math.round(window.visualViewport?.offsetTop || 0);
  if (!springFrame) pull.value = 0;
}
function quiet() {
  if (document.hidden) reset();
}
onMounted(() => {
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("blur", reset);
  window.addEventListener("pointerup", finishPointer, true);
  window.addEventListener("pointercancel", finishPointer, true);
  window.visualViewport?.addEventListener("resize", fit);
  window.visualViewport?.addEventListener("scroll", fit);
  document.addEventListener("visibilitychange", quiet);
  surface.value?.addEventListener("wheel", wheel, { passive: false });
});
onBeforeUnmount(() => {
  reset();
  window.removeEventListener("resize", fit);
  window.removeEventListener("blur", reset);
  window.removeEventListener("pointerup", finishPointer, true);
  window.removeEventListener("pointercancel", finishPointer, true);
  window.visualViewport?.removeEventListener("resize", fit);
  window.visualViewport?.removeEventListener("scroll", fit);
  document.removeEventListener("visibilitychange", quiet);
  surface.value?.removeEventListener("wheel", wheel);
});
</script>
<template>
  <div
    class="app-stage"
    :class="{ 'is-signed-in': signedIn }"
    :style="{ height: height ? `${height}px` : '100dvh', top: `${top}px` }"
  >
    <div
      ref="surface"
      class="screen-surface"
      :class="{ 'is-pulling': dragging }"
      :style="pose"
      @pointerdown.capture="down"
      @pointermove.capture="move"
      @pointerup.capture="release"
      @pointercancel.capture="release"
      @click.capture="click"
    >
      <slot />
    </div>
  </div>
</template>
<style scoped>
.app-stage {
  position: fixed;
  inset-inline: 0;
  max-width: 520px;
  margin: auto;
  overflow: hidden;
  background: var(--app-tone-hfff, #fff);
  container-type: size;
  container-name: screen;
  padding: max(8px, env(safe-area-inset-top)) 0
    max(4px, env(safe-area-inset-bottom));
}
.app-stage.is-signed-in {
  padding-bottom: calc(88px + env(safe-area-inset-bottom));
}
.screen-surface {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  transition: none;
}
.screen-surface.is-pulling {
  transition: none;
  will-change: transform;
}
@media (prefers-reduced-motion: reduce) {
  .screen-surface {
    transition: none;
  }
}
</style>
