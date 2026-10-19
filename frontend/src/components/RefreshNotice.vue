<script setup lang="ts">
defineProps<{ error: string; loading: boolean }>();
const emit = defineEmits<{ retry: [] }>();
</script>
<template>
  <Transition name="refresh-notice">
    <div v-if="error" class="refresh-notice" data-testid="board-refresh-notice">
      <span class="refresh-notice-accessible" role="status"
        >{{ error }}，当前显示上次安排。</span
      >
      <button
        :disabled="loading"
        :aria-label="loading ? '正在重新加载安排' : `${error}，重试刷新安排`"
        :title="error"
        @click="emit('retry')"
      >
        <van-icon name="replay" aria-hidden="true" />{{
          loading ? "刷新中…" : "刷新失败 · 重试"
        }}
      </button>
    </div>
  </Transition>
</template>
<style scoped>
.refresh-notice {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 3;
  white-space: nowrap;
}
.refresh-notice button {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid #eee;
  border-radius: 14px;
  background: #fff;
  color: #666;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.refresh-notice-accessible {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.refresh-notice-enter-active,
.refresh-notice-leave-active {
  transition:
    opacity 160ms var(--ui-ease-out),
    transform 160ms var(--ui-ease-out);
}
.refresh-notice-enter-from,
.refresh-notice-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .refresh-notice-enter-active,
  .refresh-notice-leave-active {
    transition: none;
  }
}
</style>
