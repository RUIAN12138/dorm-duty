<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { ChoreMember } from "../api/chores";
import MemberMark from "./MemberMark.vue";

const props = defineProps<{
  modelValue: number[];
  members: ChoreMember[];
  active: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [order: number[]] }>();
const stride = 72;
const order = ref([...props.modelValue]);
const lifted = ref<number | null>(null);
const dragging = ref(false);
const offset = ref(0);
const announcement = ref("");
const keyboardStepping = ref(false);
let pointer: number | null = null;
let handle: HTMLElement | null = null;
let scroller: HTMLElement | null = null;
let originY = 0,
  latestY = 0,
  originScroll = 0,
  originIndex = 0;
let hold: ReturnType<typeof setTimeout> | undefined;
let settle: ReturnType<typeof setTimeout> | undefined;
let frame = 0;
let original: number[] = [];
const people = computed(
  () => new Map(props.members.map((p) => [p.user_id, p])),
);
watch(
  () => props.modelValue,
  (value) => {
    if (
      value.length === order.value.length &&
      value.every((id, index) => id === order.value[index])
    )
      return;
    cancel();
    order.value = [...value];
  },
  { deep: true },
);
watch(
  () => [props.active, props.disabled],
  () => {
    if (!props.active || props.disabled) cancel();
  },
);

function reposition(from: number, to: number) {
  const next = [...order.value];
  const [id] = next.splice(from, 1);
  if (id === undefined) return;
  next.splice(to, 0, id);
  order.value = next;
}
function releasePointer() {
  clearTimeout(hold);
  cancelAnimationFrame(frame);
  frame = 0;
  const id = pointer;
  pointer = null;
  if (id !== null && handle?.hasPointerCapture(id))
    handle.releasePointerCapture(id);
  handle = null;
  scroller = null;
}
function cancel() {
  if (pointer !== null && original.length) order.value = [...original];
  releasePointer();
  clearTimeout(settle);
  lifted.value = null;
  dragging.value = false;
}
function announce(id: number) {
  announcement.value = `${people.value.get(id)?.nickname || "室友"}，第 ${order.value.indexOf(id) + 1} 位，共 ${order.value.length} 位`;
}
function down(event: PointerEvent, id: number) {
  if (
    props.disabled ||
    !props.active ||
    pointer !== null ||
    !event.isPrimary ||
    event.button !== 0
  )
    return;
  clearTimeout(settle);
  keyboardStepping.value = false;
  lifted.value = null;
  original = [...order.value];
  pointer = event.pointerId;
  handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture(pointer);
  originY = latestY = event.clientY;
  originIndex = order.value.indexOf(id);
  scroller = handle.closest(".sheet-content");
  // The sheet itself may be the scroll container on a short screen.
  if (scroller && scroller.scrollHeight <= scroller.clientHeight)
    scroller = handle.closest(".elastic-sheet");
  originScroll = scroller?.scrollTop || 0;
  hold = setTimeout(() => {
    lifted.value = id;
    dragging.value = true;
    offset.value = originIndex * stride;
    announce(id);
    frame = requestAnimationFrame(tick);
  }, 260);
}
function updatePosition() {
  if (!dragging.value || lifted.value === null) return;
  const raw =
    originIndex * stride +
    latestY -
    originY +
    (scroller?.scrollTop || 0) -
    originScroll;
  const max = (order.value.length - 1) * stride;
  offset.value =
    raw < 0 ? raw * 0.18 : raw > max ? max + (raw - max) * 0.18 : raw;
  const target = Math.max(
    0,
    Math.min(order.value.length - 1, Math.round(raw / stride)),
  );
  const current = order.value.indexOf(lifted.value);
  if (target !== current) {
    reposition(current, target);
    announce(lifted.value);
  }
}
function tick() {
  if (!dragging.value) return;
  if (scroller) {
    const box = scroller.getBoundingClientRect();
    const edge = 48;
    const velocity =
      latestY < box.top + edge
        ? -Math.min(12, (box.top + edge - latestY) / 4)
        : latestY > box.bottom - edge
          ? Math.min(12, (latestY - box.bottom + edge) / 4)
          : 0;
    scroller.scrollTop += velocity;
  }
  updatePosition();
  frame = requestAnimationFrame(tick);
}
function move(event: PointerEvent) {
  if (event.pointerId !== pointer) return;
  latestY = event.clientY;
  if (!dragging.value && Math.abs(latestY - originY) > 8) {
    cancel();
    return;
  }
  if (dragging.value) {
    event.preventDefault();
    updatePosition();
  }
}
function up(event: PointerEvent, cancelled = false) {
  if (event.pointerId !== pointer) return;
  if (cancelled || !dragging.value) {
    cancel();
    return;
  }
  updatePosition();
  releasePointer();
  dragging.value = false;
  const result = [...order.value];
  emit("update:modelValue", result);
  settle = setTimeout(() => {
    lifted.value = null;
  }, 240);
}
function step(id: number, delta: number, keyboard = false) {
  cancel();
  keyboardStepping.value = keyboard;
  const from = order.value.indexOf(id),
    to = from + delta;
  if (props.disabled || to < 0 || to >= order.value.length) return;
  reposition(from, to);
  announce(id);
  emit("update:modelValue", [...order.value]);
}
onBeforeUnmount(cancel);
</script>

