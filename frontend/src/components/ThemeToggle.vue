<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, useId } from "vue";
import { darkTheme, setThemeMode } from "../interaction/theme";
import {
  appearanceStep,
  appearancePose,
} from "../interaction/appearanceMotion";
import { motionAllowed } from "../interaction/motion";
const maskId = "appearance-" + useId(),
  progress = ref(darkTheme.value ? 1 : 0);
let frame = 0,
  last = 0,
  velocity = 0,
  target = progress.value;
const pose = computed(() => appearancePose(progress.value));
function tick(now: number) {
  frame = 0;
  const next = appearanceStep(
    progress.value,
    velocity,
    target,
    (now - last) / 1000,
  );
  last = now;
  progress.value = next.position;
  velocity = next.velocity;
  if (Math.abs(target - progress.value) > 0.0005 || Math.abs(velocity) > 0.003)
    frame = requestAnimationFrame(tick);
  else {
    progress.value = target;
    velocity = 0;
  }
}
function settle() {
  cancelAnimationFrame(frame);
  frame = 0;
  target = darkTheme.value ? 1 : 0;
  progress.value = target;
  velocity = 0;
}
watch(darkTheme, () => {
  target = darkTheme.value ? 1 : 0;
  if (!motionAllowed()) {
    settle();
    return;
  }
  if (!frame) {
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }
});
function toggle(event: MouseEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  setThemeMode(darkTheme.value ? "light" : "dark", {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
  });
}
const media = matchMedia("(prefers-reduced-motion: reduce)");
function preference() {
  if (!motionAllowed()) settle();
}
media.addEventListener("change", preference);
document.addEventListener("visibilitychange", preference);
window.addEventListener("ui-motion-change", preference);
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  media.removeEventListener("change", preference);
  document.removeEventListener("visibilitychange", preference);
  window.removeEventListener("ui-motion-change", preference);
});
</script>
<template>
  <button
    type="button"
    class="theme-toggle"
    :aria-label="darkTheme ? '切换为浅色模式' : '切换为夜间模式'"
    :aria-pressed="darkTheme"
    @click="toggle"
  >
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <defs>
        <mask
          :id="maskId"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="32"
          height="32"
        >
          <rect width="32" height="32" fill="white" stroke="none" />
          <circle
            :cx="pose.cutX"
            :cy="pose.cutY"
            :r="pose.cutRadius"
            fill="black"
            stroke="none"
          />
        </mask>
      </defs>
      <g :transform="`rotate(${pose.rotation} 16 16)`">
        <circle
          cx="16"
          cy="16"
          :r="pose.radius"
          :mask="`url(#${maskId})`"
          fill="currentColor"
          stroke="none"
        />
        <g :opacity="pose.rayOpacity">
          <path
            v-for="i in 8"
            :key="i"
            :transform="`rotate(${i * 45} 16 16)`"
            :d="`M16 ${3 + pose.radius - 6}V${6 + pose.radius - 6}`"
          />
        </g>
      </g>
    </svg>
  </button>
</template>
<style scoped>
.theme-toggle {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  padding: 6px;
  border: 1px solid var(--ui-border);
  border-radius: 50%;
  background: var(--glass-lens-surface, var(--ui-surface));
  box-shadow: var(--glass-shadow);
  border-color: var(--glass-border);
  transition: transform var(--ui-release-time) var(--ui-ease-out);
  color: var(--ui-ink);
  cursor: pointer;
}
.theme-toggle:active {
  transform: scale(1.06);
}
.theme-toggle svg {
  width: 26px;
  height: 26px;
  overflow: visible;
}
</style>
