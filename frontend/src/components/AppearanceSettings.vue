<script setup lang="ts">
import ThemeToggle from "./ThemeToggle.vue";
import { themeMode, setThemeMode, type ThemeMode } from "../interaction/theme";
function select(mode: ThemeMode, event: MouseEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  setThemeMode(mode, {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
  });
}
const options: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];
</script>
<template>
  <fieldset class="appearance-settings">
    <legend>外观</legend>
    <div class="appearance-heading"><span>夜间模式</span><ThemeToggle /></div>
    <div class="appearance-options">
      <button
        v-for="option in options"
        :key="option.value"
        :aria-pressed="themeMode === option.value"
        @click="select(option.value, $event)"
      >
        {{ option.label }}
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
  grid-template-columns: 1.3fr 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 22px;
  background: var(--ui-surface-muted);
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
  background: var(--ui-surface);
  color: var(--ui-ink);
  box-shadow: 0 1px 5px #0000000b;
}
</style>
