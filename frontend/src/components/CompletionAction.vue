<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import GalaxySpinner from "./GalaxySpinner.vue";
import GalaxyCheck from "./GalaxyCheck.vue";
import type { ChoreTask } from "../api/chores";
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
const round = ref(false),
  confirmed = ref<ChoreTask | null>(null);
let pressedId: number | null = null,
  timer: ReturnType<typeof setTimeout> | undefined;
const visualTask = computed(() =>
  round.value && confirmed.value ? confirmed.value : props.task,
);
function reset() {
  if (confirmed.value) emit("settled", confirmed.value.id);
  clearTimeout(timer);
  round.value = false;
  confirmed.value = null;
  pressedId = null;
}
function click() {
  if (visualTask.value.status === "completed") {
    const task = visualTask.value;
    reset();
    emit("undo", task);
    return;
  }
  if (!props.demo && motionAllowed()) {
    pressedId = props.task.id;
    round.value = true;
  }
  emit("complete", props.task);
}
watch(
  () => [props.task.id, props.task.status, props.receipt, props.busy] as const,
  () => {
    const receipt =
      props.receipt?.id === pressedId
        ? props.receipt
        : props.task.id === pressedId && props.task.status === "completed"
          ? props.task
          : null;
    if (receipt && round.value && !confirmed.value) {
      confirmed.value = receipt;
      timer = setTimeout(reset, 650);
    } else if (
      !confirmed.value &&
      pressedId !== null &&
      !props.busy &&
      props.task.status === "pending"
    )
      reset();
  },
);
onBeforeUnmount(reset);
</script>
<template>
  <button
    type="button"
    class="completion-surface"
    :class="{ 'is-done': visualTask.status === 'completed', 'is-round': round }"
    :data-testid="
      visualTask.status === 'completed'
        ? `undo-${visualTask.id}`
        : `complete-${visualTask.key}-${visualTask.id}`
    "
    :aria-label="
      visualTask.status === 'completed'
        ? `${visualTask.key === 'water' ? '已抬水' : '已完成'}，再次点击撤销打卡`
        : undefined
    "
    :aria-pressed="visualTask.status === 'completed'"
    :aria-busy="busy"
    :disabled="busy || disabled"
    @click="click"
  >
    <span class="completion-fill" aria-hidden="true"></span>
    <span class="completion-label"
      ><GalaxyCheck v-if="visualTask.status === 'completed'" /><span
        class="completion-word"
        >{{
          visualTask.status === "completed"
            ? visualTask.key === "water"
              ? "已抬水"
              : "已完成"
            : visualTask.key === "water"
              ? "我已抬水"
              : "我已完成"
        }}</span
      ></span
    >
    <GalaxySpinner
      v-if="busy && visualTask.status !== 'completed'"
      class="completion-spinner"
    />
  </button>
</template>
<style scoped>
.completion-surface {
  position: relative;
  display: grid;
  place-items: center;
  width: min(100%, 300px);
  height: 60px;
  flex-shrink: 0;
  padding: 0 24px;
  border: 1px solid transparent;
  border-radius: 20px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 20px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  isolation: isolate;
}
.completion-fill {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: #111;
  clip-path: inset(0 0 round 20px);
  transition:
    clip-path 260ms cubic-bezier(0.32, 0.72, 0, 1),
    background-color 180ms ease;
}
.completion-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: gap 180ms ease;
}
.completion-word {
  transition: opacity 120ms ease;
  white-space: nowrap;
}
.is-done {
  color: #111;
}
.is-done .completion-fill {
  background: #efefef;
}
.is-round .completion-fill {
  clip-path: inset(0 calc((100% - 60px) / 2) round 30px);
  background: #111;
}
.is-round {
  color: #fff;
}
.is-round .completion-word {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.is-round .completion-label {
  gap: 0;
}
.is-round .galaxy-check {
  width: 27px;
  height: 27px;
}
.completion-surface:disabled {
  cursor: default;
  opacity: 1;
}
.completion-surface[aria-busy="true"]:not(.is-round) {
  color: #aaa;
}
.is-round[aria-busy="true"] .completion-label {
  opacity: 0;
}
.completion-spinner {
  position: absolute;
  right: 18px;
  width: 15px;
  height: 15px;
}
.is-round .completion-spinner {
  right: calc(50% - 10px);
  width: 20px;
  height: 20px;
}
.completion-surface:focus-visible {
  outline: 2px solid #111;
  outline-offset: 4px;
}
@media (prefers-reduced-motion: no-preference) {
  .completion-surface {
    transition:
      transform 160ms var(--ui-ease-out),
      color 160ms ease;
  }
  .completion-surface:active:not(:disabled) {
    transform: scale(0.99);
    transition-duration: 70ms;
  }
}
@media (prefers-reduced-motion: reduce) {
  .completion-fill,
  .completion-word,
  .completion-label {
    transition: none;
  }
}
</style>
