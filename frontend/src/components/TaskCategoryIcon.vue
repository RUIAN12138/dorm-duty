<script setup lang="ts">
defineProps<{ kind: string }>();
</script>
<template>
  <span
    class="task-category-icon"
    :class="`category-${kind}`"
    aria-hidden="true"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        v-if="kind === 'water'"
        d="M12 3C9 7 6 11 6 15a6 6 0 0 0 12 0c0-4-3-8-6-12Z"
      />
      <g v-else-if="kind === 'sink'">
        <path d="M3 13h18l-2 7H5l-2-7ZM8 10V6a3 3 0 0 1 6 0v2h3M12 10v1" />
      </g>
      <g v-else-if="kind === 'toilet'">
        <path d="M5 3h9v9H5zM5 12h15a7 7 0 0 1-7 7v2H8v-5M10 6h1" />
      </g>
      <g v-else>
        <path d="m18 3-7 9M9 10l6 5-4 6H3l6-11ZM8 16l-2 5m5-4-1 4" />
      </g>
    </svg>
  </span>
</template>
<style scoped>
.task-category-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 50%;
}
svg {
  width: 24px;
  height: 24px;
}
.category-floor {
  color: var(--ui-category-floor);
  background: var(--ui-category-floor-bg);
}
.category-toilet {
  color: var(--ui-category-toilet);
  background: var(--ui-category-toilet-bg);
}
.category-sink {
  color: var(--ui-category-sink);
  background: var(--ui-category-sink-bg);
}
.category-water {
  color: var(--ui-category-water);
  background: var(--ui-category-water-bg);
}
</style>
