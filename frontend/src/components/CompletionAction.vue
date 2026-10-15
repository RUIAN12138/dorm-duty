<script setup lang="ts">
import { motion } from "motion-v";
import { motionAllowed, motionTokens } from "../interaction/motion";
import type { ChoreTask } from "../api/chores";
const props = defineProps<{
  task: ChoreTask;
  busy: boolean;
  disabled: boolean;
  demo: boolean;
}>();
defineEmits<{ complete: [task: ChoreTask]; undo: [task: ChoreTask] }>();
</script>
<template>
  <motion.div
    class="completion-surface"
    :class="{ 'is-done': task.status === 'completed' }"
    layout
    :animate="{
      backgroundColor: task.status === 'completed' ? '#f4f4f4' : '#111111',
      borderRadius: task.status === 'completed' ? 23 : 18,
    }"
    :transition="
      motionAllowed()
        ? { ...motionTokens.layout, backgroundColor: { duration: 0.16 } }
        : { duration: 0 }
    "
  >
    <div v-if="task.status === 'completed'" class="completion-receipt">
      <van-icon name="passed" aria-hidden="true" /><span>已完成</span
      ><button
        :data-testid="`undo-${task.id}`"
        :disabled="busy || disabled"
        @click="$emit('undo', task)"
      >
        {{ busy ? "正在撤销…" : "撤销" }}
      </button>
    </div>
    <motion.button
      v-else
      class="chore-complete-button"
      :data-testid="`complete-${task.key}-${task.id}`"
      :disabled="busy || disabled"
      :while-press="motionAllowed() ? { scale: 0.97 } : {}"
      @click="$emit('complete', task)"
      >{{
        busy ? "正在记录…" : task.key === "water" ? "我已抬水" : "我已完成"
      }}</motion.button
    >
  </motion.div>
</template>
<style scoped>
.completion-surface {
  width: min(100%, 300px);
  border-radius: 18px;
  overflow: hidden;
  background: #111;
}
.completion-surface.is-done {
  background: #f4f4f4;
  border-radius: 23px;
}
.chore-complete-button {
  width: 100%;
  min-height: 56px;
  border: 0;
  background: #111;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
  padding: 14px 20px;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.completion-receipt {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: 9px 12px 9px 20px;
  color: #111;
  font-size: 18px;
}
.completion-receipt > .van-icon {
  font-size: 23px;
}
.completion-receipt > span {
  flex: 1;
  text-align: left;
}
.completion-receipt button {
  font: inherit;
  font-size: 16px;
  min-height: 44px;
  padding: 8px 13px;
  border: 0;
  border-radius: 16px;
  background: #fff;
  color: #333;
  cursor: pointer;
}
</style>
