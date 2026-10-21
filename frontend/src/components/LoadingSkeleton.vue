<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "rows" | "task" | "calendar" | "stats";
  }>(),
  { variant: "rows" },
);
</script>
<template>
  <div
    class="loading-skeleton"
    :class="`skeleton-${variant}`"
    role="status"
    :aria-label="
      variant === 'calendar'
        ? '正在加载日历'
        : variant === 'stats'
          ? '正在加载统计'
          : '正在加载安排'
    "
    aria-busy="true"
    data-testid="loading-skeleton"
  >
    <template v-if="variant === 'calendar'">
      <span class="skeleton-block skeleton-heading" aria-hidden="true" />
      <span class="skeleton-block skeleton-tabs" aria-hidden="true" />
      <div class="skeleton-grid" aria-hidden="true">
        <span v-for="day in 42" :key="day" class="skeleton-block" />
      </div>
    </template>
    <template v-else-if="variant === 'stats'">
      <div class="skeleton-stats-card" aria-hidden="true">
        <span class="skeleton-block skeleton-heading" /><span
          class="skeleton-block skeleton-number"
        /><span class="skeleton-block" />
      </div>
    </template>
    <template v-else>
      <span class="skeleton-block skeleton-heading" aria-hidden="true" />
      <span class="skeleton-block skeleton-title" aria-hidden="true" />
      <span class="skeleton-block skeleton-action" aria-hidden="true" />
      <span
        v-if="variant === 'task'"
        class="skeleton-block skeleton-round"
        aria-hidden="true"
      />
    </template>
  </div>
</template>
<style scoped>
.loading-skeleton {
  display: grid;
  align-content: center;
  gap: 24px;
  min-height: 220px;
  width: 100%;
  --skeleton-shine: #ffffffb3;
}
:global([data-theme="dark"]) .loading-skeleton {
  --skeleton-shine: #ffffff16;
}
.skeleton-block {
  display: block;
  position: relative;
  overflow: hidden;
  isolation: isolate;
  background: var(--ui-surface-muted, #ededed);
  border-radius: var(--ui-card-radius, 14px);
  height: 52px;
}
.skeleton-block::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 12%,
    var(--skeleton-shine) 48%,
    transparent 84%
  );
  transform: translateX(-110%);
  pointer-events: none;
}
.skeleton-heading {
  width: 42%;
  height: 24px;
}
.skeleton-title {
  width: 72%;
  height: 42px;
}
.skeleton-task {
  justify-items: center;
  min-height: min(65dvh, 560px);
}
.skeleton-task .skeleton-title {
  width: 48%;
  height: 78px;
}
.skeleton-task .skeleton-action {
  width: min(100%, 330px);
  height: 60px;
  border-radius: 999px;
}
.skeleton-round {
  width: 150px;
  height: 50px;
  border-radius: 25px;
}
.skeleton-calendar {
  align-content: start;
  gap: 18px;
  min-height: 0;
  height: 100%;
  padding-top: 8px;
  grid-template-rows: 24px 40px minmax(0, 1fr);
}
.skeleton-tabs {
  height: 40px;
}
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  min-height: 0;
  grid-template-rows: repeat(6, minmax(0, 1fr));
}
.skeleton-grid .skeleton-block {
  height: 100%;
  border-radius: 8px;
}
.skeleton-stats {
  min-height: 0;
  padding: 16px 8px;
}
.skeleton-stats-card {
  display: grid;
  align-content: center;
  gap: 28px;
  padding: 28px;
  min-height: min(42dvh, 300px);
  border: 1px solid var(--ui-border, #eee);
  border-radius: 24px;
}
.skeleton-number {
  height: 78px;
  width: 60%;
}
@media (prefers-reduced-motion: no-preference) {
  .skeleton-block::after {
    animation: skeleton-shimmer 1500ms linear infinite;
  }
}
@keyframes skeleton-shimmer {
  to {
    transform: translateX(110%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-block::after {
    display: none;
    animation: none;
  }
}
</style>
