<script setup lang="ts">
defineProps<{
  items: { id: string; name: string; completed: boolean }[];
  selected?: string;
  label: string;
  scroll?: boolean;
}>();
const emit = defineEmits<{ select: [id: string, event: MouseEvent] }>();
</script>
<template>
  <div
    class="task-selector"
    :class="{ 'is-scroll': scroll }"
    :aria-label="label"
  >
    <button
      v-for="item in items"
      :key="item.id"
      :aria-pressed="selected === item.id"
      @click="emit('select', item.id, $event)"
    >
      <span class="task-option-name">{{ item.name }}</span>
      <van-icon
        name="success"
        class="task-option-state"
        :class="{ 'is-complete': item.completed }"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
<style scoped>
/* Existing production duty selector, shared without changing its default geometry. */
.task-selector {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  justify-content: center;
  gap: 8px;
  width: min(100%, 350px);
}
.task-selector button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16px;
  align-items: center;
  justify-content: center;
  min-width: 0;
  gap: 4px;
  border: 0;
  border-radius: 10px;
  min-height: 44px;
  padding: 8px 7px;
  font-size: 16px;
  color: var(--app-tone-h666, #666);
  background: var(--app-tone-hfff, #fff);
  transition:
    background-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}
.task-selector button[aria-pressed="true"] {
  color: var(--app-tone-h111, #111);
  background: var(--app-tone-hf0f0f0, #f0f0f0);
}
.task-selector button:active {
  transform: scaleX(1.02) scaleY(0.94);
}
.task-option-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-option-state {
  width: 16px;
  opacity: 0;
  transform: scale(0.7);
  transition:
    opacity 180ms var(--ui-ease-out),
    transform 220ms var(--ui-ease-overshoot);
}
.task-option-state.is-complete {
  opacity: 1;
  transform: scale(1);
}
.task-selector.is-scroll {
  display: flex;
  justify-content: flex-start;
  overflow-x: auto;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}
.task-selector.is-scroll::-webkit-scrollbar {
  display: none;
}
.is-scroll button {
  flex: 1 0 96px;
}
@media (prefers-reduced-motion: reduce) {
  .task-selector button,
  .task-option-state {
    transition: none;
  }
  .task-selector button:active {
    transform: none;
  }
}
</style>
