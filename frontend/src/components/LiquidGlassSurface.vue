<script setup lang="ts">
/**
 * Purely decorative optical layer for a local glass surface.
 *
 * It is absolutely positioned behind the host's foreground, never receives
 * pointer events and never owns transform or layout. Highlight updates are
 * coalesced into one rAF per frame while a press is active, using a rect
 * cached on pointerdown. Reduced motion keeps a static highlight; reduced
 * transparency hides the layer entirely; hidden pages cancel the frame.
 */
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  applyGlassGlint,
  glassCapabilities,
  pointerGlint,
  resetGlassGlint,
  swipeGlint,
} from "../interaction/glassOptics";

const props = withDefaults(
  defineProps<{
    active?: boolean;
    /** Follow presses inside the host with a local highlight. */
    track?: boolean;
    /** Existing swipe offsets; used only for gradient position. */
    shiftX?: number;
    shiftY?: number;
  }>(),
  { active: false, track: true, shiftX: 0, shiftY: 0 },
);

const root = ref<HTMLElement>();
const simplified = ref(false);

let host: HTMLElement | null = null;
let frame = 0;
let rect: { left: number; top: number; width: number; height: number } | null =
  null;
let pointerId: number | null = null;
let pendingX = 0;
let pendingY = 0;
let listening = false;
let canTrack = false;
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const transparency = matchMedia("(prefers-reduced-transparency: reduce)");

function applyShift() {
  if (!root.value) return;
  if (simplified.value) return resetGlassGlint(root.value);
  applyGlassGlint(root.value, swipeGlint(props.shiftX, props.shiftY));
}
function paint() {
  frame = 0;
  if (!root.value || simplified.value || document.hidden) return;
  if (pointerId !== null && rect)
    applyGlassGlint(root.value, pointerGlint(pendingX, pendingY, rect));
  else if (!props.track) applyShift();
}
function queue() {
  if (!frame && !simplified.value && !document.hidden)
    frame = requestAnimationFrame(paint);
}
function reset() {
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  pointerId = null;
  rect = null;
  if (!root.value) return;
  if (props.track) resetGlassGlint(root.value);
  else applyShift();
}
function down(event: PointerEvent) {
  if (!canTrack || !event.isPrimary || pointerId !== null || !host) return;
  pointerId = event.pointerId;
  // Measure once per press; pointermove never reads layout.
  rect = host.getBoundingClientRect();
  pendingX = event.clientX;
  pendingY = event.clientY;
  queue();
}
function move(event: PointerEvent) {
  if (pointerId === null || event.pointerId !== pointerId) return;
  pendingX = event.clientX;
  pendingY = event.clientY;
  queue();
}
function up(event: PointerEvent) {
  if (event.pointerId === pointerId) reset();
}
function cancel() {
  reset();
}
function hidden() {
  if (document.hidden) reset();
}
function detach() {
  if (!listening || !host) return;
  host.removeEventListener("pointerdown", down);
  host.removeEventListener("pointermove", move);
  window.removeEventListener("pointerup", up);
  window.removeEventListener("pointercancel", cancel);
  window.removeEventListener("blur", cancel);
  listening = false;
}
function attach() {
  if (listening || !host) return;
  // Passive listeners only; the host keeps full ownership of its gesture.
  host.addEventListener("pointerdown", down, { passive: true });
  host.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerup", up, { passive: true });
  window.addEventListener("pointercancel", cancel, { passive: true });
  window.addEventListener("blur", cancel);
  listening = true;
}
function syncCapabilities() {
  const capabilities = glassCapabilities();
  simplified.value =
    capabilities.reducedMotion || capabilities.reducedTransparency;
  canTrack =
    props.track &&
    capabilities.pointer &&
    !capabilities.reducedMotion &&
    !capabilities.reducedTransparency;
  if (canTrack) attach();
  else {
    reset();
    detach();
  }
}
watch(
  () => [props.shiftX, props.shiftY],
  () => {
    if (!props.track) queue();
  },
  { flush: "post" },
);
onMounted(() => {
  host = root.value?.parentElement ?? null;
  syncCapabilities();
  document.addEventListener("visibilitychange", hidden);
  motion.addEventListener("change", syncCapabilities);
  transparency.addEventListener("change", syncCapabilities);
});
onBeforeUnmount(() => {
  detach();
  reset();
  document.removeEventListener("visibilitychange", hidden);
  motion.removeEventListener("change", syncCapabilities);
  transparency.removeEventListener("change", syncCapabilities);
});
</script>
<template>
  <div
    ref="root"
    class="liquid-glass-surface"
    :class="{ 'is-active': active && !simplified }"
    aria-hidden="true"
  >
    <span class="liquid-glass-sheen" />
    <span class="liquid-glass-glint" />
    <span class="liquid-glass-edge" />
  </div>
</template>
<style scoped>
.liquid-glass-surface {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
  contain: paint;
  --glass-glint-x: 50%;
  --glass-glint-y: 22%;
  --glass-glint-strength: 0.3;
}
.liquid-glass-sheen,
.liquid-glass-glint,
.liquid-glass-edge {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}
.liquid-glass-sheen {
  background: linear-gradient(
    148deg,
    #ffffff30 0%,
    #ffffff0a 26%,
    transparent 48%,
    #ffffff0f 74%,
    transparent 92%
  );
  opacity: 0.6;
}
.liquid-glass-glint {
  background: radial-gradient(
    120% 150% at 50% 22%,
    #ffffff6b 0%,
    #ffffff1f 22%,
    transparent 58%
  );
  /* Keep the gradient raster stable. Moving its local compositor layer avoids
     repainting a backdrop-filter surface for every pointer sample. */
  transform: translate3d(
    calc((var(--glass-glint-x) - 50%) * 0.18),
    calc((var(--glass-glint-y) - 22%) * 0.18),
    0
  );
  opacity: var(--glass-glint-strength);
  transition:
    transform 180ms var(--ui-ease-out, ease),
    opacity 180ms var(--ui-ease-out, ease);
}
.liquid-glass-surface.is-active .liquid-glass-glint {
  opacity: calc(var(--glass-glint-strength) + 0.16);
  transition-property: opacity;
}
.liquid-glass-edge {
  box-shadow:
    inset 0 1px 0 #ffffff8c,
    inset 1px 0 0 #ffffff33,
    inset -1px 0 0 #ffffff24,
    inset 0 -1px 0 #5b697e2e;
}
:global(:root[data-theme="dark"]) .liquid-glass-edge {
  box-shadow:
    inset 0 1px 0 #ffffff40,
    inset 1px 0 0 #ffffff18,
    inset -1px 0 0 #ffffff12,
    inset 0 -1px 0 #00000038;
}
@media (prefers-reduced-motion: reduce) {
  .liquid-glass-glint {
    transition: none;
  }
}
@media (prefers-reduced-transparency: reduce) {
  .liquid-glass-surface {
    display: none;
  }
}
</style>
