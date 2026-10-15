<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { Reorder, useDragControls } from "motion-v";
import type { ChoreMember } from "../api/chores";
import MemberMark from "./MemberMark.vue";
import { motionAllowed, motionTokens } from "../interaction/motion";
const props = defineProps<{
  member: ChoreMember;
  index: number;
  count: number;
  active: boolean;
  disabled?: boolean;
  reset: number;
}>();
const emit = defineEmits<{
  start: [id: number];
  finish: [id: number, cancelled: boolean];
  step: [id: number, direction: number, keyboard: boolean];
}>();
const controls = useDragControls();
const held = ref(false);
let pointer: PointerEvent | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let finishFrame = 0,
  generation = 0,
  suppressUntil = 0;
let row: HTMLElement | null = null;
function touch(event: TouchEvent) {
  if (held.value) event.preventDefault();
}
function element(value: unknown) {
  const candidate =
    value instanceof HTMLElement
      ? value
      : (value as { $el?: HTMLElement } | null)?.$el;
  row?.removeEventListener("touchmove", touch);
  row = candidate instanceof HTMLElement ? candidate : null;
  row?.addEventListener("touchmove", touch, { passive: false });
}
function release() {
  clearTimeout(timer);
  window.removeEventListener("pointermove", beforeMove);
  window.removeEventListener("pointerup", up);
  window.removeEventListener("pointercancel", cancelled);
}
function end(cancel: boolean, interrupt = false) {
  const event = pointer;
  if (!event) return;
  pointer = null;
  release();
  const wasHeld = held.value;
  held.value = false;
  if (interrupt && wasHeld)
    window.dispatchEvent(
      new PointerEvent("pointercancel", {
        pointerId: event.pointerId,
        isPrimary: true,
        clientX: event.clientX,
        clientY: event.clientY,
      }),
    );
  if (!wasHeld) return;
  suppressUntil = performance.now() + 500;
  const id = generation;
  cancelAnimationFrame(finishFrame);
  finishFrame = requestAnimationFrame(() => {
    if (id === generation) emit("finish", props.member.user_id, cancel);
  });
}
function beforeMove(event: PointerEvent) {
  if (!pointer || event.pointerId !== pointer.pointerId || held.value) return;
  if (
    Math.hypot(
      event.clientX - pointer.clientX,
      event.clientY - pointer.clientY,
    ) > 8
  )
    end(true);
}
function up(event: PointerEvent) {
  if (pointer?.pointerId === event.pointerId) end(false);
}
function cancelled(event: PointerEvent) {
  if (pointer?.pointerId === event.pointerId) end(true);
}
function down(event: PointerEvent) {
  if (
    !props.active ||
    props.disabled ||
    pointer ||
    !event.isPrimary ||
    event.button !== 0
  )
    return;
  cancelAnimationFrame(finishFrame);
  generation++;
  pointer = event;
  window.addEventListener("pointermove", beforeMove);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancelled);
  timer = setTimeout(() => {
    if (!pointer) return;
    held.value = true;
    emit("start", props.member.user_id);
    controls.start(pointer);
  }, 240);
}
function suppress(event: MouseEvent) {
  if (event.detail > 0 && performance.now() < suppressUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}
watch(
  () => [props.reset, props.active, props.disabled],
  () => {
    end(true, true);
  },
);
onBeforeUnmount(() => {
  end(true, true);
  generation++;
  cancelAnimationFrame(finishFrame);
  release();
  row?.removeEventListener("touchmove", touch);
});
</script>
<template>
  <Reorder.Item
    :ref="element"
    :value="member.user_id"
    class="sort-row"
    :class="{ lifted: held }"
    layout="position"
    :drag-listener="false"
    :drag-controls="controls"
    :drag-momentum="false"
    :drag-elastic="0.08"
    :transition="motionAllowed() ? motionTokens.layout : { duration: 0 }"
    :while-drag="{ scale: motionAllowed() ? 1.02 : 1 }"
    :aria-posinset="index + 1"
    :aria-setsize="count"
    @click.capture="suppress"
  >
    <span class="sort-position">{{ index + 1 }}</span>
    <button
      type="button"
      class="sort-person"
      :disabled="disabled"
      :aria-label="`长按${member.nickname}拖动`"
      :data-testid="`order-person-water-${member.user_id}`"
      @pointerdown="down"
      @contextmenu.prevent
      @keydown.up.prevent="emit('step', member.user_id, -1, true)"
      @keydown.down.prevent="emit('step', member.user_id, 1, true)"
    >
      <MemberMark :id="member.marker_id" :size="24" /><strong>{{
        member.nickname
      }}</strong>
    </button>
    <button
      type="button"
      class="sort-step"
      :disabled="disabled || index === 0"
      :aria-label="`${member.nickname}上移`"
      :data-testid="`order-up-water-${member.user_id}`"
      @click="emit('step', member.user_id, -1, false)"
    >
      ↑
    </button>
    <button
      type="button"
      class="sort-step"
      :disabled="disabled || index === count - 1"
      :aria-label="`${member.nickname}下移`"
      :data-testid="`order-down-water-${member.user_id}`"
      @click="emit('step', member.user_id, 1, false)"
    >
      ↓
    </button>
    <button
      type="button"
      class="sort-handle"
      :disabled="disabled"
      :aria-label="`拖动${member.nickname}调整轮序`"
      :data-testid="`order-drag-water-${member.user_id}`"
      @pointerdown="down"
      @contextmenu.prevent
      @keydown.up.prevent="emit('step', member.user_id, -1, true)"
      @keydown.down.prevent="emit('step', member.user_id, 1, true)"
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
  </Reorder.Item>
</template>
<style scoped>
.sort-row {
  position: relative;
  width: 100%;
  height: 64px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 6px 0 12px;
  margin-bottom: 8px;
  border: 1px solid #e9e9e9;
  border-radius: 14px;
  background: #fafafa;
  transition:
    box-shadow 160ms ease,
    background-color 160ms ease;
}
.sort-row.lifted {
  background: #fff;
  box-shadow:
    0 12px 30px #0000001c,
    0 2px 6px #0000000c;
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
.sort-person {
  display: flex;
  gap: 9px;
  flex: 1;
  min-width: 0;
  text-align: left;
  touch-action: pan-y;
}
.sort-handle,
.sort-person {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  cursor: grab;
}
.sort-handle {
  width: 44px;
  touch-action: none;
}
.lifted .sort-handle,
.lifted .sort-person {
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
@media (prefers-reduced-motion: reduce) {
  .sort-row {
    transition: none;
  }
}
</style>
