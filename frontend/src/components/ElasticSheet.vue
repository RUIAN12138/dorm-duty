<script setup lang="ts">
import {
  ref,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  provide,
  computed,
  useSlots,
} from "vue";
import { useSheetNavigation } from "../interaction/sheetNavigation";
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
    navigationRoot?: boolean;
    modal?: boolean;
    stickyHeader?: boolean;
    contained?: boolean;
    fixedContent?: boolean;
    contentHeight?: string;
    expandable?: boolean;
    expandFromScroll?: boolean;
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
const allocated = ref(false);
const slots = useSlots();
const navigation = useSheetNavigation();
const pageId = Symbol("sheet-page"),
  embedded = ref(false);
const pageTitle = computed(() => props.title);
const nested = computed(
  () => props.navigationRoot && navigation?.current.value,
);
const heading = computed(() =>
  nested.value ? nested.value.title.value : props.title,
);
const pageContained = computed(
  () => props.contained || !!(nested.value && nested.value.contained),
);
const pageFixed = computed(
  () => props.fixedContent || !!(nested.value && nested.value.fixedContent),
);
function rootBack() {
  if (nested.value) navigation?.back();
  else close();
}
function setNavigationTarget(value: unknown) {
  if (props.navigationRoot && navigation)
    navigation.target.value = value instanceof HTMLElement ? value : undefined;
}
function setFooterTarget(value: unknown) {
  if (props.navigationRoot && navigation)
    navigation.footerTarget.value =
      value instanceof HTMLElement ? value : undefined;
}
function setHeaderTarget(value: unknown) {
  if (props.navigationRoot && navigation)
    navigation.headerTarget.value =
      value instanceof HTMLElement ? value : undefined;
}
function finishEmbeddedLeave() {
  if (!props.modelValue && embedded.value) {
    embedded.value = false;
    emit("closed");
  }
}
let expanded = false,
  compactOffset = 0;
