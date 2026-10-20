<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { Reorder, useDragControls } from "motion-v";
import type { ChoreMember } from "../api/chores";
import MemberMark from "./MemberMark.vue";
import { motionAllowed, motionTokens } from "../interaction/motion";
const props = withDefaults(
  defineProps<{
    member: ChoreMember;
    index: number;
    count: number;
    active: boolean;
    disabled?: boolean;
    reset: number;
    categoryKey?: string;
    completed?: boolean;
    current?: boolean;
    currentLabel?: string;
  }>(),
  { categoryKey: "water", completed: undefined },
);
const emit = defineEmits<{
  start: [id: number];
  finish: [id: number, cancelled: boolean];
  step: [id: number, direction: number, keyboard: boolean];
}>();
const controls = useDragControls();
const held = ref(false),
  introDone = ref(false);
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
    introDone.value = true;
    held.value = true;
    emit("start", props.member.user_id);
    // Keep the pointer on the whole row after lifting, including when the
    // finger passes over a sibling or leaves the original name button.
    row?.setPointerCapture(pointer.pointerId);
    controls.start(pointer);
  }, 240);
}
function interruptHold() {
  end(true, true);
}
function hidden() {
  if (document.hidden) interruptHold();
}
window.addEventListener("blur", interruptHold);
document.addEventListener("visibilitychange", hidden);
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
  window.removeEventListener("blur", interruptHold);
  document.removeEventListener("visibilitychange", hidden);
});
</script>
<template>
  <Reorder.Item
    :ref="element"
    :value="member.user_id"
    class="sort-row"
    :class="{ lifted: held, 'intro-finished': introDone }"
    layout="position"
    :drag-listener="false"
    :drag-controls="controls"
    :drag-momentum="false"
    :drag-elastic="0.08"
    :transition="motionAllowed() ? motionTokens.layout : { duration: 0 }"
    :while-drag="{ scale: motionAllowed() ? 1.02 : 1 }"
    :aria-posinset="index + 1"
    :aria-setsize="count"
    @pointerdown="
      (event: PointerEvent) => {
        if (!(event.target as Element).closest('.sort-step')) down(event);
      }
    "
    @contextmenu.prevent
    @click.capture="suppress"
  >
    <div class="sort-card" :style="{ '--entry-index': index }">
      <span class="sort-position">{{ index + 1 }}</span>
      <div
        class="sort-person"
        :data-testid="`order-person-${categoryKey}-${member.user_id}`"
        @contextmenu.prevent
      >
        <MemberMark :id="member.marker_id" :size="24" inline /><strong
          ><span>{{ member.nickname }}</span
          ><small v-if="completed !== undefined">{{
            completed ? "已完成" : "待完成"
          }}</small
          ><small v-if="current" class="current-turn">{{
            currentLabel || "当前轮到"
          }}</small></strong
        >
      </div>
      <button
        type="button"
        class="sort-step"
        :disabled="disabled || index === 0"
        :aria-label="`${member.nickname}上移`"
        :data-testid="`order-up-${categoryKey}-${member.user_id}`"
        @click="emit('step', member.user_id, -1, false)"
      >
        ↑
      </button>
      <button
        type="button"
        class="sort-step"
        :disabled="disabled || index === count - 1"
        :aria-label="`${member.nickname}下移`"
        :data-testid="`order-down-${categoryKey}-${member.user_id}`"
        @click="emit('step', member.user_id, 1, false)"
      >
        ↓
      </button>
      <button
        type="button"
        class="sort-handle"
        :disabled="disabled"
        :aria-label="`拖动${member.nickname}调整轮序`"
        :data-testid="`order-drag-${categoryKey}-${member.user_id}`"
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
    </div>
  </Reorder.Item>
</template>
<style scoped>
.sort-row {
  position: relative;
  width: 100%;
  height: 72px;
  margin-bottom: 8px;
}
.sort-card {
  position: relative;
  width: 100%;
  height: 72px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 6px 0 12px;
  border: 1px solid var(--app-tone-he9e9e9, #e9e9e9);
  border-radius: 18px;
  background: var(--app-tone-hfff, #fff);
  box-shadow: none;
  animation: order-unfold 240ms cubic-bezier(0.22, 0.8, 0.3, 1)
    calc(min(var(--entry-index), 8) * 40ms) both;
  transition: opacity 160ms ease;
}
.sort-row.lifted {
  z-index: 10;
}
.sort-row.lifted .sort-card {
  background: var(--app-tone-hfff, #fff);
  outline: 1px solid var(--ui-ink);
  box-shadow: none;
}
.sort-position {
  width: 14px;
  color: var(--app-tone-h888, #888);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
strong {
  display: grid;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  font-weight: 500;
}
.current-turn {
  color: var(--app-tone-h111, #111);
  font-size: 12px;
  font-weight: 600;
}
button {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--app-tone-h444, #444);
  height: 44px;
  padding: 0;
  cursor: pointer;
}
.sort-step {
  width: 28px;
  font-size: 18px;
}
@media (pointer: coarse) {
  .sort-step {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .sort-step:focus-visible {
    position: static;
    width: 28px;
    height: 44px;
    clip-path: none;
  }
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
  color: var(--app-tone-hccc, #ccc);
  cursor: default;
}
button:focus-visible {
  outline: 2px solid var(--app-tone-h555, #555);
  outline-offset: -2px;
  border-radius: 8px;
}
@media (prefers-reduced-motion: reduce) {
  .sort-row {
    transition: none;
  }
}
</style>

<style scoped>
strong > span {
  overflow: hidden;
  text-overflow: ellipsis;
}
strong small {
  font-size: 11px;
  color: var(--app-tone-h888, #888);
  font-weight: 400;
}
.sort-step:active:not(:disabled),
.sort-handle:active:not(:disabled) {
  transform: var(--ui-press-small);
  background: var(--app-tone-heee, #eee);
  border-radius: 12px;
}
@media (prefers-reduced-motion: no-preference) {
  .sort-step,
  .sort-handle {
    transition:
      transform 140ms cubic-bezier(0.22, 1, 0.36, 1),
      background-color 140ms ease;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sort-step:active:not(:disabled),
  .sort-handle:active:not(:disabled) {
    transform: none;
  }
}
</style>

<style scoped>
.sort-card::before {
  content: "";
  position: absolute;
  inset: 0 5px -4px;
  border: 1px solid var(--app-tone-heee, #eee);
  border-radius: 18px;
  background: var(--app-tone-hf5f5f5, #f5f5f5);
  transform: scale(0.98);
  z-index: -1;
}
@keyframes order-unfold {
  from {
    opacity: 0;
    transform: translate3d(18px, calc(min(var(--entry-index), 6) * -54px), 0)
      scale(0.96) rotate(-0.8deg);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1) rotate(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .sort-card {
    animation: none;
  }
}
</style>

<style scoped>
.intro-finished .sort-card {
  animation: none;
}
</style>
