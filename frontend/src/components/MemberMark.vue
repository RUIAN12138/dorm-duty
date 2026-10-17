<script setup lang="ts">
import { computed } from "vue";
import pixelPaths from "../data/member-mark-paths.json";
import marks from "../data/member-marks.json";
import { appPath } from "../api/path";
const props = withDefaults(
  defineProps<{
    id?: string;
    size?: number;
    label?: string;
    inline?: boolean;
  }>(),
  { size: 28, inline: true },
);
const mark = computed(
  () => marks.find((item) => item.id === props.id) || marks[0],
);
</script>
<template>
  <svg
    v-if="inline"
    class="member-mark inline-mark"
    :width="size"
    :height="size"
    viewBox="0 0 12 12"
    shape-rendering="crispEdges"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="!label"
  >
    <path
      :d="
        pixelPaths[(mark?.id || 'pixel-01') as keyof typeof pixelPaths] ||
        pixelPaths['pixel-01']
      "
      :fill="mark?.color || '#47b985'"
    />
  </svg>
  <img
    v-else
    class="member-mark"
    :src="appPath(`/marks/${mark?.id || 'pixel-01'}.svg`)"
    :width="size"
    :height="size"
    :alt="label || ''"
    :style="{ '--mark-color': mark?.color || '#96edc0' }"
    draggable="false"
    loading="eager"
    decoding="sync"
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

<style scoped>
.inline-mark {
  filter: none;
  overflow: visible;
}
</style>
