<script setup lang="ts">
import { computed } from "vue";
import marks from "../data/member-marks.json";
import { appPath } from "../api/path";
const props = withDefaults(
  defineProps<{ id?: string; size?: number; label?: string }>(),
  { size: 28 },
);
const mark = computed(
  () => marks.find((item) => item.id === props.id) || marks[0],
);
</script>
<template>
  <img
    class="member-mark"
    :src="appPath(`/marks/${mark?.id || 'pixel-01'}.svg`)"
    :width="size"
    :height="size"
    :alt="label || ''"
    :style="{ '--mark-color': mark?.color || '#96edc0' }"
    draggable="false"
  />
</template>
<style scoped>
.member-mark {
  display: inline-block;
  flex-shrink: 0;
  object-fit: contain;
  image-rendering: pixelated;
  filter: drop-shadow(
    0 0 2px color-mix(in srgb, var(--mark-color) 30%, transparent)
  );
}
</style>
