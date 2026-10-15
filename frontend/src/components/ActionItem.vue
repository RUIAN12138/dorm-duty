<script setup lang="ts">
import { motion } from "motion-v";
import { motionAllowed, motionTokens } from "../interaction/motion";
defineProps<{
  label: string;
  icon: string;
  tile?: boolean;
  badge?: number;
  disabled?: boolean;
  delay?: number;
}>();
</script>
<template>
  <motion.button
    type="button"
    class="action-item"
    :class="{ tile }"
    :disabled="disabled"
    :while-press="motionAllowed() ? { scale: 0.97 } : {}"
    :initial="motionAllowed() ? { opacity: 0, y: 6 } : false"
    :animate="{ opacity: 1, y: 0 }"
    :transition="
      motionAllowed()
        ? { ...motionTokens.layout, delay: delay || 0 }
        : { duration: 0 }
    "
  >
    <span class="action-icon"><van-icon :name="icon" aria-hidden="true" /></span
    ><span class="action-label">{{ label }}</span
    ><span v-if="badge" class="action-badge">{{ badge }}</span
    ><van-icon
      v-if="!tile"
      class="action-arrow"
      name="arrow"
      aria-hidden="true"
    />
  </motion.button>
</template>
<style scoped>
.action-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  min-height: 62px;
  padding: 10px 14px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: #111;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.action-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  font-size: 23px;
  border-radius: 12px;
  background: #f1f1f1;
}
.action-label {
  font-size: 16px;
  font-weight: 500;
  flex: 1;
}
.action-arrow {
  font-size: 15px;
  color: #999;
}
.action-item:active {
  background: #efefef;
}
.action-item:disabled {
  opacity: 0.4;
  cursor: default;
}
.tile {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 106px;
  gap: 11px;
  background: #f6f6f6;
  text-align: center;
  border-radius: 22px;
  padding: 16px 10px;
}
.tile .action-icon {
  background: transparent;
  width: 30px;
  height: 30px;
  font-size: 26px;
}
.tile .action-label {
  flex: none;
}
.action-badge {
  min-width: 21px;
  height: 21px;
  line-height: 21px;
  border-radius: 11px;
  text-align: center;
  background: #111;
  color: #fff;
  font-size: 12px;
}
.tile .action-badge {
  position: absolute;
  top: 11px;
  right: 13px;
}
</style>
