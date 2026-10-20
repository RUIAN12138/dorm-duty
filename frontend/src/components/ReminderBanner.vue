<script setup lang="ts">
import { companionEnabled } from "../interaction/companion";
import DormCompanion from "./DormCompanion.vue";
import { onMounted, onBeforeUnmount, ref, computed } from "vue";
import type { ChoreReminder } from "../api/chores";
import { createVelocityTracker } from "../interaction/gestures";
import { motionAllowed } from "../interaction/motion";
import {
  bannerEnterFrames,
  bannerLeaveFrames,
  bannerFlightTiming,
} from "../interaction/bannerFlight";
import { pressStep } from "../interaction/pressDynamics";
import { bannerSwipe, dismissBanner } from "../interaction/bannerMotion";
const props = defineProps<{ note: ChoreReminder | null }>();
const emit = defineEmits<{
  dismiss: [];
  open: [];
  settled: [id?: number];
  presented: [id: number];
}>();
const offsetX = ref(0);
let exitDirection = 0,
  returnFrame = 0,
  returnLast = 0,
  returnVX = 0,
  returnVY = 0;
const offset = ref(0),
  dragging = ref(false),
  hold = ref(1),
  holdActive = ref(false);
let holdFrame = 0,
  holdLast = 0,
  holdVelocity = 0,
  holdTarget = 1;
function holdTick(now: number) {
  holdFrame = 0;
  const next = pressStep(
    hold.value,
    holdVelocity,
    holdTarget,
    (now - holdLast) / 1000,
  );
  holdLast = now;
  hold.value = next.position;
  holdVelocity = next.velocity;
  if (
    Math.abs(hold.value - holdTarget) > 0.0002 ||
    Math.abs(holdVelocity) > 0.003
  )
    holdFrame = requestAnimationFrame(holdTick);
  else {
    hold.value = holdTarget;
    holdVelocity = 0;
    if (holdTarget === 1) holdActive.value = false;
  }
}
function holdTo(target: number) {
  holdTarget = target;
  if (!motionAllowed()) {
    hold.value = 1;
    return;
  }
  if (target < 1) {
    holdActive.value = true;
    hold.value = Math.min(hold.value, 0.982);
    holdVelocity = Math.min(holdVelocity, -0.35);
  }
  if (!holdFrame) {
    holdLast = performance.now();
    holdFrame = requestAnimationFrame(holdTick);
  }
}
function stopHold() {
  cancelAnimationFrame(holdFrame);
  holdFrame = 0;
  holdVelocity = 0;
}

const rubber = (value: number, limit = 90) =>
  value / (1 + Math.abs(value) / limit);
function stopReturn() {
  cancelAnimationFrame(returnFrame);
  returnFrame = 0;
}
function returnTick(now: number) {
  returnFrame = 0;
  const dt = Math.min(0.032, (now - returnLast) / 1000);
  returnLast = now;
  let remaining = dt;
  while (remaining > 0) {
    const h = Math.min(remaining, 1 / 240);
    returnVX += (-offsetX.value * 280 - returnVX * 25) * h;
    returnVY += (-offset.value * 280 - returnVY * 25) * h;
    offsetX.value += returnVX * h;
    offset.value += returnVY * h;
    remaining -= h;
  }
  if (
    Math.hypot(offsetX.value, offset.value) > 0.02 ||
    Math.hypot(returnVX, returnVY) > 0.1
  )
    returnFrame = requestAnimationFrame(returnTick);
  else {
    offsetX.value = 0;
    offset.value = 0;
    returnVX = returnVY = 0;
  }
}
function returnHome() {
  stopReturn();
  if (!motionAllowed()) {
    offset.value = offsetX.value = 0;
    return;
  }
  returnLast = performance.now();
  returnVX = returnVY = 0;
  returnFrame = requestAnimationFrame(returnTick);
}
const swipePose = computed(() => {
  const x = rubber(offsetX.value, 160),
    y = offset.value < 0 ? offset.value * 0.42 : rubber(offset.value, 75);
  const pose = bannerSwipe(Math.max(0, -offset.value));
  const stretchX = Math.min(0.16, Math.abs(x) * 0.002),
    stretchY = Math.min(0.22, Math.abs(y) * 0.004);
  return {
    transform: `translate3d(${x}px,${y}px,0) rotate(${x * 0.035}deg) scale(${pose.scale * (1 + stretchX - stretchY * 0.4) * (1 - (1 - hold.value) * 0.45)},${pose.scale * (1 + stretchY - stretchX * 0.4) * hold.value})`,
    opacity: pose.opacity,
  };
});
const flights = new Map<
  HTMLElement,
  { animation: Animation; done: () => void }
