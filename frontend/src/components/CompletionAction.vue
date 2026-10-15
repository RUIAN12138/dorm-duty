<script setup lang="ts">
import { motion } from "motion-v";
import { motionAllowed, motionTokens } from "../interaction/motion";
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
  <motion.button
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
    :disabled="busy || disabled"
    :animate="{
      backgroundColor: task.status === 'completed' ? '#efefef' : '#111111',
      color: task.status === 'completed' ? '#111111' : '#ffffff',
      borderRadius: task.status === 'completed' ? 24 : 20,
    }"
    :while-press="motionAllowed() ? motionTokens.press : {}"
    :transition="
      motionAllowed()
        ? {
            ...motionTokens.layout,
            backgroundColor: { duration: 0.16 },
            color: { duration: 0.16 },
          }
        : { duration: 0 }
    "
    @click="
      task.status === 'completed'
        ? $emit('undo', task)
        : $emit('complete', task)
    "
  >
    <van-icon
      v-if="task.status === 'completed'"
      name="success"
      aria-hidden="true"
    />
    <span>{{
      busy
        ? "正在处理…"
        : task.status === "completed"
          ? task.key === "water"
            ? "已抬水"
            : "已完成"
          : task.key === "water"
            ? "我已抬水"
            : "我已完成"
    }}</span>
  </motion.button>
</template>
<style scoped>
.completion-surface {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: min(100%, 300px);
  min-height: 60px;
  padding: 15px 24px;
  border: 0;
  border-radius: 20px;
  background: #111;
  color: #fff;
  font: inherit;
  font-size: 20px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.completion-surface.is-done {
  background: #efefef;
  color: #111;
}
.completion-surface:disabled {
  opacity: 0.5;
  cursor: default;
}
.completion-surface:focus-visible {
  outline: 2px solid #111;
  outline-offset: 4px;
}
</style>
