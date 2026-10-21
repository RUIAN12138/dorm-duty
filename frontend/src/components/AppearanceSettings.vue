<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { motion } from "motion-v";
import { useSelectionMotion } from "../interaction/motion";
import LiquidNavGlass from "./LiquidNavGlass.vue";
import ThemeToggle from "./ThemeToggle.vue";
import { themeMode, setThemeMode, type ThemeMode } from "../interaction/theme";
function select(mode: ThemeMode, event: MouseEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  setThemeMode(mode, {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
  });
}
const optical = ref(false),
  pressed = ref(false);
const selected = computed(() =>
  options.findIndex((o) => o.value === themeMode.value),
);
const selection = useSelectionMotion(0, () => 3);
const position = ref(0);
const stop = selection.position.on("change", (value) => {
  position.value = value;
});
watch(themeMode, () => selection.move(selected.value));
onBeforeUnmount(stop);
const options: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];
selection.jump(options.findIndex((o) => o.value === themeMode.value));
position.value = options.findIndex((o) => o.value === themeMode.value);
</script>
<template>
  <fieldset class="appearance-settings">
    <legend>外观</legend>
    <div class="appearance-heading"><span>夜间模式</span><ThemeToggle /></div>
    <div
      class="appearance-options"
      :class="{ 'has-optical-glass': optical, 'is-pressed': pressed }"
      @pointerdown="pressed = true"
      @pointerup="pressed = false"
      @pointercancel="pressed = false"
      @lostpointercapture="pressed = false"
      @pointerleave="pressed = false"
    >
      <LiquidNavGlass
        :position="position"
        :pressed="pressed"
        :dragging="false"
        :moving="selection.moving.value"
        :active="selected"
        @ready="optical = $event"
      />
      <motion.span
        class="appearance-selection"
        aria-hidden="true"
        :style="{ transform: selection.transform }"
      />
      <button
        v-for="option in options"
        :key="option.value"
        data-glass-item
        :aria-pressed="themeMode === option.value"
        @click="select(option.value, $event)"
      >
        <span class="nav-native-content"
          ><span class="nav-native-caption">{{ option.label }}</span></span
        >
      </button>
    </div>
  </fieldset>
</template>
<style scoped>
.appearance-settings {
  border: 0;
  padding: 0;
  margin: 16px 0 22px;
  min-width: 0;
}
.appearance-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 2px 10px;
  font-size: 14px;
  color: var(--ui-ink);
}
legend {
  font-size: 14px;
  color: var(--ui-text-muted);
  margin-bottom: 10px;
}
.appearance-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  position: relative;
  isolation: isolate;
  gap: 0;
  padding: 6px 8px;
  border-radius: 22px;
  background: var(--glass-surface);
  -webkit-backdrop-filter: blur(8px) saturate(var(--glass-saturation));
  backdrop-filter: blur(8px) saturate(var(--glass-saturation));
  border: 1px solid var(--glass-border);
}
button {
  min-height: 38px;
  border: 0;
  border-radius: 18px;
  background: none;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 13px;
}
button[aria-pressed="true"] {
  color: var(--ui-ink);
}
.appearance-selection {
  position: absolute;
  inset: 6px auto 6px 8px;
  width: calc((100% - 16px) / 3);
  border-radius: 999px;
  background: var(--glass-lens-surface, var(--ui-surface));
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  z-index: -1;
  pointer-events: none;
}
.has-optical-glass .appearance-selection {
  visibility: hidden;
}
button {
  position: relative;
  z-index: 1;
  transition: transform var(--ui-release-time) var(--ui-ease-out);
}
button:active {
  transform: scale(0.97);
}
.nav-native-content {
  display: inline-flex;
}
@media (prefers-reduced-transparency: reduce) {
  .appearance-options,
  .appearance-selection {
    background: var(--ui-surface-muted);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
