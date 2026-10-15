<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { animate, motion, useMotionValue } from "motion-v";
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
} from "reka-ui";
import { registerNativeBack } from "../interactions/nativeBack";
import { motionAllowed, motionTokens } from "../interaction/motion";

const props = defineProps<{
  modelValue: boolean;
  title: string;
  origin?: DOMRect | null;
  motion?: "shared" | "bottom";
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  closed: [];
}>();
const present = ref(false);
const phase = ref<"opening" | "open" | "closing" | "dragging">("opening");
const panel = ref<HTMLElement>();
const layer = ref<HTMLElement>();
const x = useMotionValue(0),
  y = useMotionValue(0);
const scaleX = useMotionValue(1),
  scaleY = useMotionValue(1);
const opacity = useMotionValue(0),
  scrimOpacity = useMotionValue(0);
const values = { x, y, scaleX, scaleY, opacity, scrimOpacity };
type Goal = Record<keyof typeof values, number>;
const opened: Goal = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  scrimOpacity: 1,
};
let controls: { stop: () => void }[] = [];
let generation = 0;
let removeBack: (() => void) | undefined;
let lastFocus: HTMLElement | null = null;
let gesture: {
  id: number;
  element: HTMLElement;
  start: number;
  baseline: number;
  last: number;
  time: number;
  speed: number;
} | null = null;
function setPanel(value: unknown) {
  const candidate =
    value instanceof HTMLElement
      ? value
      : (value as { $el?: HTMLElement } | null)?.$el;
  if (candidate instanceof HTMLElement) panel.value = candidate;
}
function stop() {
  generation++;
  controls.forEach((control) => control.stop());
  controls = [];
}
function hiddenGoal(): Goal {
  const el = panel.value;
  if (el && props.motion !== "bottom" && props.origin) {
    const bounds = el.getBoundingClientRect();
    return {
      x: props.origin.left - (bounds.left - x.get()),
      y: props.origin.top - (bounds.top - y.get()),
      scaleX: props.origin.width / Math.max(1, el.offsetWidth),
      scaleY: props.origin.height / Math.max(1, el.offsetHeight),
      opacity: 0,
      scrimOpacity: 0,
    };
  }
  return {
    ...opened,
    y: (el?.offsetHeight || window.innerHeight) + 24,
    opacity: 1,
    scrimOpacity: 0,
  };
}
async function go(goal: Goal, kind: "enter" | "exit" | "settle") {
  stop();
  const id = generation;
  if (!motionAllowed() || document.hidden) {
    for (const key of Object.keys(values) as (keyof Goal)[])
      values[key].jump(goal[key]);
  } else {
    const running = (Object.keys(values) as (keyof Goal)[]).map((key) =>
      animate(
        values[key],
        goal[key],
        kind === "settle" ? motionTokens.settle : motionTokens[kind],
      ),
    );
    controls = running;
    await Promise.all(running.map((control) => control.then(() => {})));
  }
  if (id !== generation) return;
  if (props.modelValue) phase.value = "open";
  else {
    present.value = false;
    removeBack?.();
    removeBack = undefined;
    await nextTick();
    if (id === generation && !props.modelValue) emit("closed");
  }
}
function close() {
  if (present.value && props.modelValue) emit("update:modelValue", false);
}
function requested(value: boolean) {
  if (!value) close();
}
function resetGesture() {
  const active = gesture;
  gesture = null;
  if (active?.element.hasPointerCapture(active.id))
    active.element.releasePointerCapture(active.id);
}
function down(event: PointerEvent) {
  if (
    !panel.value ||
    !props.modelValue ||
    gesture ||
    !event.isPrimary ||
    event.button !== 0 ||
    (event.target instanceof Element &&
      event.target.closest(
        "button, input, textarea, select, a, [contenteditable='true']",
      ))
  )
    return;
  stop();
  const element = event.currentTarget as HTMLElement;
  gesture = {
    id: event.pointerId,
    element,
    start: event.clientY,
    baseline: y.get(),
    last: event.clientY,
    time: performance.now(),
    speed: 0,
  };
  element.setPointerCapture(event.pointerId);
  phase.value = "dragging";
}
function move(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const now = performance.now();
  gesture.speed =
    (event.clientY - gesture.last) / Math.max(1, now - gesture.time);
  gesture.last = event.clientY;
  gesture.time = now;
  const delta = gesture.baseline + event.clientY - gesture.start;
  y.set(delta < 0 ? delta / (1 + Math.abs(delta) / 64) : delta);
}
function up(event: PointerEvent, cancelled = false) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const speed = performance.now() - gesture.time > 80 ? 0 : gesture.speed;
  resetGesture();
  if (!cancelled && (y.get() > 130 || (y.get() > 35 && speed > 0.6))) close();
  else {
    phase.value = "opening";
    void go(opened, "settle");
  }
}
function escape(event: KeyboardEvent) {
  const confirmation = layer.value?.querySelector<HTMLElement>(".van-dialog");
  if (confirmation && confirmation.getBoundingClientRect().height > 0)
    event.preventDefault();
}
function restoreFocus(event: Event) {
  event.preventDefault();
  if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
}
const media = matchMedia("(prefers-reduced-motion: reduce)");
function settleWhenInactive() {
  if (!present.value || (!document.hidden && !media.matches)) return;
  resetGesture();
  void go(
    props.modelValue ? opened : hiddenGoal(),
    props.modelValue ? "enter" : "exit",
  );
}
onMounted(() => {
  media.addEventListener("change", settleWhenInactive);
  document.addEventListener("visibilitychange", settleWhenInactive);
});
watch(
  () => props.modelValue,
  async (open) => {
    resetGesture();
    if (open) {
      const fresh = !present.value;
      if (fresh) {
        lastFocus =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        present.value = true;
        removeBack = registerNativeBack(close);
      }
      phase.value = "opening";
      await nextTick();
      if (!props.modelValue || !panel.value) return;
      if (fresh) {
        const goal = hiddenGoal();
        for (const key of Object.keys(values) as (keyof Goal)[])
          values[key].jump(goal[key]);
      }
      void go(opened, "enter");
    } else if (present.value) {
      phase.value = "closing";
      void go(hiddenGoal(), "exit");
    }
  },
  { immediate: true, flush: "post" },
);
onBeforeUnmount(() => {
  resetGesture();
  stop();
  removeBack?.();
  media.removeEventListener("change", settleWhenInactive);
  document.removeEventListener("visibilitychange", settleWhenInactive);
  Object.values(values).forEach((value) => value.destroy());
});
</script>
<template>
  <DialogRoot :open="present" @update:open="requested">
    <DialogPortal v-if="present">
      <DialogContent
        as-child
        :aria-describedby="undefined"
        @escape-key-down="escape"
        @open-auto-focus.prevent="layer?.focus({ preventScroll: true })"
        @close-auto-focus="restoreFocus"
      >
        <div
          ref="layer"
          class="sheet-layer"
          :data-motion="props.motion === 'bottom' ? 'bottom' : 'shared'"
          :data-phase="phase"
          tabindex="-1"
        >
          <DialogOverlay as-child
            ><motion.div
              class="sheet-scrim"
              :style="{ opacity: scrimOpacity }"
              @click="close"
          /></DialogOverlay>
          <motion.section
            :ref="setPanel"
            class="elastic-sheet"
            :class="{ 'is-bottom-sheet': props.motion === 'bottom' }"
            :style="{
              x,
              y,
              scaleX,
              scaleY,
              opacity,
              transformOrigin: 'top left',
            }"
          >
            <div
              class="sheet-handle"
              @pointerdown="down"
              @pointermove="move"
              @pointerup="up($event)"
              @pointercancel="up($event, true)"
              @lostpointercapture="up($event, true)"
            >
              <span />
            </div>
            <header
              class="sheet-heading"
              @pointerdown="down"
              @pointermove="move"
              @pointerup="up($event)"
              @pointercancel="up($event, true)"
              @lostpointercapture="up($event, true)"
            >
              <div>
                <DialogTitle as="h2">{{ title }}</DialogTitle>
              </div>
              <button type="button" aria-label="关闭详情" @click="close">
                <van-icon name="cross" />
              </button>
            </header>
            <div class="sheet-content"><slot /></div>
          </motion.section>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
