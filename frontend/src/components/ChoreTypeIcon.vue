<script setup lang="ts">
defineProps<{ type: "water" | "duty" }>();
</script>
<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    class="chore-type-icon"
  >
    <path
      v-if="type === 'water'"
      d="M12 2C9 6 5 10.1 5 14a7 7 0 0 0 14 0c0-3.9-4-8-7-12Z"
      fill="currentColor"
    />
    <g
      v-else
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="m18 3-7 9M9 10l6 5-4 6H3l6-11Z" />
      <path d="m8 16-2 5m5-4-1 4" />
    </g>
  </svg>
</template>
<style scoped>
.chore-type-icon {
  display: block;
  width: 1em;
  height: 1em;
  flex-shrink: 0;
}
</style>
