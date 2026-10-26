<script setup lang="ts">
import "../interaction/memberNames.css";
import type { ChoreTask } from "../api/chores";
import TaskCategoryIcon from "./TaskCategoryIcon.vue";
defineProps<{
  task: ChoreTask;
  meta: string;
  busy?: boolean;
  allowed?: boolean;
  compact?: boolean;
}>();
defineEmits<{
  complete: [task: ChoreTask];
  detail: [task: ChoreTask, event: MouseEvent];
}>();
</script>
<template>
  <article
    class="quiet-task-card"
    :class="{
      'is-completed': task.status === 'completed',
      'is-compact': compact,
    }"
    :data-testid="`chore-task-${task.key}-${task.id}`"
  >
    <TaskCategoryIcon :kind="task.key" />
    <div class="quiet-task-copy">
      <p class="task-who">
        <span class="rounded-member-name">{{ task.assignee_name }}</span
        ><span aria-hidden="true"> · </span
        >{{ task.key === "water" ? "轮到抬水" : "值日" }}
      </p>
      <button
        class="quiet-task-title"
        :aria-label="`查看${task.name}详情`"
        @click="$emit('detail', task, $event)"
      >
        {{ task.name }}
      </button>
      <p class="task-meta">{{ meta }}</p>
    </div>
    <button
      v-if="task.status === 'pending' && allowed"
      class="task-status-circle"
      :disabled="busy"
      :aria-label="`标记${task.name}完成`"
      :data-testid="`complete-circle-${task.id}`"
      @click="$emit('complete', task)"
    >
      <span v-if="busy" class="circle-pending">·</span>
    </button>
    <span
      v-else
      class="task-status-circle"
      :class="{ 'is-checked': task.status === 'completed' }"
      :aria-label="task.status === 'completed' ? '已完成' : '待完成'"
      ><svg
        v-if="task.status === 'completed'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <path d="m6 12 4 4 8-8" /></svg
    ></span>
  </article>
</template>
<style scoped>
.quiet-task-card {
  display: flex;
  align-items: center;
  gap: var(--ui-card-gap);
  padding: var(--ui-card-padding);
  border: var(--ui-card-border);
  border-radius: var(--ui-card-radius);
  background: var(--ui-surface);
  width: 100%;
  box-sizing: border-box;
}
.quiet-task-copy {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: var(--ui-card-gap);
  text-align: left;
}
p {
  margin: 0;
}
.task-who,
.task-meta {
  font-size: var(--ui-small-size);
  color: var(--ui-text-muted);
  line-height: var(--ui-body-leading);
  overflow-wrap: anywhere;
}
.quiet-task-title {
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  font: inherit;
  font-size: var(--ui-card-title-size);
  font-weight: 700;
  line-height: var(--ui-title-leading);
  color: var(--ui-ink);
  cursor: pointer;
  overflow-wrap: anywhere;
}
.task-meta {
  font-size: var(--ui-caption-size);
}
.task-status-circle {
  box-sizing: border-box;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border: 1px solid var(--ui-border);
  border-radius: 50%;
  background: none;
  display: grid;
  place-items: center;
  color: var(--ui-ink);
  padding: 0;
}
button.task-status-circle {
  cursor: pointer;
  transition:
    transform var(--ui-release-time) var(--ui-ease-out),
    background var(--ui-state-time);
}
button.task-status-circle:active {
  transform: var(--ui-press-small);
  background: var(--ui-surface-muted);
}
.is-checked {
  background: var(--ui-ink);
  color: var(--ui-surface);
  border-color: var(--ui-ink);
}
svg {
  width: 24px;
  height: 24px;
}
.is-completed .quiet-task-title {
  text-decoration: line-through;
  color: var(--ui-text-muted);
}
.is-completed :deep(.task-category-icon) {
  filter: grayscale(1);
  opacity: 0.7;
}
button:focus-visible {
  outline: 2px solid var(--ui-ink);
  outline-offset: 4px;
}
@media (prefers-reduced-motion: reduce) {
  button.task-status-circle {
    transition: none;
  }
  button.task-status-circle:active {
    transform: none;
  }
}
</style>
