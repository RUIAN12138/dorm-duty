<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { motion } from "motion-v";
import { TabsList, TabsTrigger } from "reka-ui";
import { useSelectionMotion } from "../interaction/motion";

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
    if (Math.abs(deltaY) > 8 && Math.abs(deltaY) >= Math.abs(deltaX)) {
      reset();
      return;
    }
    if (Math.abs(deltaX) < 8 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2)
      return;
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
    selection.move(selectedIndex.value);
    reset();
  }
}
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
onUnmounted(reset);
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
  border-radius: 14px;
  background: #f3f3f3;
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
  background: #fff;
  box-shadow: 0 1px 3px #00000012;
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
  color: #666;
  font-size: 16px;
  cursor: pointer;
  transition:
    color 160ms ease,
    transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}
.calendar-view-selector button[data-state="active"] {
  color: #111;
}
.calendar-view-selector button:active {
  transform: scale(0.97);
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
