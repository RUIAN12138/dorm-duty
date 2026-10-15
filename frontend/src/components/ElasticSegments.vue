<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

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
const stretch = ref(1);
const origin = ref("right");
const progress = computed(
  () => previewIndex.value ?? selectedIndex.value,
);
const indicatorStyle = computed(() => ({
  "--segment-progress": progress.value,
  "--segment-stretch": stretch.value,
  "--segment-origin": origin.value,
  "--segment-count": props.options.length,
}));
let pointerId: number | null = null;
let startX = 0;
let startY = 0;
let lastX = 0;
let suppressClickUntil = 0;

function down(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || pointerId !== null) return;
  pointerId = event.pointerId;
  startX = lastX = event.clientX;
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
  const fraction = Math.max(
    0,
    Math.min(1, (event.clientX - rect.left - 4) / Math.max(1, rect.width - 8)),
  );
  previewIndex.value = fraction * (props.options.length - 1);
  stretch.value = 1 + Math.min(0.18, Math.abs(event.clientX - lastX) * 0.012);
  origin.value = event.clientX >= lastX ? "right" : "left";
  lastX = event.clientX;
}
function up(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  if (dragging.value && previewIndex.value !== null) {
    const index = Math.round(previewIndex.value);
    const option = props.options[index];
    if (option) emit("update:modelValue", option.value);
    suppressClickUntil = performance.now() + 500;
  }
  reset();
}
function cancel(event: PointerEvent) {
  if (event.pointerId === pointerId) reset();
}
function reset() {
  pointerId = null;
  dragging.value = false;
  previewIndex.value = null;
  stretch.value = 1;
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
    if (!dragging.value) previewIndex.value = null;
  },
);
onUnmounted(reset);
</script>

<template>
  <div
    ref="track"
    class="calendar-view-selector"
    role="group"
    :aria-label="groupLabel"
    :class="{ 'is-dragging': dragging }"
    :style="indicatorStyle"
    @pointerdown="down"
    @click.capture="suppressClick"
    @dragstart.prevent
  >
    <span class="segment-indicator" aria-hidden="true"></span>
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="modelValue === option.value"
      :data-testid="option.testId"
      @click="select(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
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
  width: calc((100% - 12px) / 2);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 3px #00000012;
  pointer-events: none;
  transform-origin: var(--segment-origin, right);
  transform:
    translateX(calc(var(--segment-progress) * (100% + 4px)))
    scaleX(var(--segment-stretch));
  transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.is-dragging .segment-indicator {
  transition: none;
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
.calendar-view-selector button[aria-pressed="true"] {
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
