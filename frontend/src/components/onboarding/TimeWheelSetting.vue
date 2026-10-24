<script setup lang="ts">
import { computed } from "vue";
import { TimePicker } from "vant";
import "vant/es/time-picker/style/index.mjs";
import { motionAllowed } from "../../interaction/motion";

const props = withDefaults(defineProps<{ modelValue?: string; label: string; compact?: boolean }>(), { modelValue: "08:00", compact: false });
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const columns = computed(() => (props.modelValue || "08:00").split(":"));
function update(value: string[]) { emit("update:modelValue", value.join(":")); }
</script>

<template>
  <section class="time-wheel-setting" :class="{ compact }" :aria-label="label">
    <span>{{ label }}</span>
    <strong>{{ modelValue || "08:00" }}</strong>
    <TimePicker
      :model-value="columns"
      :show-toolbar="false"
      :visible-option-num="3"
      :option-height="compact ? 36 : 48"
      :swipe-duration="motionAllowed() ? 280 : 0"
      @update:model-value="update"
    />
  </section>
</template>

<style scoped>
.time-wheel-setting { min-width: 0; text-align: center; }
.time-wheel-setting > span { display: block; color: var(--muted); font-size: 14px; margin-bottom: 8px; }
.time-wheel-setting > strong { display: block; color: var(--ink); font-size: clamp(36px, 10vw, 52px); line-height: 1.12; font-variant-numeric: tabular-nums; letter-spacing: -.04em; }
.time-wheel-setting :deep(.van-picker) { margin-top: 8px; background: transparent; }
.time-wheel-setting :deep(.van-picker-column__item) { color: var(--muted); font-size: 26px; font-variant-numeric: tabular-nums; }
.time-wheel-setting :deep(.van-picker-column__item--selected) { color: var(--ink); font-weight: 600; }
.time-wheel-setting :deep(.van-picker__mask) { background-image: linear-gradient(180deg,var(--canvas),transparent),linear-gradient(0deg,var(--canvas),transparent); }
.time-wheel-setting.compact > strong { font-size: 32px; }
.time-wheel-setting.compact :deep(.van-picker-column__item) { font-size: 22px; }
@media (prefers-reduced-motion: reduce) { .time-wheel-setting :deep(*) { scroll-behavior: auto !important; } }
</style>