<template>
  <div
    class="water-sorter"
    :class="{ 'keyboard-step': keyboardStepping }"
    @keydown.esc.stop.prevent="cancel"
  >
    <p class="sort-hint">按住右侧拖动，调整先后</p>
    <ol
      aria-label="抬水轮换顺序"
      class="sort-list"
      :style="{ height: `${order.length * stride - 8}px` }"
    >
      <li
        v-for="(id, index) in order"
        :key="id"
        :aria-posinset="index + 1"
        :aria-setsize="order.length"
        :class="{ lifted: lifted === id, dragging: dragging && lifted === id }"
        :style="{
          transform: `translate3d(0, ${dragging && lifted === id ? offset : index * stride}px, 0) scale(${dragging && lifted === id ? 1.025 : 1})`,
        }"
      >
        <span class="sort-position">{{ index + 1 }}</span>
        <MemberMark :id="people.get(id)?.marker_id" :size="24" />
        <strong>{{ people.get(id)?.nickname || "室友" }}</strong>
        <button
          type="button"
          class="sort-step"
          :disabled="disabled || index === 0"
          :aria-label="`${people.get(id)?.nickname}上移`"
          :data-testid="`order-up-water-${id}`"
          @click="step(id, -1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="sort-step"
          :disabled="disabled || index === order.length - 1"
          :aria-label="`${people.get(id)?.nickname}下移`"
          :data-testid="`order-down-water-${id}`"
          @click="step(id, 1)"
        >
          ↓
        </button>
        <button
          type="button"
          class="sort-handle"
          :disabled="disabled"
          :aria-label="`拖动${people.get(id)?.nickname}调整轮序`"
          :data-testid="`order-drag-water-${id}`"
          @pointerdown="down($event, id)"
          @pointermove="move"
          @pointerup="up($event)"
          @pointercancel="up($event, true)"
          @lostpointercapture="up($event, true)"
          @contextmenu.prevent
          @keydown.up.prevent="step(id, -1, true)"
          @keydown.down.prevent="step(id, 1, true)"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6h12M4 10h12M4 14h12"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </li>
    </ol>
    <span class="sort-announcement" role="status" aria-live="polite">{{
      announcement
    }}</span>
  </div>
</template>

<style scoped>
.sort-hint {
  margin: 0 0 12px;
  font-size: 14px;
  color: #666;
}
.sort-list {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sort-list li {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 64px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 6px 0 12px;
  border: 1px solid #e9e9e9;
  border-radius: 14px;
  background: #fafafa;
  transition:
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 180ms ease,
    background-color 180ms ease;
}
.sort-list li.lifted {
  z-index: 2;
  background: #fff;
  box-shadow:
    0 12px 30px #0000001c,
    0 2px 6px #0000000c;
}
.sort-list li.dragging {
  transition:
    box-shadow 180ms ease,
    background-color 180ms ease;
  will-change: transform;
}
.keyboard-step .sort-list li {
  transition: none;
}
.sort-position {
  width: 14px;
  color: #888;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  font-weight: 500;
}
button {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: #444;
  height: 44px;
  padding: 0;
  cursor: pointer;
}
.sort-step {
  width: 28px;
  font-size: 18px;
}
.sort-handle {
  width: 44px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  cursor: grab;
}
.dragging .sort-handle {
  cursor: grabbing;
}
button:disabled {
  color: #ccc;
  cursor: default;
}
button:focus-visible {
  outline: 2px solid #555;
  outline-offset: -2px;
  border-radius: 8px;
}
.sort-announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .sort-list li,
  .sort-list li.dragging {
    transition: none;
  }
}
</style>
