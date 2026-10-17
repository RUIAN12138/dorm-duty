<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount, provide } from "vue";
import { animate } from "motion-v";
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
} from "reka-ui";
import { registerNativeBack } from "../interactions/nativeBack";
import { motionAllowed, motionTokens } from "../interaction/motion";
import { createVelocityTracker, rubberBand } from "../interaction/gestures";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    modal?: boolean;
    stickyHeader?: boolean;
    contained?: boolean;
    fixedContent?: boolean;
    title: string;
    origin?: DOMRect | null;
    motion?: "shared" | "bottom";
  }>(),
  { modal: true },
);
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  closed: [];
}>();
const present = ref(false);
const phase = ref<"opening" | "open" | "closing" | "dragging">("opening");
provide("sheet-motion-phase", phase);
const panel = ref<HTMLElement>();
const layer = ref<HTMLElement>();
const scrim = ref<HTMLElement>();
type Goal = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  scrimOpacity: number;
};
const opened: Goal = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  scrimOpacity: 1,
};
let pose: Goal = { ...opened };
const transform = (goal: Goal) =>
  `translate3d(${goal.x}px,${goal.y}px,0) scale(${goal.scaleX},${goal.scaleY})`;
function paint(goal: Goal) {
  pose = { ...goal };
  if (panel.value) {
    panel.value.style.transform = transform(goal);
    panel.value.style.opacity = String(goal.opacity);
  }
  if (scrim.value) scrim.value.style.opacity = String(goal.scrimOpacity);
}
let controls: { stop: () => void }[] = [];
let generation = 0;
let removeBack: (() => void) | undefined;
let lastFocus: HTMLElement | null = null;
let gesture: {
  id: number;
  element: HTMLElement;
  start: number;
  baseline: number;
  velocity: ReturnType<typeof createVelocityTracker>;
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
  if (panel.value?.isConnected) {
    const style = getComputedStyle(panel.value),
      matrix = new DOMMatrixReadOnly(
        style.transform === "none" ? undefined : style.transform,
      );
    pose = {
      x: matrix.m41,
      y: matrix.m42,
      scaleX: matrix.a,
      scaleY: matrix.d,
      opacity: Number(style.opacity),
      scrimOpacity: scrim.value
        ? Number(getComputedStyle(scrim.value).opacity)
        : 0,
    };
    paint(pose);
  }
  controls.forEach((control) => control.stop());
  controls = [];
}
function hiddenGoal(): Goal {
  const el = panel.value;
  if (el && props.motion !== "bottom" && props.origin) {
    return {
      x:
        props.origin.left -
        el.offsetLeft -
        (layer.value?.getBoundingClientRect().left || 0),
      y:
        props.origin.top -
        el.offsetTop -
        (layer.value?.getBoundingClientRect().top || 0),
      scaleX: props.origin.width / Math.max(1, el.offsetWidth),
      scaleY: props.origin.height / Math.max(1, el.offsetHeight),
      opacity: 0,
      scrimOpacity: 0,
    };
  }
  return {
    ...opened,
    y: el
      ? window.innerHeight -
        el.offsetTop -
        (layer.value?.getBoundingClientRect().top || 0) +
        24
      : window.innerHeight + 24,
    opacity: 1,
    scrimOpacity: 0,
  };
}
async function go(goal: Goal, kind: "enter" | "exit" | "settle") {
  stop();
  const id = generation;
  if (!motionAllowed() || document.hidden || !panel.value) {
    paint(goal);
  } else {
    // Full transform strings let Motion use native element animation. Dragging
    // writes the same pose directly; no six per-frame Vue/MotionValue updates.
    const transition =
      kind === "settle" ? motionTokens.settle : motionTokens.drawer;
    const running = [
      animate(
        panel.value,
        { transform: transform(goal), opacity: goal.opacity },
        transition,
      ),
    ];
    if (scrim.value)
      running.push(
        animate(
          scrim.value,
          { opacity: goal.scrimOpacity },
          motionTokens[kind === "exit" ? "exit" : "enter"],
        ),
      );
    controls = running;
    await Promise.all(running.map((control) => control.then(() => {})));
    if (id === generation) paint(goal);
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
    baseline: pose.y,
    velocity: createVelocityTracker(event.clientY, performance.now()),
  };
  element.setPointerCapture(event.pointerId);
  phase.value = "dragging";
}
function move(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  gesture.velocity.add(event.clientY, performance.now());
  const delta = gesture.baseline + event.clientY - gesture.start;
  paint({ ...pose, y: delta < 0 ? rubberBand(delta) : delta });
}
function up(event: PointerEvent, cancelled = false) {
  if (!gesture || gesture.id !== event.pointerId) return;
  if (
    event.type === "lostpointercapture" &&
    gesture.element.hasPointerCapture(event.pointerId)
  )
    return;
  const speed = gesture.velocity.read(performance.now());
  resetGesture();
  if (!cancelled && (pose.y > 130 || (pose.y > 35 && speed > 0.6))) close();
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
  if (!present.value || motionAllowed()) return;
  resetGesture();
  void go(
    props.modelValue ? opened : hiddenGoal(),
    props.modelValue ? "enter" : "exit",
  );
}
onMounted(() => {
  media.addEventListener("change", settleWhenInactive);
  window.addEventListener("ui-motion-change", settleWhenInactive);
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
        paint(hiddenGoal());
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
  window.removeEventListener("ui-motion-change", settleWhenInactive);
  document.removeEventListener("visibilitychange", settleWhenInactive);
});
</script>
<template>
  <DialogRoot
    :open="present"
    :modal="props.modal !== false"
    @update:open="requested"
  >
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
          :class="{ 'is-nonmodal': props.modal === false }"
          :data-motion="props.motion === 'bottom' ? 'bottom' : 'shared'"
          :data-phase="phase"
          :inert="phase === 'closing' ? true : undefined"
          tabindex="-1"
        >
          <DialogOverlay v-if="props.modal !== false" as-child
            ><div ref="scrim" class="sheet-scrim" @click="close"
          /></DialogOverlay>
          <section
            :ref="setPanel"
            class="elastic-sheet"
            :class="{
              'is-bottom-sheet': props.motion === 'bottom',
              'has-sticky-header': stickyHeader,
              'has-contained-scroll': contained,
              'has-fixed-content': fixedContent,
            }"
            :style="{
              transformOrigin: 'top left',
              willChange: phase === 'open' ? 'auto' : 'transform',
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
              <div class="sheet-heading-actions">
                <slot name="header-actions" />
                <button type="button" aria-label="关闭详情" @click="close">
                  <van-icon name="cross" />
                </button>
              </div>
            </header>
            <div class="sheet-content" data-sheet-scroll><slot /></div>
            <footer v-if="$slots.footer" class="sheet-footer">
              <slot name="footer" />
            </footer>
          </section>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.sheet-scrim {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  background: #0003;
}
.sheet-layer.is-nonmodal {
  pointer-events: none;
}
.is-nonmodal :deep(.van-dialog),
.is-nonmodal :deep(.van-overlay) {
  pointer-events: auto;
}
.is-nonmodal > .elastic-sheet {
  pointer-events: auto;
  max-height: min(55dvh, 460px);
  width: calc(100% - 24px);
  margin-bottom: calc(74px + env(safe-area-inset-bottom));
  border-radius: var(--ui-panel-radius);
}
</style>

<style scoped>
.has-sticky-header .sheet-heading {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--canvas, #fff);
  padding: 12px 0;
  margin-top: 0;
  margin-bottom: 16px;
  box-shadow: 0 -14px 0 var(--canvas, #fff);
}
</style>

<style scoped>
.sheet-heading-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.has-contained-scroll {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 0;
  height: min(90dvh, 820px);
}
.has-contained-scroll .sheet-handle,
.has-contained-scroll .sheet-heading {
  flex-shrink: 0;
}
.has-contained-scroll .sheet-heading {
  position: relative;
  top: auto;
  margin: 0;
  padding: 8px 0 16px;
  box-shadow: none;
}
.has-contained-scroll .sheet-content {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
  scroll-padding-block: 12px;
  padding: 4px 3px 14px;
  margin: 0 -3px;
  isolation: isolate;
}
.sheet-footer {
  position: relative;
  z-index: 40;
  flex-shrink: 0;
  padding: 14px 0 calc(18px + env(safe-area-inset-bottom));
  background: var(--canvas, #fff);
  border-top: 1px solid #eee;
}
</style>

<style scoped>
.has-fixed-content .sheet-content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.has-fixed-content .sheet-content > :deep(*) {
  min-height: 0;
  flex: 1;
}
</style>
