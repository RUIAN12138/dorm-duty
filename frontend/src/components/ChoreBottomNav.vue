<script setup lang="ts">
import LiquidNavGlass from "./LiquidNavGlass.vue";
import { companionEntering } from "../interaction/companion";
import { computed, ref, watch, onUnmounted } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { motion } from "motion-v";
import {
  useSelectionMotion,
  navigationScrubbing,
  navigationOrigin,
} from "../interaction/motion";
import { horizontalIntent } from "../interaction/gestures";
const router = useRouter();
const props = defineProps<{
  section: "duty" | "water" | "calendar";
  pages?: { id: "duty" | "water" | "calendar"; label: string }[];
  preview?: boolean;
}>();
const emit = defineEmits<{
  select: [section: "duty" | "water" | "calendar"];
  reorder: [section: "duty" | "water" | "calendar", toIndex: number];
}>();
const defaults = [
  { section: "duty", path: "/", label: "值日" },
  { section: "water", path: "/water", label: "催促" },
  { section: "calendar", path: "/calendar", label: "日历" },
] as const;
const items = computed(
  () =>
    props.pages?.map((page) => ({
      ...defaults.find((item) => item.section === page.id)!,
      label: page.id === "water" ? "催促" : page.label,
    })) || [...defaults],
);
const dragging = ref(false);
const currentIndex = computed(() =>
  items.value.findIndex((item) => item.section === props.section),
);
const pressedIndex = ref(-1),
  opticalGlass = ref(false);
