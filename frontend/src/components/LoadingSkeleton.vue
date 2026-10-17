<template>
  <div class="loading-skeleton" role="status" aria-label="正在加载安排">
    <span aria-hidden="true" /><span aria-hidden="true" /><span
      aria-hidden="true"
    />
  </div>
</template>
<style scoped>
.loading-skeleton {
  display: grid;
  align-content: center;
  gap: 24px;
  min-height: 220px;
  width: 100%;
}
.loading-skeleton span {
  display: block;
  background: var(--ui-surface-muted);
  border-radius: var(--ui-card-radius);
  height: 52px;
}
.loading-skeleton span:first-child {
  width: 42%;
  height: 24px;
}
.loading-skeleton span:nth-child(2) {
  width: 72%;
  height: 42px;
}
@media (prefers-reduced-motion: no-preference) {
  .loading-skeleton span {
    animation: skeleton-breathe 1.2s var(--ui-ease-out) infinite alternate;
  }
  .loading-skeleton span:nth-child(2) {
    animation-delay: var(--ui-stagger-time);
  }
  .loading-skeleton span:nth-child(3) {
    animation-delay: calc(2 * var(--ui-stagger-time));
  }
}
@keyframes skeleton-breathe {
  from {
    opacity: 0.45;
  }
  to {
    opacity: 1;
  }
}
</style>