>();
function stopMotion(element: Element) {
  const el = element as HTMLElement,
    item = flights.get(el);
  if (!item) return;
  flights.delete(el);
  item.animation.cancel();
  item.done();
}
function freezeMotion(element: Element) {
  const el = element as HTMLElement;
  if (!flights.has(el)) return;
  const pose = getComputedStyle(el).transform;
  stopMotion(el);
  el.style.transform = pose;
  el.style.opacity = "1";
}
function animateMotion(
  el: HTMLElement,
  frames: Keyframe[],
  duration: number,
  done: () => void,
  easing = "cubic-bezier(.22,1,.36,1)",
) {
  stopMotion(el);
  if (!motionAllowed()) {
    el.style.transform = "";
    el.style.opacity = "";
    done();
    return;
  }
  const animation = el.animate(frames, { duration, easing, fill: "both" });
  flights.set(el, { animation, done });
  const finish = () => {
    if (flights.get(el)?.animation !== animation) return;
    flights.delete(el);
    el.style.transform = "";
    el.style.opacity = "";
    animation.cancel();
    done();
  };
  animation.finished.then(finish, finish);
}
function beforeEnter(element: Element) {
  cancelGesture();
  const el = element as HTMLElement;
  el.classList.remove("is-leaving");
  el.style.transform = "";
  el.style.opacity = "1";
}
function enter(element: Element, done: () => void) {
  const el = element as HTMLElement;
  animateMotion(
    el,
    bannerEnterFrames(el.offsetHeight),
    bannerFlightTiming.enter,
    () => {
      done();
      const id = Number(el.dataset?.reminderId);
      if (id && el.isConnected && !document.hidden) emit("presented", id);
    },
    "linear",
  );
}
function leave(element: Element, done: () => void) {
  const el = element as HTMLElement;
  const pose = getComputedStyle(el);
  el.classList.add("is-leaving");
  stopHold();
  animateMotion(
    el,
    bannerLeaveFrames(
      el.offsetHeight,
      pose.transform,
      Number(pose.opacity),
      exitDirection,
    ),
    bannerFlightTiming.leave,
    done,
    "linear",
  );
}