const glassPosition = ref(currentIndex.value);
const selection = useSelectionMotion(
  currentIndex.value,
  () => items.value.length,
);
const stopGlassPosition = selection.position.on("change", (value) => {
  glassPosition.value = value;
});
watch(currentIndex, (next) => {
  if (!dragging.value) selectTarget(next);
  requestedIndex = next;
});
onUnmounted(() => {
  stopGlassPosition();
  gesture = null;
  navigationScrubbing.value = false;
  window.removeEventListener("blur", cancelGesture);
  document.removeEventListener("visibilitychange", cancelWhenHidden);
});
let gesture: {
  id: number;
  x: number;
  y: number;
  nav: HTMLElement;
  navigated: boolean;
  section: "duty" | "water" | "calendar";
  reordering: boolean;
} | null = null;
let suppressClickUntil = 0;
let navigationRequest = 0;
let requestedIndex = currentIndex.value;
let reorderHold: ReturnType<typeof setTimeout> | undefined;
function selectTarget(index: number) {
  // The lens crosses intermediate labels; routing still goes straight to the
  // selected page. Lens position must never drive a route on a simple tap.
  selection.move(index);
}
function navigate(index: number, replace = false) {
  if (props.preview) {
    const item = items.value[index];
    if (item) emit("select", item.section);
    return;
  }
  if (
    requestedIndex === index &&
    router.currentRoute.value.path === items.value[index]!.path
  )
    return;
  requestedIndex = index;
  const request = ++navigationRequest;
  // A scrub is one navigation in history, even if it passes several pages.
  void router[replace ? "replace" : "push"]({
    path: items.value[index]!.path,
  }).finally(() => {
    if (request === navigationRequest && !gesture)
      selection.move(currentIndex.value);
  });
}
function position(x: number, nav: HTMLElement) {
  const rect = nav.getBoundingClientRect();
  const width = Math.max(1, rect.width - 16);
  const fraction = ((x - rect.left - 8) / width) * items.value.length;
  return {
    index: Math.max(0, Math.min(items.value.length - 1, Math.floor(fraction))),
    progress: Math.max(0, Math.min(items.value.length - 1, fraction - 0.5)),
  };
}
function down(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || gesture) return;
  if (!(event.target instanceof Element) || !event.target.closest("a,button[data-section]")) return;
  const nav = event.currentTarget as HTMLElement;
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    nav,
    navigated: false,
    section:
      (event.target as Element).closest<HTMLElement>("[data-section]")?.dataset
        .section as "duty" | "water" | "calendar",
    reordering: false,
  };
  requestedIndex = currentIndex.value;
  pressedIndex.value = position(event.clientX, nav).index;
  selectTarget(pressedIndex.value);
  suppressClickUntil = 0;
  nav.setPointerCapture(event.pointerId);
  if (props.preview) {
    clearTimeout(reorderHold);
    reorderHold = setTimeout(() => {
      if (!gesture) return;
      gesture.reordering = true;
      dragging.value = true;
      navigationScrubbing.value = true;
      pressedIndex.value = -1;
    }, 280);
  }
}
function move(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  if (gesture.reordering) {
    if (event.cancelable) event.preventDefault();
    const to = position(event.clientX, gesture.nav).index;
    const from = items.value.findIndex((item) => item.section === gesture!.section);
    if (to !== from) emit("reorder", gesture.section, to);
    return;
  }
  if (!dragging.value) {
    const intent = horizontalIntent(
      event.clientX - gesture.x,
      event.clientY - gesture.y,
    );
    if (intent === "vertical") return cancelGesture();
    if (intent !== "horizontal") return;
  }
  dragging.value = true;
  navigationScrubbing.value = true;
  navigationOrigin.value = null;
  pressedIndex.value = -1;
  const point = position(event.clientX, gesture.nav);
  selection.track(point.progress);
  if (point.index !== requestedIndex) {
    navigate(point.index, gesture.navigated);
    gesture.navigated = true;
  }
}
function cancelGesture() {
  if (!gesture) return;
  const { nav, id } = gesture;
  gesture = null;
  clearTimeout(reorderHold);
  dragging.value = false;
  navigationScrubbing.value = false;
  pressedIndex.value = -1;
  suppressClickUntil = performance.now() + 500;
  if (nav.hasPointerCapture(id)) nav.releasePointerCapture(id);
  selection.move(currentIndex.value);
}
function cancelWhenHidden() {
  if (document.hidden) cancelGesture();
}
window.addEventListener("blur", cancelGesture);
document.addEventListener("visibilitychange", cancelWhenHidden);
function finish(event: PointerEvent, cancelled = false) {
  if (!gesture || gesture.id !== event.pointerId) return;
  if (
    event.type === "lostpointercapture" &&
    gesture.nav.hasPointerCapture(event.pointerId)
  )
    return;
  const nav = gesture.nav;
  const wasDragging = dragging.value;
  const wasReordering = gesture.reordering;
  gesture = null;
  clearTimeout(reorderHold);
  pressedIndex.value = -1;
  dragging.value = false;
  navigationScrubbing.value = false;
  if (nav.hasPointerCapture(event.pointerId))
    nav.releasePointerCapture(event.pointerId);
  suppressClickUntil = performance.now() + 500;
  const rect = nav.getBoundingClientRect();
  if (
    cancelled ||
    event.clientY < rect.top - 24 ||
    event.clientY > rect.bottom + 24
  ) {
    selection.move(currentIndex.value);
    return;
  }
  const index = position(event.clientX, nav).index;
  if (!wasDragging && index !== currentIndex.value)
    navigationOrigin.value = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
  if (wasDragging && !wasReordering) selection.move(index);
  else if (wasReordering) selection.move(currentIndex.value);
  else selectTarget(index);
  if (!wasReordering) navigate(index);
}
function click(event: MouseEvent) {
  if (event.detail > 0 && performance.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (
    event.detail &&
    event.target instanceof Element &&
    event.target.closest("a,button[data-section]")
  )
    navigationOrigin.value = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
}
</script>
<template>
  <nav
    class="chore-bottom-nav"
    :style="
      companionEntering ? { opacity: 0, pointerEvents: 'none' } : undefined
    "
    aria-label="宿舍导航"
    data-testid="chore-bottom-nav"
    :class="{
      'is-dragging': dragging,
      'is-moving': selection.moving.value,
      'has-optical-glass': opticalGlass,
      'glass-pressed': pressedIndex >= 0,
    }"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="finish($event)"
    @pointercancel="finish($event, true)"
    @lostpointercapture="finish($event, true)"
    @click.capture="click"
    @dragstart.prevent
  >
    <LiquidNavGlass
      :position="glassPosition"
      :pressed="pressedIndex >= 0"
      :dragging="dragging"
      :moving="selection.moving.value"
      :active="currentIndex"
      optical
      @ready="opticalGlass = $event"
    />
    <motion.span
      v-if="!opticalGlass"
      class="nav-selection"
      aria-hidden="true"
      :style="{ transform: selection.transform }"
    />
    <component
      :is="preview ? 'button' : RouterLink"
      v-for="(item, index) in items"
      :key="item.section"
      :to="preview ? undefined : { path: item.path }"
      :type="preview ? 'button' : undefined"
      :data-section="item.section"
      :class="{
        active: section === item.section,
        pressed: pressedIndex === index,
      }"
      :aria-current="section === item.section ? 'page' : undefined"
      :data-testid="`nav-${item.section}`"
      @click="preview && navigate(index)"
    >
      <span class="nav-native-content">
        <svg
          v-if="item.section === 'duty'"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M7 4h10a2 2 0 0 1 2 2v14H5V6a2 2 0 0 1 2-2Z" />
          <path d="M9 3h6v3H9zM8 11l1.5 1.5L12 10M14 11h2M8 16h8" />
        </svg>
        <svg
          v-else-if="item.section === 'water'"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M12 3c-2.5 3.6-6 7.5-6 11a6 6 0 0 0 12 0c0-3.5-3.5-7.4-6-11Z"
          />
          <path d="M9 14a3 3 0 0 0 3 3" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 17h2" />
        </svg>
        <span class="nav-native-caption">{{ item.label }}</span>
      </span>
    </component>
  </nav>
