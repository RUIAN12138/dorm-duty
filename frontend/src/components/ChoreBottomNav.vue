<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import { useRouter } from "vue-router";
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
}>();
const items = [
  { section: "duty", path: "/", label: "值日" },
  { section: "water", path: "/water", label: "抬水" },
  { section: "calendar", path: "/calendar", label: "日历" },
] as const;
const dragging = ref(false);
const currentIndex = computed(() =>
  items.findIndex((item) => item.section === props.section),
);
const pressedIndex = ref(-1);
const selection = useSelectionMotion(currentIndex.value, () => items.length);
watch(currentIndex, (next) => {
  if (!dragging.value) selection.move(next);
  requestedIndex = next;
});
onUnmounted(() => {
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
} | null = null;
let suppressClickUntil = 0;
let navigationRequest = 0;
let requestedIndex = currentIndex.value;
function navigate(index: number, replace = false) {
  if (
    requestedIndex === index &&
    router.currentRoute.value.path === items[index]!.path
  )
    return;
  requestedIndex = index;
  const request = ++navigationRequest;
  // A scrub is one navigation in history, even if it passes several pages.
  void router[replace ? "replace" : "push"]({
    path: items[index]!.path,
  }).finally(() => {
    if (request === navigationRequest && !gesture)
      selection.move(currentIndex.value);
  });
}
function position(x: number, nav: HTMLElement) {
  const rect = nav.getBoundingClientRect();
  const width = Math.max(1, rect.width - 32);
  const fraction = ((x - rect.left - 16) / width) * items.length;
  return {
    index: Math.max(0, Math.min(items.length - 1, Math.floor(fraction))),
    progress: Math.max(0, Math.min(items.length - 1, fraction - 0.5)),
  };
}
function down(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || gesture) return;
  if (!(event.target instanceof Element) || !event.target.closest("a")) return;
  const nav = event.currentTarget as HTMLElement;
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    nav,
    navigated: false,
  };
  requestedIndex = currentIndex.value;
  pressedIndex.value = position(event.clientX, nav).index;
  suppressClickUntil = 0;
  nav.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
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
  gesture = null;
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
  selection.move(index);
  navigate(index);
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
    event.target.closest("a")
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
    aria-label="宿舍导航"
    data-testid="chore-bottom-nav"
    :class="{ 'is-dragging': dragging, 'is-moving': selection.moving.value }"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="finish($event)"
    @pointercancel="finish($event, true)"
    @lostpointercapture="finish($event, true)"
    @click.capture="click"
    @dragstart.prevent
  >
    <motion.span
      class="nav-selection"
      aria-hidden="true"
      :style="{ transform: selection.transform }"
    />
    <router-link
      v-for="(item, index) in items"
      :key="item.section"
      :to="{ path: item.path }"
      :class="{
        active: section === item.section,
        pressed: pressedIndex === index,
      }"
      :aria-current="section === item.section ? 'page' : undefined"
      :data-testid="`nav-${item.section}`"
    >
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
      <span>{{ item.label }}</span>
    </router-link>
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
  border-top: 1px solid #e9e9e9;
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
  background: #e6e6e6;
}
.is-moving .nav-selection {
  will-change: transform;
}
a {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 5px;
  min-height: 54px;
  color: #666;
  text-decoration: none;
  font-size: 13px;
  border-radius: var(--ui-control-radius);
  transition:
    color 180ms ease,
    transform var(--ui-release-time) var(--ui-ease-out);
}
a:active,
a.pressed {
  transform: var(--ui-press-small);
  transition-duration: var(--ui-press-time);
}
a.active {
  color: var(--ui-ink);
  font-weight: 600;
}
a.active svg {
  stroke-width: 2.2;
}
@media (prefers-reduced-motion: reduce) {
  a {
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
