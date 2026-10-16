<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import type { ChoreTask } from "../api/chores";
import GalaxySpinner from "./GalaxySpinner.vue";
import GalaxyCheck from "./GalaxyCheck.vue";
import { completionFeedback } from "../interaction/completionFeedback";
import { motionAllowed } from "../interaction/motion";
const props = defineProps<{
  task: ChoreTask;
  receipt?: ChoreTask | null;
  busy: boolean;
  disabled: boolean;
  syncing?: boolean;
  demo: boolean;
}>();
const emit = defineEmits<{
  complete: [task: ChoreTask];
  undo: [task: ChoreTask];
  settled: [id: number];
}>();
const button = ref<HTMLElement>(),
  round = ref(false),
  ready = ref(false),
  undoing = ref(false);
let observer: ResizeObserver | undefined;
let cancelFeedback: (() => void) | undefined;
onMounted(() => {
  const el = button.value;
  if (!el) return;
  const measure = () => {
    if (!el.clientWidth || !el.clientHeight) return;
    el.style.setProperty("--completion-width", `${el.clientWidth}px`);
    el.style.setProperty("--completion-diameter", `${el.clientHeight}px`);
  };
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(el);
});
let started = 0,
  pressed: number | null = null,
  receiptAtPress: ChoreTask | null | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  resetTimer: ReturnType<typeof setTimeout> | undefined,
  settledTimer: ReturnType<typeof setTimeout> | undefined;
function click() {
  if (props.task.status === "completed") {
    settle();
    undoing.value = true;
    emit("undo", props.task);
    return;
  }
  if (!props.demo && motionAllowed()) {
    started = performance.now();
    pressed = props.task.id;
    receiptAtPress = props.receipt;
    ready.value = false;
    round.value = true;
  }
  emit("complete", props.task);
}
watch(
  () => [props.receipt, props.task.id, props.task.status, props.busy],
  () => {
    if (undoing.value && !props.busy) undoing.value = false;
    if (pressed === null) return;
    if (props.task.id !== pressed) return settle();
    if (
      (props.receipt !== receiptAtPress && props.receipt?.id === pressed) ||
      props.task.status === "completed"
    ) {
      if (!timer)
        timer = setTimeout(
          () => {
            ready.value = true;
            cancelFeedback = completionFeedback(
              button.value?.getBoundingClientRect(),
            );
            resetTimer = setTimeout(() => settle(true), 320);
          },
          Math.max(0, 300 - (performance.now() - started)),
        );
    } else if (!props.busy) {
      settle();
    }
  },
);
function settle(keepCheck = false) {
  const id = pressed;
  clearTimeout(timer);
  clearTimeout(resetTimer);
  clearTimeout(settledTimer);
  timer = undefined;
  round.value = false;
  if (!keepCheck) {
    ready.value = false;
    cancelFeedback?.();
    cancelFeedback = undefined;
  }
  pressed = null;
  if (keepCheck && id !== null)
    settledTimer = setTimeout(
      () => emit("settled", id),
      motionAllowed() ? 320 : 0,
    );
}
const media = matchMedia("(prefers-reduced-motion: reduce)");
function preference() {
  if (media.matches) settle();
}
media.addEventListener("change", preference);
onBeforeUnmount(() => {
  observer?.disconnect();
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
      'is-undoing': undoing,
      'is-unavailable': disabled && !syncing && !busy,
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
    <span class="completion-fill" aria-hidden="true">
      <i class="completion-band" />
      <i class="completion-cap cap-start" />
      <i class="completion-cap cap-end" />
    </span>
    <span class="completion-label pending-label" aria-hidden="true">
      {{ task.key === "water" ? "我已抬水" : "我已完成" }}
    </span>
    <span class="completion-label done-label" aria-hidden="true"
      ><svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <path d="m6 12 4 4 8-8" /></svg
      ><span>{{ task.key === "water" ? "已抬水" : "已完成" }}</span></span
    >
    <span class="round-feedback" aria-hidden="true">
      <GalaxyCheck v-if="ready" class="completion-check" />
      <GalaxySpinner v-else-if="round" />
    </span>
    <span v-if="busy && !round" class="completion-busy" aria-hidden="true">
      <GalaxySpinner />
    </span>
  </button>
</template>
<style scoped>
.completion-surface {
  --completion-color: var(--ui-ink);
  --completion-travel: calc(
    (var(--completion-width, 300px) - var(--completion-diameter, 56px)) / 2
  );
  position: relative;
  isolation: isolate;
  display: grid;
  place-items: center;
  width: 100%;
  height: var(--ui-action-height);
  padding: 0 var(--ui-space-sm);
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ui-surface);
  font: inherit;
  font-size: var(--ui-body-size);
  font-weight: 600;
  cursor: pointer;
  transition:
    transform var(--ui-release-time) var(--ui-ease-overshoot),
    opacity 160ms ease;
  touch-action: manipulation;
}
.completion-fill {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
}
.completion-cap,
.completion-band {
  position: absolute;
  top: 0;
  height: 100%;
  background: var(--completion-color);
  transition:
    transform 320ms var(--ui-ease-soft),
    background-color 180ms ease;
}
.completion-band {
  left: calc(var(--completion-diameter, 56px) / 2 - 1px);
  right: calc(var(--completion-diameter, 56px) / 2 - 1px);
}
.completion-cap {
  width: var(--completion-diameter, 56px);
  border-radius: 50%;
}
.cap-start {
  left: 0;
}
.cap-end {
  right: 0;
}
.is-round .completion-band {
  transform: scaleX(0);
}
.is-round .cap-start {
  transform: translateX(var(--completion-travel));
}
.is-round .cap-end {
  transform: translateX(calc(-1 * var(--completion-travel)));
}
.completion-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  pointer-events: none;
  transition:
    opacity 180ms var(--ui-ease-out),
    transform 220ms var(--ui-ease-out),
    color 180ms ease;
}
.done-label {
  opacity: 0;
  transform: translateY(5px);
  color: var(--ui-ink);
}
.pending-label {
  opacity: 1;
  transform: translateY(0);
}
.is-done:not(.is-round) {
  --completion-color: var(--ui-surface-muted);
  color: var(--ui-ink);
}
.is-done .pending-label {
  opacity: 0;
  transform: translateY(-5px);
}
.is-done .done-label {
  opacity: 1;
  transform: translateY(0);
}
.is-round .completion-label {
  opacity: 0;
  transform: scale(0.94);
}
.round-feedback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  opacity: 0;
  transform: scale(0.9);
  transition:
    opacity 120ms ease,
    transform 180ms var(--ui-ease-overshoot);
  pointer-events: none;
}
.is-round .round-feedback {
  opacity: 1;
  transform: scale(1);
}
.completion-busy {
  position: absolute;
  right: 16px;
  top: calc(50% - 8px);
}
.completion-surface:active:not(:disabled) {
  transform: var(--ui-press-small);
  transition-duration: var(--ui-press-time);
}
.completion-surface:disabled {
  cursor: default;
}
.is-unavailable:not(.is-round) {
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
  width: 27px;
  height: 27px;
  animation: quiet-check 220ms var(--ui-ease-overshoot);
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
  .completion-cap,
  .completion-band,
  .completion-label,
  .round-feedback {
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
