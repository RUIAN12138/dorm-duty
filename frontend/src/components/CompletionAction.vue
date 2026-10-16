<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import type { ChoreTask } from "../api/chores";
import GalaxySpinner from "./GalaxySpinner.vue";
import { completionFeedback } from "../interaction/completionFeedback";
import { motionAllowed } from "../interaction/motion";
const props = defineProps<{
  task: ChoreTask;
  receipt?: ChoreTask | null;
  busy: boolean;
  disabled: boolean;
  demo: boolean;
}>();
const emit = defineEmits<{
  complete: [task: ChoreTask];
  undo: [task: ChoreTask];
  settled: [id: number];
}>();
const button = ref<HTMLElement>(),
  round = ref(false),
  ready = ref(false);
let started = 0,
  pressed: number | null = null,
  timer: ReturnType<typeof setTimeout> | undefined,
  resetTimer: ReturnType<typeof setTimeout> | undefined;
function click() {
  if (props.task.status === "completed") {
    settle();
    emit("undo", props.task);
    return;
  }
  if (!props.demo && motionAllowed()) {
    started = performance.now();
    pressed = props.task.id;
    round.value = true;
  }
  emit("complete", props.task);
}
watch(
  () => [props.receipt, props.task.status, props.busy],
  () => {
    if (pressed === null) return;
    if (props.receipt?.id === pressed || props.task.status === "completed") {
      if (!timer)
        timer = setTimeout(
          () => {
            ready.value = true;
            completionFeedback(button.value?.getBoundingClientRect());
            resetTimer = setTimeout(settle, 620);
          },
          Math.max(0, 300 - (performance.now() - started)),
        );
    } else if (!props.busy) {
      round.value = false;
      pressed = null;
    }
  },
);
function settle() {
  clearTimeout(timer);
  clearTimeout(resetTimer);
  timer = undefined;
  round.value = false;
  ready.value = false;
  pressed = null;
}
const media = matchMedia("(prefers-reduced-motion: reduce)");
function preference() {
  if (media.matches) settle();
}
media.addEventListener("change", preference);
onBeforeUnmount(() => {
  settle();
  media.removeEventListener("change", preference);
});
</script>
<template>
  <button
    ref="button"
    type="button"
    class="completion-surface"
    :class="{
      'is-done': task.status === 'completed',
      'is-round': round,
      'is-ready': ready,
    }"
    :disabled="busy || disabled"
    :aria-busy="busy"
    :aria-label="
      task.status === 'completed'
        ? `${task.key === 'water' ? '已抬水' : '已完成'}，再次点击撤销打卡`
        : task.key === 'water'
          ? '我已抬水'
          : '我已完成'
    "
    :data-testid="
      task.status === 'completed'
        ? `undo-${task.id}`
        : `complete-${task.key}-${task.id}`
    "
    @click="click"
  >
    <span class="completion-fill" aria-hidden="true" /><span
      class="completion-circle"
      aria-hidden="true"
    />
    <span class="completion-label"
      ><svg
        v-if="task.status === 'completed'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <path d="m6 12 4 4 8-8" /></svg
      ><span>{{
        task.status === "completed"
          ? task.key === "water"
            ? "已抬水"
            : "已完成"
          : task.key === "water"
            ? "我已抬水"
            : "我已完成"
      }}</span></span
    >
    <span v-if="round" class="round-feedback" aria-hidden="true"
      ><svg
        v-if="ready"
        class="completion-check"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <path d="m6 12 4 4 8-8" /></svg
      ><GalaxySpinner v-else /></span
    ><GalaxySpinner v-else-if="busy" />
  </button>
</template>
<style scoped>
.completion-surface {
  position: relative;
  isolation: isolate;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--ui-card-gap);
  width: 100%;
  height: var(--ui-action-height);
  padding: 0 var(--ui-space-sm);
  border: 0;
  border-radius: var(--ui-control-radius);
  background: transparent;
  color: var(--ui-surface);
  font: inherit;
  font-size: var(--ui-body-size);
  font-weight: 600;
  cursor: pointer;
  transition: transform var(--ui-release-time) var(--ui-ease-overshoot);
  touch-action: manipulation;
}
.completion-fill {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--ui-ink);
  border-radius: var(--ui-control-radius);
  transition:
    transform 320ms var(--ui-ease-soft),
    opacity 180ms var(--ui-ease-out);
}
.completion-circle {
  position: absolute;
  z-index: -1;
  left: calc(50% - 25px);
  top: calc((100% - 50px) / 2);
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--ui-ink);
  opacity: 0;
  transition: opacity 180ms var(--ui-ease-out);
}
.completion-label {
  display: flex;
  align-items: center;
  gap: var(--ui-card-gap);
  transition: opacity 120ms var(--ui-ease-out);
}
.is-done {
  color: var(--ui-ink);
}
.is-done .completion-fill {
  background: var(--ui-surface-muted);
}
.is-round .completion-fill {
  transform: scaleX(0.15);
  opacity: 0;
}
.is-round .completion-circle {
  opacity: 1;
}
.is-round .completion-label {
  opacity: 0;
}
.is-round {
  color: var(--ui-surface);
}
.round-feedback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
.completion-surface:active:not(:disabled) {
  transform: var(--ui-press-small);
  transition-duration: var(--ui-press-time);
}
.completion-surface:disabled {
  cursor: default;
}
.completion-surface:disabled:not(.is-round) {
  opacity: 0.55;
}
.completion-surface:focus-visible {
  outline: 2px solid var(--ui-ink);
  outline-offset: 4px;
}
svg {
  width: 24px;
  height: 24px;
}
.completion-check {
  animation: quiet-check 220ms var(--ui-ease-out);
}
@keyframes quiet-check {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .completion-surface,
  .completion-fill,
  .completion-circle,
  .completion-label {
    transition: none;
  }
  .completion-check {
    animation: none;
  }
  .completion-surface:active:not(:disabled) {
    transform: none;
  }
}
</style>