const expansionHeight = "calc(100dvh - max(20px, env(safe-area-inset-top)))";
function restGoal(): Goal {
  return { ...opened, y: allocated.value && !expanded ? compactOffset : 0 };
}
function allocate() {
  if (!props.expandable || allocated.value || !panel.value) return;
  const before = panel.value.offsetHeight;
  allocated.value = true;
  panel.value.style.height = expansionHeight;
  panel.value.style.maxHeight = expansionHeight;
  compactOffset = Math.max(0, panel.value.offsetHeight - before);
  paint({ ...pose, y: pose.y + compactOffset });
}
function releaseAllocation() {
  if (!allocated.value || expanded || !panel.value) return;
  allocated.value = false;
  panel.value.style.height = props.contained
    ? props.contentHeight || "min(75dvh, 820px)"
    : "";
  panel.value.style.maxHeight = "";
  compactOffset = 0;
  paint(opened);
}
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
  initialExpanded: boolean;
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
        {
          transform: [transform(pose), transform(goal)],
          opacity: [pose.opacity, goal.opacity],
        },
        transition,
      ),
    ];
    if (scrim.value)
      running.push(
        animate(
          scrim.value,
          { opacity: [pose.scrimOpacity, goal.scrimOpacity] },
          motionTokens[kind === "exit" ? "exit" : "enter"],
        ),
      );
    controls = running;
    await Promise.all(running.map((control) => control.then(() => {})));
    if (id === generation) paint(goal);
  }
  if (id !== generation) return;
  if (props.modelValue) {
    releaseAllocation();
    phase.value = "open";
  } else {
    present.value = false;
    if (props.navigationRoot) navigation?.end();
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
  boundary = null;
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
    initialExpanded: expanded,
    velocity: createVelocityTracker(event.clientY, performance.now()),
  };
  element.setPointerCapture(event.pointerId);
  phase.value = "dragging";
  if (panel.value) panel.value.style.willChange = "transform";
}
function move(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  gesture.velocity.add(event.clientY, performance.now());
  const travel = event.clientY - gesture.start;
  if (props.expandable && !allocated.value && travel < -4) {
    allocate();
    gesture.baseline += compactOffset;
  }
  const delta = gesture.baseline + travel;
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
  const initialExpanded = gesture.initialExpanded;
  const travel = event.clientY - gesture.start;
  resetGesture();
  if (allocated.value) {
    if (cancelled) expanded = initialExpanded;
    else if (travel < -40 || speed < -0.55) expanded = true;
    else if (initialExpanded && (travel > 70 || speed > 0.65)) expanded = false;
    phase.value = "opening";
    void go(restGoal(), "settle");
  } else if (!cancelled && (pose.y > 130 || (pose.y > 35 && speed > 0.6)))
    close();
  else {
    phase.value = "opening";
    void go(opened, "settle");
  }
}
let boundary: { y: number; start: number; engaged: boolean } | null = null;
function boundaryStart(event: TouchEvent) {
  if (
    !props.expandFromScroll ||
    !props.expandable ||
    expanded ||
    event.touches.length !== 1
  )
    return;
  boundary = {
    y: event.touches[0]!.clientY,
    start: event.touches[0]!.clientY,
    engaged: false,
  };
}
function boundaryMove(event: TouchEvent) {
  if (!boundary || event.touches.length !== 1 || !panel.value) return;
  const y = event.touches[0]!.clientY;
  const target =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>(
          "[data-native-scroll], [data-sheet-scroll]",
        )
      : null;
  const bottom =
    !target ||
    target.scrollTop + target.clientHeight >= target.scrollHeight - 2;
  if (!boundary.engaged) {
    if (!bottom || y >= boundary.y) {
      boundary.y = y;
      return;
    }
    boundary.start = boundary.y;
    if (boundary.start - y < 8) return;
    stop();
    allocate();
    boundary.engaged = true;
    phase.value = "dragging";
  }
  if (event.cancelable) event.preventDefault();
  paint({ ...pose, y: Math.max(-12, compactOffset + y - boundary.start) });
}
function boundaryEnd(event: TouchEvent) {
  const current = boundary;
  boundary = null;
  if (!current?.engaged) return;
  expanded = event.type !== "touchcancel" && pose.y < compactOffset - 40;
  phase.value = "opening";
  void go(restGoal(), "settle");
}
function boundaryWheel(event: WheelEvent) {
  if (
    !props.expandFromScroll ||
    !props.expandable ||
    expanded ||
    event.deltaY <= 0 ||
    event.ctrlKey
  )
    return;
  const target =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>(
          "[data-native-scroll], [data-sheet-scroll]",
        )
      : null;
  if (
    target &&
    target.scrollTop + target.clientHeight < target.scrollHeight - 2
  )
    return;
  event.preventDefault();
  stop();
  allocate();
  expanded = true;
  phase.value = "opening";
  void go(restGoal(), "settle");
}
function escape(event: KeyboardEvent) {
  const confirmation = layer.value?.querySelector<HTMLElement>(".van-dialog");
  if (confirmation && confirmation.getBoundingClientRect().height > 0)
    event.preventDefault();
  else if (nested.value) {
    event.preventDefault();
    rootBack();
  }
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
    props.modelValue ? restGoal() : hiddenGoal(),
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
    if (props.navigationRoot && navigation) {
      if (open) navigation.start();
    } else if (
      navigation &&
      (embedded.value || (open && navigation.active.value))
    ) {
      if (open) {
        embedded.value = true;
        phase.value = "open";
        navigation.push({
          id: pageId,
          title: pageTitle,
          close: () => emit("update:modelValue", false),
          footer: !!slots.footer,
          contained: !!props.contained,
          fixedContent: !!props.fixedContent,
          height: props.contentHeight,
        });
      } else {
        const visible = navigation.current.value?.id === pageId;
        phase.value = "closing";
        navigation.remove(pageId);
        if (!visible || !navigation.active.value || !motionAllowed())
          finishEmbeddedLeave();
      }
      return;
    }
    if (open) {
      const fresh = !present.value;
      if (fresh) {
        expanded = false;
        allocated.value = false;
        compactOffset = 0;
        lastFocus =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        present.value = true;
        removeBack = registerNativeBack(rootBack);
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
  navigation?.remove(pageId);
  if (props.navigationRoot) navigation?.end();
  resetGesture();
  stop();
  removeBack?.();
  media.removeEventListener("change", settleWhenInactive);
  window.removeEventListener("ui-motion-change", settleWhenInactive);
  document.removeEventListener("visibilitychange", settleWhenInactive);
});
</script>
<template>
  <Teleport
    v-if="embedded && navigation?.target.value"
    :to="navigation.target.value"
  >
    <Transition name="sheet-page" appear @after-leave="finishEmbeddedLeave">
      <div
        v-if="navigation.current.value?.id === pageId"
        class="sheet-navigation-page"
        :data-sheet-page="title"
      >
        <slot />
      </div>
    </Transition>
  </Teleport>
  <Teleport
    v-if="embedded && navigation?.footerTarget.value && $slots.footer"
    :to="navigation.footerTarget.value"
  >
    <Transition name="sheet-page" appear>
      <div
        v-if="navigation.current.value?.id === pageId"
        class="sheet-navigation-footer"
      >
        <slot name="footer" />
      </div>
    </Transition>
  </Teleport>
  <Teleport
    v-if="
      embedded && navigation?.headerTarget.value && $slots['header-actions']
    "
    :to="navigation.headerTarget.value"
  >
    <div v-if="navigation.current.value?.id === pageId">
      <slot name="header-actions" />
    </div>
  </Teleport>
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
              'has-contained-scroll': pageContained,
              'has-fixed-content': pageFixed,
              'has-sheet-footer': nested ? nested.footer : !!$slots.footer,
              'is-expandable': expandable,
              'is-expanded-sheet': allocated,
            }"
            :style="{
              transformOrigin: 'top left',
              height: allocated
                ? expansionHeight
                : pageContained
                  ? (nested && nested.height) ||
                    contentHeight ||
                    'min(75dvh, 820px)'
                  : undefined,
              maxHeight: allocated ? expansionHeight : undefined,
              willChange: phase === 'open' ? 'auto' : 'transform',
            }"
          >
            <div
              class="sheet-handle"
              data-sheet-handle
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
              data-sheet-header
              @pointerdown="down"
              @pointermove="move"
              @pointerup="up($event)"
              @pointercancel="up($event, true)"
              @lostpointercapture="up($event, true)"
            >
              <div>
                <DialogTitle as="h2">{{ heading }}</DialogTitle>
              </div>
              <div class="sheet-heading-actions">
                <button
                  v-if="nested"
                  type="button"
                  aria-label="返回上一层设置"
                  @click="rootBack"
                >
                  <van-icon name="arrow-left" />
                </button>
                <slot v-if="!nested" name="header-actions" />
                <div v-if="navigationRoot" :ref="setHeaderTarget" />
                <button type="button" aria-label="关闭详情" @click="close">
                  <van-icon name="cross" />
                </button>
              </div>
            </header>
            <div
              class="sheet-content"
              data-sheet-scroll
              @touchstart.passive="boundaryStart"
              @touchmove="boundaryMove"
              @touchend="boundaryEnd"
              @touchcancel="boundaryEnd"
              @wheel="boundaryWheel"
            >
              <Transition name="sheet-page">
                <div
                  v-if="navigationRoot && !nested"
                  class="sheet-navigation-page"
                >
                  <slot />
                </div>
              </Transition>
              <slot v-if="!navigationRoot" />
              <div
                v-if="navigationRoot"
                :ref="setNavigationTarget"
                class="sheet-navigation-target"
              />
            </div>
            <footer
              v-if="nested ? nested.footer : !!$slots.footer"
              class="sheet-footer"
            >
              <slot v-if="!nested" name="footer" />
              <div
                v-if="navigationRoot"
                :ref="setFooterTarget"
                class="sheet-navigation-target"
              />
            </footer>
          </section>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.sheet-navigation-target {
  position: relative;
  min-width: 0;
}
.sheet-navigation-page {
  min-width: 0;
}
.has-contained-scroll .sheet-navigation-target,
.has-contained-scroll .sheet-navigation-page {
  min-height: 0;
}
.has-fixed-content .sheet-navigation-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.sheet-page-enter-active {
  transition:
    transform 340ms var(--ui-ease-out),
    opacity 260ms var(--ui-ease-out);
}
.sheet-page-leave-active {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition:
    transform 220ms var(--ui-ease-out),
    opacity 180ms var(--ui-ease-out);
}
.sheet-page-enter-from {
  transform: translate3d(14px, 0, 0) scale(0.985);
  opacity: 0;
}
.sheet-page-leave-to {
  transform: translate3d(-10px, 0, 0) scale(0.985);
  opacity: 0;
}
.sheet-content:has(.sheet-navigation-target) {
  position: relative;
}
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
/* The panel never scrolls: handle, heading and footer stay outside the scrollport.
   Intrinsic height keeps short sheets compact; max-height only limits long ones. */
