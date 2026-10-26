<script setup lang="ts">
import { computed, nextTick, ref } from "vue";

type Segment = "hour" | "minute";
type PointerDrag = {
  pointerId: number;
  segment: Segment;
  startY: number;
  startValue: number;
  lastStep: number;
  moved: boolean;
};

const props = withDefaults(
  defineProps<{ modelValue?: string; label: string; compact?: boolean }>(),
  { modelValue: "08:00", compact: false },
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const hourInput = ref<HTMLInputElement | null>(null);
const minuteInput = ref<HTMLInputElement | null>(null);
const editing = ref<Segment | null>(null);
const hourDraft = ref("08");
const minuteDraft = ref("00");
const dragState = ref<PointerDrag | null>(null);
const suppressClick = ref<Segment | null>(null);

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function readTime(value: string | undefined) {
  const [hourText, minuteText] = (value || "08:00").split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return {
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 8,
    minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0,
  };
}

const parts = computed(() => readTime(props.modelValue));
const formatted = computed(() => `${pad(parts.value.hour)}:${pad(parts.value.minute)}`);

function emitTime(hour: number, minute: number) {
  emit("update:modelValue", `${pad(hour)}:${pad(minute)}`);
}

function setSegment(segment: Segment, value: number) {
  if (segment === "hour") emitTime(((value % 24) + 24) % 24, parts.value.minute);
  else emitTime(parts.value.hour, ((value % 60) + 60) % 60);
}

function adjustFromKeyboard(segment: Segment, event: KeyboardEvent) {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  setSegment(segment, parts.value[segment] + (event.key === "ArrowUp" ? 1 : -1));
}

function startDrag(segment: Segment, event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  suppressClick.value = null;
  dragState.value = {
    pointerId: event.pointerId,
    segment,
    startY: event.clientY,
    startValue: parts.value[segment],
    lastStep: 0,
    moved: false,
  };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function moveDrag(segment: Segment, event: PointerEvent) {
  const drag = dragState.value;
  if (!drag || drag.segment !== segment || drag.pointerId !== event.pointerId) return;
  const distance = drag.startY - event.clientY;
  if (Math.abs(distance) < 8) return;
  drag.moved = true;
  event.preventDefault();
  const step = Math.trunc(distance / 16);
  if (step === drag.lastStep) return;
  drag.lastStep = step;
  setSegment(segment, drag.startValue + step);
}

function endDrag(event: PointerEvent) {
  const drag = dragState.value;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (drag.moved) suppressClick.value = drag.segment;
  dragState.value = null;
}

function cancelDrag(event: PointerEvent) {
  if (dragState.value?.pointerId !== event.pointerId) return;
  dragState.value = null;
  suppressClick.value = null;
}

function editSegment(segment: Segment) {
  if (suppressClick.value === segment) {
    suppressClick.value = null;
    return;
  }
  editing.value = segment;
  hourDraft.value = pad(parts.value.hour);
  minuteDraft.value = pad(parts.value.minute);
  nextTick(() => {
    const input = segment === "hour" ? hourInput.value : minuteInput.value;
    input?.focus({ preventScroll: true });
    input?.select();
  });
}

function updateDraft(segment: Segment, event: Event) {
  const input = event.target as HTMLInputElement;
  const value = input.value.replace(/\D/g, "").slice(0, 2);
  input.value = value;
  if (segment === "hour") hourDraft.value = value;
  else minuteDraft.value = value;
}

function commitEdit(segment: Segment) {
  if (editing.value !== segment) return;
  const value = segment === "hour" ? hourDraft.value : minuteDraft.value;
  const maximum = segment === "hour" ? 23 : 59;
  if (/^\d{1,2}$/.test(value) && Number(value) <= maximum) {
    setSegment(segment, Number(value));
  }
  editing.value = null;
}

function cancelEdit(segment: Segment) {
  if (editing.value !== segment) return;
  if (segment === "hour") hourDraft.value = pad(parts.value.hour);
  else minuteDraft.value = pad(parts.value.minute);
  editing.value = null;
}
</script>

<template>
  <section
    class="time-wheel-setting"
    :class="{ compact }"
    :aria-label="label"
    :data-time-value="formatted"
  >
    <span>{{ label }}</span>
    <div class="time-dial" role="group" :aria-label="`${label}，点击数字输入或上下滑动调整`">
      <input
        v-if="editing === 'hour'"
        ref="hourInput"
        class="time-segment-input"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="2"
        enterkeyhint="done"
        :value="hourDraft"
        :aria-label="`${label} 小时`"
        @input="updateDraft('hour', $event)"
        @blur="commitEdit('hour')"
        @keydown.enter.prevent="commitEdit('hour')"
        @keydown.escape.prevent="cancelEdit('hour')"
      />
      <button
        v-else
        type="button"
        class="time-segment"
        data-time-segment="hour"
        :class="{ dragging: dragState?.segment === 'hour' }"
        :aria-label="`${label} 小时 ${pad(parts.hour)}，点击输入或上下滑动调整`"
        aria-keyshortcuts="ArrowUp ArrowDown"
        @pointerdown="startDrag('hour', $event)"
        @pointermove="moveDrag('hour', $event)"
        @pointerup="endDrag"
        @pointercancel="cancelDrag"
        @lostpointercapture="cancelDrag"
        @click="editSegment('hour')"
        @keydown="adjustFromKeyboard('hour', $event)"
      >{{ pad(parts.hour) }}</button>
      <span class="time-separator" aria-hidden="true">:</span>
      <input
        v-if="editing === 'minute'"
        ref="minuteInput"
        class="time-segment-input"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="2"
        enterkeyhint="done"
        :value="minuteDraft"
        :aria-label="`${label} 分钟`"
        @input="updateDraft('minute', $event)"
        @blur="commitEdit('minute')"
        @keydown.enter.prevent="commitEdit('minute')"
        @keydown.escape.prevent="cancelEdit('minute')"
      />
      <button
        v-else
        type="button"
        class="time-segment"
        data-time-segment="minute"
        :class="{ dragging: dragState?.segment === 'minute' }"
        :aria-label="`${label} 分钟 ${pad(parts.minute)}，点击输入或上下滑动调整`"
        aria-keyshortcuts="ArrowUp ArrowDown"
        @pointerdown="startDrag('minute', $event)"
        @pointermove="moveDrag('minute', $event)"
        @pointerup="endDrag"
        @pointercancel="cancelDrag"
        @lostpointercapture="cancelDrag"
        @click="editSegment('minute')"
        @keydown="adjustFromKeyboard('minute', $event)"
      >{{ pad(parts.minute) }}</button>
    </div>
  </section>
</template>

<style scoped>
.time-wheel-setting { min-width: 0; text-align: center; }
.time-wheel-setting > span { display: block; color: var(--muted); font-size: 14px; margin-bottom: 8px; }
.time-dial {
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--ink);
  font-size: clamp(36px, 10vw, 52px);
  line-height: 1.12;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.04em;
  white-space: nowrap;
}
.time-segment,
.time-segment-input {
  display: inline-grid;
  place-items: center;
  box-sizing: border-box;
  width: 1.42em;
  height: 1.16em;
  padding: 0;
  border: 0;
  border-radius: 10px;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: center;
  transition: transform 140ms ease-out, background-color 140ms ease-out;
}
.time-segment {
  cursor: ns-resize;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.time-segment:active { transform: scale(.96, .98); }
.time-segment.dragging { transform: scale(1.02, .96); }
.time-segment-input {
  outline: none;
  background: color-mix(in srgb, var(--ink) 5%, transparent);
  caret-color: var(--ink);
}
.time-segment:focus-visible,
.time-segment-input:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--ink) 36%, transparent);
  outline-offset: 2px;
}
.time-separator { width: .14em; }
.time-wheel-setting.compact .time-dial { font-size: 32px; }
@media (prefers-reduced-motion: reduce) {
  .time-segment,
  .time-segment-input { transition: none; }
}
</style>