let gesture: {
  id: number;
  x: number;
  y: number;
  element: HTMLElement;
  velocityX: ReturnType<typeof createVelocityTracker>;
  velocity: ReturnType<typeof createVelocityTracker>;
} | null = null;
let suppressUntil = 0;
function down(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || gesture) return;
  const element = event.currentTarget as HTMLElement;
  if (element.parentElement?.classList.contains("is-leaving")) return;
  if (element.parentElement) freezeMotion(element.parentElement);
  stopReturn();
  exitDirection = 0;
  gesture = {
    id: event.pointerId,
    x: event.clientX - offsetX.value,
    y: event.clientY - offset.value,
    element,
    velocityX: createVelocityTracker(event.clientX, performance.now()),
    velocity: createVelocityTracker(event.clientY, performance.now()),
  };
  holdTo(0.94);
  element.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const y = event.clientY - gesture.y,
    x = event.clientX - gesture.x;
  gesture.velocity.add(event.clientY, performance.now());
  gesture.velocityX.add(event.clientX, performance.now());
  if (!dragging.value && Math.hypot(x, y) > 3) dragging.value = true;
  if (!dragging.value) return;
  if (event.cancelable) event.preventDefault();
  offset.value = y;
  offsetX.value = x;
}
function finish(event: PointerEvent, cancelled = false) {
  if (!gesture || gesture.id !== event.pointerId) return;
  if (
    event.type === "lostpointercapture" &&
    (event.target !== gesture.element ||
      gesture.element.hasPointerCapture(event.pointerId))
  )
    return;
  const current = gesture;
  const close =
    !cancelled &&
    dragging.value &&
    dismissBanner(-offset.value, current.velocity.read(performance.now()));
  if (dragging.value) suppressUntil = performance.now() + 400;
  gesture = null;
  dragging.value = false;
  if (current.element.hasPointerCapture(event.pointerId))
    current.element.releasePointerCapture(event.pointerId);
  if (close) {
    const vx = current.velocityX.read(performance.now()),
      vy = current.velocity.read(performance.now());
    exitDirection = Math.max(
      -2,
      Math.min(
        2,
        Math.abs(vy) > 0.15
          ? vx / Math.max(0.15, -vy)
          : offsetX.value / Math.max(12, -offset.value),
      ),
    );
    stopHold();
    emit("dismiss");
  } else {
    holdTo(1);
    returnHome();
    const el = current.element.parentElement;
    if (el)
      animateMotion(
        el,
        [
          { transform: getComputedStyle(el).transform, opacity: 1 },
          { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
        ],
        160,
        () => {},
      );
  }
}
function open() {
  if (performance.now() >= suppressUntil) emit("open");
}
function afterLeave(element?: Element) {
  if (!props.note) cancelGesture();
  const id = element?.getAttribute("data-reminder-id");
  emit("settled", id ? Number(id) : undefined);
}
function cancelGesture() {
  stopReturn();
  offsetX.value = 0;
  exitDirection = 0;
  stopHold();
  holdActive.value = false;
  hold.value = 1;
  holdTarget = 1;
  const current = gesture;
  gesture = null;
  dragging.value = false;
  offset.value = 0;
  if (current?.element.hasPointerCapture(current.id))
    current.element.releasePointerCapture(current.id);
}
function inactive() {
  if (!motionAllowed()) {
    cancelGesture();
    for (const el of [...flights.keys()]) {
      stopMotion(el);
      el.style.transform = "";
      el.style.opacity = "";
    }
  } else if (
    props.note &&
    !flights.size &&
    document.querySelector(`[data-reminder-id="${props.note.id}"]`)
  ) {
    emit("presented", props.note.id);
  }
}
const media = matchMedia("(prefers-reduced-motion: reduce)");
onMounted(() => {
  window.addEventListener("blur", cancelGesture);
  window.addEventListener("ui-motion-change", inactive);
  document.addEventListener("visibilitychange", inactive);
  media.addEventListener("change", inactive);
});
onBeforeUnmount(() => {
  cancelGesture();
  for (const el of [...flights.keys()]) stopMotion(el);
  window.removeEventListener("blur", cancelGesture);
  window.removeEventListener("ui-motion-change", inactive);
  document.removeEventListener("visibilitychange", inactive);
  media.removeEventListener("change", inactive);
});
</script>
<template>
  <Teleport to="body">
    <div class="reminder-banner-position">
      <Transition
        :css="false"
        @before-enter="beforeEnter"
        @enter="enter"
        @leave="leave"
        @enter-cancelled="freezeMotion"
        @leave-cancelled="stopMotion"
        @after-leave="afterLeave"
      >
        <section
          v-if="note"
          :key="note.id"
          class="reminder-banner-motion"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="reminder-banner"
          :data-reminder-id="note.id"
          @keydown.esc.stop="emit('dismiss')"
        >
          <div
            class="reminder-banner-card"
            :class="{ 'is-dragging': dragging, 'is-held': holdActive }"
            :style="swipePose"
            @pointerdown="down"
            @pointermove="move"
            @pointerup="finish($event)"
            @pointercancel="finish($event, true)"
            @lostpointercapture="finish($event, true)"
            @click="open"
          >
            <DormCompanion
              v-if="companionEnabled"
              mood="13"
              :interactive="false"
              :size="32"
            />
            <button
              type="button"
              class="reminder-banner-main"
              :aria-label="`${note.sender_name || '室友'}${note.source === 'note' ? '给你留言' : '提醒你'}，${note.task_name || '完成宿舍任务'}，查看消息`"
            >
              <span class="reminder-banner-caption"
                >{{ note.sender_name || "室友"
                }}{{ note.source === "note" ? "给你留言" : "提醒你" }}</span
              >
              <strong>{{
                note.body || note.task_name || "完成宿舍任务"
              }}</strong>
            </button>
          </div>
        </section>
      </Transition>
    </div>
  </Teleport>
</template>
<style scoped>
.reminder-banner-position {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 14px);
  left: 50%;
  width: min(390px, calc(100% - 24px));
  transform: translateX(-50%);
  z-index: 2900;
  pointer-events: none;
}
.reminder-banner-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 10px;
  box-sizing: border-box;
  height: 60px;
  position: relative;
  isolation: isolate;
  /* A stable opaque backing prevents underlying text bleeding through while
     WebKit composites the moving layer. Keep the existing glass rim/flight. */
  background: var(--ui-surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border: 1px solid var(--glass-border);
  border-radius: 32px;
  box-shadow: var(--glass-shadow);
  pointer-events: auto;
  touch-action: none;
  transform-origin: 50% 0;
  transition: none;
  will-change: transform, opacity;
}
.reminder-banner-card::after {
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
.reminder-banner-card.is-dragging,
.reminder-banner-card.is-held {
  transition: none;
}
.reminder-banner-main {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
  text-align: left;
  color: var(--app-tone-h111, #111);
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
}
.reminder-banner-caption {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--app-tone-h666, #666);
}
.reminder-banner-main strong {
  font-size: 14px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reminder-banner-motion {
  transform-origin: 50% 0;
  isolation: isolate;
}
.reminder-banner-motion.is-leaving .reminder-banner-card {
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .reminder-banner-card {
    transition: none;
    animation: none;
  }
}
</style>

<style scoped>
@supports not (
  (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))
) {
  .reminder-banner-card {
    background: var(--app-tone-hfffffff5, #fffffff5);
  }
}
@media (prefers-reduced-transparency: reduce) {
  .reminder-banner-card {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: var(--app-tone-hfff, #fff);
    border-color: var(--app-tone-heee, #eee);
  }
  .reminder-banner-card::after {
    display: none;
  }
}
</style>