.elastic-sheet {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding-bottom: 0;
}
.sheet-handle,
.sheet-heading {
  flex: 0 0 auto;
}
.sheet-heading {
  position: relative;
  z-index: 2;
  background: var(--canvas, var(--app-tone-hfff, #fff));
}
.sheet-heading > div:first-child {
  min-width: 0;
}
.sheet-heading h2 {
  overflow-wrap: anywhere;
}
.sheet-content {
  min-height: 0;
  flex: 0 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  scroll-padding-block: 12px;
  padding: 4px 3px calc(24px + env(safe-area-inset-bottom));
  margin: 0 -3px;
  isolation: isolate;
}
.has-sheet-footer .sheet-content {
  padding-bottom: 14px;
}
@media (max-width: 350px) {
  .sheet-handle {
    margin-inline: -18px;
  }
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
  height: min(75dvh, 820px);
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
  padding-bottom: calc(14px + env(safe-area-inset-bottom));
}
.has-contained-scroll.has-sheet-footer .sheet-content {
  padding-bottom: 14px;
}
.sheet-content,
.sheet-content :deep([data-native-scroll]) {
  scrollbar-width: none;
}
.sheet-content::-webkit-scrollbar,
.sheet-content :deep([data-native-scroll])::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
.is-expanded-sheet .sheet-content {
  flex: 1;
}
.sheet-footer {
  position: relative;
  z-index: 40;
  flex-shrink: 0;
  padding: 14px 0 calc(18px + env(safe-area-inset-bottom));
  background: var(--canvas, var(--app-tone-hfff, #fff));
  border-top: 1px solid var(--app-tone-heee, #eee);
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
