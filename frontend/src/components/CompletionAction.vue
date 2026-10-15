<script setup lang="ts">
import GalaxySpinner from "./GalaxySpinner.vue";
import GalaxyCheck from "./GalaxyCheck.vue";
import type { ChoreTask } from "../api/chores";
defineProps<{
  task: ChoreTask;
  busy: boolean;
  disabled: boolean;
  demo: boolean;
}>();
defineEmits<{ complete: [task: ChoreTask]; undo: [task: ChoreTask] }>();
</script>
<template>
  <button
    type="button"
    class="completion-surface"
    :class="{ 'is-done': task.status === 'completed' }"
    :data-testid="
      task.status === 'completed'
        ? `undo-${task.id}`
        : `complete-${task.key}-${task.id}`
    "
    :aria-label="
      task.status === 'completed'
        ? `${task.key === 'water' ? '已抬水' : '已完成'}，再次点击撤销打卡`
        : undefined
    "
    :aria-pressed="task.status === 'completed'"
    :aria-busy="busy"
    :disabled="busy || disabled"
    @click="
      task.status === 'completed'
        ? $emit('undo', task)
        : $emit('complete', task)
    "
  >
    <span class="completion-label">
      <GalaxyCheck v-if="task.status === 'completed'" />
      {{
        task.status === "completed"
          ? task.key === "water"
            ? "已抬水"
            : "已完成"
          : task.key === "water"
            ? "我已抬水"
            : "我已完成"
      }}
    </span>
    <GalaxySpinner v-if="busy" class="completion-spinner" />
  </button>
</template>
<style scoped>
.completion-surface {
  position: relative;
  display: grid;
  place-items: center;
  width: min(100%, 300px);
  height: 60px;
  flex-shrink: 0;
  padding: 0 24px;
  border: 1px solid transparent;
  border-radius: 20px;
  background: #111;
  color: #fff;
  font: inherit;
  font-size: 20px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;
}
.completion-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.completion-surface.is-done {
  background: #efefef;
  color: #111;
}
.completion-surface:disabled {
  cursor: default;
  opacity: 1;
}
.completion-surface[aria-busy="true"] {
  color: #aaa;
}
.completion-surface:active:not(:disabled) {
  box-shadow: inset 0 2px 5px #ffffff18;
}
.completion-spinner {
  position: absolute;
  right: 18px;
  width: 15px;
  height: 15px;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
}
.completion-surface:focus-visible {
  outline: 2px solid #111;
  outline-offset: 4px;
}
@media (prefers-reduced-motion: no-preference) {
  .completion-surface {
    transition:
      transform 160ms var(--ui-ease-out),
      background-color 160ms ease,
      color 160ms ease,
      box-shadow 160ms ease;
  }
  .completion-surface:active:not(:disabled) {
    transform: scale(0.99);
    transition-duration: 70ms;
  }
}
</style>
