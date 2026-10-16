<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { motionAllowed } from "../interaction/motion";
defineProps<{ name: string }>();
const emit = defineEmits<{ tap: [] }>();
const button = ref<HTMLButtonElement | null>(null);
const taps = ref<{ id: number; x: number; y: number; drift: number }[]>([]);
let sequence = 0,
  bounce: Animation | null = null;
function tap(event: MouseEvent) {
  const target = button.value;
  if (!target) return;
  emit("tap");
  if (!event.detail || !motionAllowed()) return;
  const bounds = target.getBoundingClientRect();
  const x = event.detail
    ? Math.min(bounds.width - 12, Math.max(12, event.clientX - bounds.left))
    : bounds.width / 2;
  const y = event.detail
    ? Math.min(bounds.height, Math.max(0, event.clientY - bounds.top))
    : bounds.height / 2;
  taps.value = [
    ...taps.value.slice(-7),
    { id: ++sequence, x, y, drift: ((sequence % 3) - 1) * 12 },
  ];
  const current = getComputedStyle(target).transform;
  bounce?.cancel();
  bounce = target.animate(
    [
      { transform: current === "none" ? "scale(1)" : current },
      { transform: "scaleX(1.04) scaleY(.94)", offset: 0.18 },
      { transform: "scaleX(.98) scaleY(1.035)", offset: 0.58 },
      { transform: "scaleX(1.025) scaleY(.98)", offset: 0.8 },
      { transform: "scale(1)" },
    ],
    { duration: 380, easing: "cubic-bezier(.22,1,.36,1)" },
  );
}
onUnmounted(() => bounce?.cancel());
</script>
<template>
  <button
    ref="button"
    type="button"
    class="nudge-name"
    data-testid="water-nudge"
    :aria-label="`敲一敲${name}，催促抬水`"
    @click="tap"
  >
    <span>{{ name }}</span>
    <span
      v-for="hit in taps"
      :key="hit.id"
      class="nudge-hit"
      aria-hidden="true"
      :style="{
        left: `${hit.x}px`,
        top: `${hit.y}px`,
        '--drift': `${hit.drift}px`,
      }"
      @animationend="taps = taps.filter((item) => item.id !== hit.id)"
    >
      <span class="nudge-ring"></span>
    </span>
  </button>
</template>
<style scoped>
.nudge-name {
  position: relative;
  display: inline-block;
  max-width: 100%;
  min-height: 64px;
  padding: 12px 8px;
  margin: -12px -8px;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  letter-spacing: inherit;
  line-height: inherit;
  overflow-wrap: anywhere;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}
.nudge-name:active {
  transform: var(--ui-press-squash);
}
.nudge-name:focus-visible {
  outline: 2px solid #111;
  outline-offset: 12px;
  border-radius: 8px;
}
.nudge-hit {
  position: absolute;
  width: 1px;
  height: 1px;
  pointer-events: none;
  animation: hit-life 580ms linear;
}
.nudge-ring {
  position: absolute;
  width: 48px;
  height: 48px;
  margin: -24px;
  border: 1px solid #111;
  border-radius: 50%;
  animation: ring-expand 400ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.nudge-plus {
  position: absolute;
  left: -34px;
  top: -24px;
  white-space: nowrap;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  animation: plus-float 580ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes ring-expand {
  from {
    transform: scale(0.9);
    opacity: 0.5;
  }
  to {
    transform: scale(3.1);
    opacity: 0;
  }
}
@keyframes plus-float {
  from {
    transform: translateY(-8px);
    opacity: 1;
  }
  to {
    transform: translate(var(--drift), -72px);
    opacity: 0;
  }
}
@keyframes hit-life {
  to {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .nudge-name {
    transition: none;
  }
  .nudge-name:active {
    transform: none;
  }
  .nudge-hit {
    display: none;
  }
}
</style>
