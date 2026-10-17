<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import {
  motionAllowed,
  motionEaseCss,
  motionTiming,
} from "../interaction/motion";
const props = defineProps<{ target: HTMLElement | null; disabled?: boolean }>();
const emit = defineEmits<{ back: [] }>();
const dragging = ref(false);
let gesture:
  | { id: number; x: number; y: number; distance: number; element: HTMLElement }
  | undefined;
let animation: Animation | undefined;
let generation = 0;
function down(event: PointerEvent) {
  if (props.disabled || event.button !== 0 || !props.target) return;
  generation++;
  const offset = new DOMMatrixReadOnly(getComputedStyle(props.target).transform)
    .m41;
  animation?.cancel();
  props.target.style.transform = `translate3d(${offset}px,0,0)`;
  gesture = {
    id: event.pointerId,
    x: event.clientX - offset,
    y: event.clientY,
    distance: offset,
    element: event.currentTarget as HTMLElement,
  };
  gesture.element.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId || !props.target) return;
  const dx = event.clientX - gesture.x,
    dy = event.clientY - gesture.y;
  if (!dragging.value && Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
    void finish(false);
    return;
  }
  if (dx < 8 && !dragging.value) return;
  dragging.value = true;
  gesture.distance = Math.max(0, Math.min(dx, props.target.clientWidth));
  if (motionAllowed())
    props.target.style.transform = `translate3d(${gesture.distance}px,0,0)`;
}
async function finish(commit: boolean) {
  const current = gesture;
  gesture = undefined;
  dragging.value = false;
  if (!current) return;
  if (current.element.hasPointerCapture(current.id))
    current.element.releasePointerCapture(current.id);
  const target = props.target,
    ticket = ++generation;
  if (target && motionAllowed()) {
    animation = target.animate(
      [
        { transform: `translate3d(${current.distance}px,0,0)`, opacity: 1 },
        {
          transform: `translate3d(${commit ? target.clientWidth : 0}px,0,0)`,
          opacity: commit ? 0 : 1,
        },
      ],
      {
        duration: motionTiming.page * 1000,
        easing: motionEaseCss,
        fill: "forwards",
      },
    );
    await animation.finished.catch(() => {});
  }
  if (ticket !== generation) return;
  if (target) target.style.transform = "";
  animation?.cancel();
  animation = undefined;
  if (commit) emit("back");
}
function up(event: PointerEvent) {
  if (gesture?.id === event.pointerId)
    void finish(
      gesture.distance >
        Math.min(120, (props.target?.clientWidth || 390) * 0.3),
    );
}
onBeforeUnmount(() => {
  generation++;
  animation?.cancel();
  if (props.target) props.target.style.transform = "";
});
</script>
<template>
  <button
    class="entry-back"
    type="button"
    aria-label="返回上一页"
    data-testid="entry-back"
    :disabled="disabled"
    @click="emit('back')"
  >
    <van-icon name="arrow-left" />
  </button>
  <div
    class="entry-back-edge"
    aria-hidden="true"
    data-testid="entry-back-edge"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="finish(false)"
  />
</template>
<style scoped>
.entry-back {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  left: 16px;
  z-index: 5;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #111;
  font-size: 24px;
}
.entry-back-edge {
  position: fixed;
  left: 0;
  top: calc(env(safe-area-inset-top, 0px) + 60px);
  bottom: env(safe-area-inset-bottom, 0px);
  width: 24px;
  z-index: 4;
  touch-action: pan-y;
}
</style>
