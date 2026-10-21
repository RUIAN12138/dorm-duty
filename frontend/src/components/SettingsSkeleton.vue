<script setup lang="ts">
withDefaults(
  defineProps<{ variant?: "notifications" | "account" | "times" }>(),
  { variant: "notifications" },
);
</script>
<template>
  <div
    class="settings-skeleton"
    :class="`settings-skeleton-${variant}`"
    role="status"
    aria-label="正在加载设置"
    aria-busy="true"
    data-testid="settings-skeleton"
  >
    <template v-if="variant === 'times'">
      <span
        class="placeholder time"
        v-for="i in 2"
        :key="i"
        aria-hidden="true"
      />
      <span class="placeholder action" aria-hidden="true" />
    </template>
    <template v-else>
      <span class="placeholder title" aria-hidden="true" />
      <span class="placeholder description" aria-hidden="true" />
      <span
        v-if="variant === 'account'"
        class="placeholder field"
        aria-hidden="true"
      />
      <span class="placeholder action" aria-hidden="true" />
      <span
        v-if="variant === 'notifications'"
        v-for="i in 2"
        :key="i"
        class="placeholder row"
        aria-hidden="true"
      />
    </template>
  </div>
</template>
<style scoped>
.settings-skeleton {
  display: grid;
  gap: 16px;
  width: 100%;
  padding-block: 4px 16px;
}
.placeholder {
  position: relative;
  display: block;
  overflow: hidden;
  border-radius: 12px;
  background: var(--app-tone-hefefef, #efefef);
}
.placeholder::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 20%,
    #ffffff85 50%,
    transparent 80%
  );
  transform: translateX(-100%);
  animation: settings-shimmer 1.5s linear infinite;
}
.title {
  height: 36px;
  width: 64%;
}
.description {
  height: 44px;
  width: 92%;
}
.field {
  height: 58px;
  margin-top: 8px;
}
.action {
  height: 50px;
  margin-block: 8px;
  border-radius: 25px;
}
.row {
  height: 48px;
}
.time {
  height: 48px;
  width: 100%;
}
:global([data-theme="dark"] .settings-skeleton .placeholder::after) {
  opacity: 0.12;
}
@keyframes settings-shimmer {
  to {
    transform: translateX(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .placeholder::after {
    animation: none;
  }
}
:global(
  html[data-interaction="keyboard"] .settings-skeleton .placeholder::after
) {
  animation: none;
}
</style>