</template>
<style scoped>
.chore-bottom-nav {
  position: fixed;
  z-index: 100;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(100%, 520px);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  background: var(--ui-surface);
  border-top: 1px solid var(--app-tone-he9e9e9, #e9e9e9);
  padding: 6px 16px calc(6px + env(safe-area-inset-bottom));
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.nav-selection {
  position: absolute;
  z-index: -1;
  left: 16px;
  top: 6px;
  width: calc((100% - 32px) / 3);
  height: 54px;
  border-radius: var(--ui-control-radius);
  background: var(--app-tone-he6e6e6, #e6e6e6);
}
.is-moving .nav-selection {
  will-change: transform;
}
:is(a, button[data-section]) {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 5px;
  min-height: 54px;
  color: var(--app-tone-h666, #666);
  border: 0;
  padding: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
  text-decoration: none;
  font-size: 13px;
  border-radius: var(--ui-control-radius);
  transition:
    color 180ms ease,
    transform var(--ui-release-time) var(--ui-ease-out);
}
:is(a, button[data-section]):active,
:is(a, button[data-section]).pressed {
  transform: var(--ui-press-small);
  transition-duration: var(--ui-press-time);
}
:is(a, button[data-section]).active {
  color: var(--ui-ink);
  font-weight: 600;
}
:is(a, button[data-section]).active svg {
  stroke-width: 2.2;
}
@media (prefers-reduced-motion: reduce) {
  :is(a, button[data-section]) {
    transition: none;
  }
  a:active,
  a.pressed {
    transform: none;
  }
}
svg {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>

<style scoped>
.chore-bottom-nav {
  transition: opacity 380ms 220ms;
}
</style>

<style scoped>
.chore-bottom-nav {
  bottom: calc(10px + env(safe-area-inset-bottom));
  width: min(calc(100% - 32px), 480px);
  padding: 7px 8px;
  border: 1px solid var(--app-tone-he5e5e980, #e5e5e980);
  border-radius: 38px;
  background: var(--glass-surface);
  -webkit-backdrop-filter: blur(8px) saturate(var(--glass-saturation));
  backdrop-filter: blur(8px) saturate(var(--glass-saturation));
  box-shadow: var(--glass-shadow);
  touch-action: none;
  isolation: isolate;
}
.chore-bottom-nav a {
  position: relative;
  z-index: 3;
  min-height: 54px;
  border-radius: 28px;
  transform: none !important;
}
.chore-bottom-nav button {
  appearance: none;
  border: 0;
  padding: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.nav-native-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  min-height: 54px;
  scale: 1;
  transition: scale var(--ui-release-time) var(--ui-ease-overshoot);
}
.chore-bottom-nav:not(.has-optical-glass) a.pressed .nav-native-content {
  scale: 1.08;
}
.chore-bottom-nav .nav-selection {
  left: 8px;
  top: 7px;
  width: calc((100% - 16px) / 3);
  height: 54px;
  z-index: 1;
  border-radius: 29px;
  background: var(--glass-lens-surface);
  background: color-mix(in srgb, var(--glass-lens-surface) 70%, transparent);
  border: 1px solid var(--glass-border);
  -webkit-backdrop-filter: blur(8px) saturate(125%);
  backdrop-filter: blur(8px) saturate(125%);
  box-shadow: var(--glass-lens-shadow);
}
.nav-selection::after {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1px;
  background: var(--glass-rim);
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
.glass-pressed .nav-selection {
  border-radius: 24px;
  filter: none;
}
@media (prefers-reduced-transparency: reduce) {
  .nav-selection::after {
    display: none;
  }
}
@media (prefers-reduced-transparency: reduce) {
  .chore-bottom-nav {
    background: var(--app-tone-hf3f4f6, #f3f4f6);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  .chore-bottom-nav .nav-selection {
    background: var(--app-tone-hfff, #fff);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
@supports not (
  (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))
) {
  .chore-bottom-nav {
    background: var(--app-tone-hf3f4f6, #f3f4f6);
  }
  .chore-bottom-nav .nav-selection {
    background: var(--app-tone-hfff, #fff);
  }
}
</style>

<style scoped>
.chore-bottom-nav .nav-selection {
  scale: 1;
  transition:
    scale 480ms cubic-bezier(0.2, 1.6, 0.35, 1),
    border-radius 420ms ease;
}
.chore-bottom-nav.is-moving .nav-selection {
  scale: 1.07 0.94;
}
.chore-bottom-nav.is-dragging .nav-selection {
  scale: 1.2 1.38;
}
.chore-bottom-nav.glass-pressed .nav-selection {
  scale: 1.2 1.42;
}
@media (prefers-reduced-motion: reduce) {
  .chore-bottom-nav .nav-selection {
    scale: 1 !important;
    transition: none;
  }
  .nav-native-content {
    scale: 1 !important;
    transition: none;
  }
}
</style>
