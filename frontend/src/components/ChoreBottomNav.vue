<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { motion } from "motion-v";
import { useSelectionMotion } from "../interaction/motion";
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
});
onUnmounted(() => {
  gesture = null;
});
let gesture: { id: number; x: number; y: number; nav: HTMLElement } | null =
  null;
let suppressClickUntil = 0;
let navigationRequest = 0;
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
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, nav };
  pressedIndex.value = position(event.clientX, nav).index;
  suppressClickUntil = 0;
  nav.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  if (
    !dragging.value &&
    Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 8
  )
    return;
  dragging.value = true;
  pressedIndex.value = -1;
  selection.track(position(event.clientX, gesture.nav).progress);
}
function finish(event: PointerEvent, cancelled = false) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const nav = gesture.nav;
  gesture = null;
  pressedIndex.value = -1;
  dragging.value = false;
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
  selection.move(index);
  const item = items[index]!;
  const request = ++navigationRequest;
  void router
    .push({
      path: item.path,
    })
    .finally(() => {
      if (request === navigationRequest && !gesture)
        selection.move(currentIndex.value);
    });
}
function click(event: MouseEvent) {
  if (event.detail > 0 && performance.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
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
  background: #fff;
  border-top: 1px solid #e9e9e9;
  padding: 6px 16px calc(6px + env(safe-area-inset-bottom));
  touch-action: none;
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
  border-radius: 14px;
  background: #f3f3f3;
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
  border-radius: 14px;
  transition:
    color 180ms ease,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
a:active,
a.pressed {
  transform: scale(0.96);
}
a.active {
  color: #111;
  font-weight: 600;
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
