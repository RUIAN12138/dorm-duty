<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { motion } from "motion-v";
import { TabsList, TabsTrigger } from "reka-ui";
import { useSelectionMotion } from "../interaction/motion";
import { horizontalIntent } from "../interaction/gestures";

type SegmentOption = {
  value: string;
  label: string;
  testId?: string;
};
const props = defineProps<{
  modelValue: string;
  options: SegmentOption[];
  groupLabel: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const track = ref<HTMLElement | null>(null);
const selectedIndex = computed(() => {
  const index = props.options.findIndex(
    (option) => option.value === props.modelValue,
  );
  return Math.max(0, index);
});
const previewIndex = ref<number | null>(null);
const dragging = ref(false);
const selection = useSelectionMotion(
  selectedIndex.value,
  () => props.options.length,
  4,
);
let pointerId: number | null = null;
let startX = 0;
let startY = 0;
let suppressClickUntil = 0;

function down(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || pointerId !== null) return;
  pointerId = event.pointerId;
  startX = event.clientX;
  startY = event.clientY;
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
}
function move(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  const deltaX = event.clientX - startX;
  const deltaY = event.clientY - startY;
  if (!dragging.value) {
    const intent = horizontalIntent(deltaX, deltaY);
    if (intent === "vertical") {
      cancelGesture();
      return;
    }
    if (intent !== "horizontal") return;
    dragging.value = true;
  }
  event.preventDefault();
  const rect = track.value?.getBoundingClientRect();
  if (!rect || props.options.length < 2) return;
  const cell =
    (rect.width - 8 - (props.options.length - 1) * 4) / props.options.length;
  previewIndex.value = Math.max(
    0,
    Math.min(
      props.options.length - 1,
      (event.clientX - rect.left - 4 - cell / 2) / (cell + 4),
    ),
  );
  selection.track(previewIndex.value);
}
function up(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  if (dragging.value && previewIndex.value !== null) {
    const index = Math.round(previewIndex.value);
    const option = props.options[index];
    if (option) {
      selection.move(index);
      emit("update:modelValue", option.value);
    }
    suppressClickUntil = performance.now() + 500;
  }
  reset();
}
function cancel(event: PointerEvent) {
  if (event.pointerId === pointerId) {
    cancelGesture();
  }
}
function cancelGesture() {
  if (pointerId === null) return;
  suppressClickUntil = performance.now() + 500;
  selection.move(selectedIndex.value);
  reset();
}
function cancelWhenHidden() {
  if (document.hidden) cancelGesture();
}
window.addEventListener("blur", cancelGesture);
document.addEventListener("visibilitychange", cancelWhenHidden);
function reset() {
  pointerId = null;
  dragging.value = false;
  previewIndex.value = null;
  window.removeEventListener("pointermove", move);
  window.removeEventListener("pointerup", up);
  window.removeEventListener("pointercancel", cancel);
}
function select(value: string) {
  emit("update:modelValue", value);
}
function suppressClick(event: MouseEvent) {
  if (event.detail > 0 && performance.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}
watch(
  () => props.modelValue,
  () => {
    if (!dragging.value) {
      previewIndex.value = null;
      selection.move(selectedIndex.value);
    }
  },
);
onUnmounted(() => {
  reset();
  window.removeEventListener("blur", cancelGesture);
  document.removeEventListener("visibilitychange", cancelWhenHidden);
});
</script>

<template>
  <TabsList as-child :aria-label="groupLabel">
    <div
      ref="track"
      class="calendar-view-selector"
      :class="{ 'is-dragging': dragging }"
      :style="{ '--segment-count': options.length }"
      @pointerdown="down"
      @mousedown.capture.prevent
      @click.capture="suppressClick"
      @dragstart.prevent
    >
      <motion.span
        class="segment-indicator"
        aria-hidden="true"
        :style="{ transform: selection.transform }"
      />
      <TabsTrigger
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :data-testid="option.testId"
        @click="select(option.value)"
      >
        {{ option.label }}
      </TabsTrigger>
    </div>
  </TabsList>
</template>

<style scoped>
.calendar-view-selector {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: repeat(var(--segment-count), minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  margin-bottom: 24px;
  border-radius: var(--ui-control-radius);
  background: var(--ui-surface-muted);
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}
.segment-indicator {
  position: absolute;
  z-index: -1;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(
    (100% - 8px - (var(--segment-count) - 1) * 4px) / var(--segment-count)
  );
  border-radius: 10px;
  background: var(--ui-surface);
  /* Uiverse Pradeepsaranbishnoi heavy-dragonfly-92: isolated glider. */
  box-shadow: none;
  border: var(--ui-card-border);
  pointer-events: none;
}
.calendar-view-selector button {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 40px;
  padding: 5px 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--app-tone-h666, #666);
  font-size: 16px;
  cursor: pointer;
  transition:
    color 160ms ease,
    transform var(--ui-release-time) var(--ui-ease-out);
}
.calendar-view-selector button[data-state="active"] {
  color: var(--ui-ink);
}
.calendar-view-selector button:active {
  transform: var(--ui-press-small);
  transition-duration: var(--ui-press-time);
}
@media (max-width: 350px) {
  .calendar-view-selector button {
    font-size: 15px;
  }
}
@media (max-height: 650px) {
  .calendar-view-selector {
    margin-bottom: 14px;
  }
  .calendar-view-selector button {
    min-height: 36px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .segment-indicator,
  .calendar-view-selector button {
    transition: none;
  }
}
</style>
