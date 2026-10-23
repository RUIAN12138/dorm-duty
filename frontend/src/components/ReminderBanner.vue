<script setup lang="ts">
import { companionEnabled } from "../interaction/companion";
import DormCompanion from "./DormCompanion.vue";
import {
  onMounted,
  onBeforeUnmount,
  ref,
  computed,
  nextTick,
  watch,
} from "vue";
import type { ChoreReminder } from "../api/chores";
import { createVelocityTracker } from "../interaction/gestures";
import { motionAllowed } from "../interaction/motion";
import {
  bannerEnterFrames,
  bannerLeaveFrames,
  bannerFlightTiming,
} from "../interaction/bannerFlight";
import {
  createBannerReplyLayout,
  lockBackgroundScroll,
} from "../interaction/bannerReplyLayout";
import { pressStep } from "../interaction/pressDynamics";
import { bannerSwipe, dismissBanner } from "../interaction/bannerMotion";
import LiquidGlassSurface from "./LiquidGlassSurface.vue";

type ReplyPhase = "idle" | "editing" | "sending" | "failed";
const REPLY_LIMIT = 120;
const LONG_HOLD_MS = 400;

const props = defineProps<{
  note: ChoreReminder | null;
  replyState?: ReplyPhase;
  replyDraft?: string;
  replyError?: string;
  replySender?: string;
}>();
const emit = defineEmits<{
  dismiss: [id: number, reason: "swipe" | "escape"];
  expire: [id: number];
  reply: [id: number];
  open: [id: number];
  settled: [id?: number];
  presented: [id: number];
  "update:replyDraft": [text: string];
  send: [id: number];
  cancel: [id: number];
}>();

const phase = computed<ReplyPhase>(() => props.replyState || "idle");
const replying = computed(() => phase.value !== "idle");
const sending = computed(() => phase.value === "sending");
const draft = computed(() => props.replyDraft || "");
const replyLength = computed(() => Array.from(draft.value.trim()).length);
const canSend = computed(
  () =>
    !sending.value &&
    replyLength.value >= 1 &&
    replyLength.value <= REPLY_LIMIT,
);
const positionEl = ref<HTMLElement>();
const cardEl = ref<HTMLElement>();
const editor = ref<HTMLTextAreaElement>();
const composing = ref(false);
let returnFocus: HTMLElement | null = null;
let layout: ReturnType<typeof createBannerReplyLayout> | null = null;
let releaseLock: (() => void) | null = null;

let autoTimer: ReturnType<typeof setTimeout> | undefined;
let longTimer: ReturnType<typeof setTimeout> | undefined;
function clearTimers() {
  clearTimeout(autoTimer);
  clearTimeout(longTimer);
}
function scheduleExpiry() {
  clearTimeout(autoTimer);
  const id = props.note?.id;
  // Editing, sending and failed drafts keep the note; only an idle banner
  // returns to the original 6.5s presentation timeout.
  if (id && !document.hidden && !replying.value)
    autoTimer = setTimeout(() => {
      if (
        props.note?.id === id &&
        !gesture &&
        !document.hidden &&
        !replying.value
      )
        emit("expire", id);
    }, 6500);
}
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
      if (id && el.isConnected && !document.hidden) {
        emit("presented", id);
        scheduleExpiry();
      }
    },
    "linear",
  );
}
function leave(element: Element, done: () => void) {
  clearTimers();
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
  noteId: number | undefined;
  x: number;
  y: number;
  element: HTMLElement;
  velocityX: ReturnType<typeof createVelocityTracker>;
  velocity: ReturnType<typeof createVelocityTracker>;
  longPress: boolean;
} | null = null;
let suppressUntil = 0;
function down(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || gesture) return;
  const target = event.target as Element | null;
  // The editor owns its own pointer gestures (caret, selection, button taps).
  if (target?.closest(".banner-reply-panel")) return;
  // Delivery is already in flight: the card stays put until confirmation.
  if (sending.value) return;
  const element = event.currentTarget as HTMLElement;
  if (element.parentElement?.classList.contains("is-leaving")) return;
  if (element.parentElement) freezeMotion(element.parentElement);
  stopReturn();
  exitDirection = 0;
  gesture = {
    id: event.pointerId,
    noteId: props.note?.id,
    x: event.clientX - offsetX.value,
    y: event.clientY - offset.value,
    element,
    velocityX: createVelocityTracker(event.clientX, performance.now()),
    velocity: createVelocityTracker(event.clientY, performance.now()),
    longPress: false,
  };
  clearTimers();
  const id = props.note?.id;
  if (id && !replying.value)
    longTimer = setTimeout(() => {
      // Keep the gesture alive so the real pointerup still arrives and can
      // focus the mounted editor without a synthetic click.
      if (!gesture || dragging.value || props.note?.id !== id || sending.value)
        return;
      gesture.longPress = true;
      suppressUntil = performance.now() + 800;
      emit("reply", id);
      void nextTick(() => {
        if (replying.value) focusEditor();
      });
    }, LONG_HOLD_MS);
  holdTo(0.94);
  element.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const y = event.clientY - gesture.y,
    x = event.clientX - gesture.x;
  gesture.velocity.add(event.clientY, performance.now());
  gesture.velocityX.add(event.clientX, performance.now());
  if (!dragging.value && Math.hypot(x, y) > 3) {
    dragging.value = true;
    clearTimeout(longTimer);
  }
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
  clearTimeout(longTimer);
  const current = gesture;
  if (current.noteId !== props.note?.id) {
    cancelGesture();
    return;
  }
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
    const id = current.noteId;
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
    if (id) emit("dismiss", id, "swipe");
  } else {
    holdTo(1);
    returnHome();
    scheduleExpiry();
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
    // iOS ignores focus requested while the finger is still down. The real
    // pointerup is the gesture the system accepts, so focus synchronously and
    // repeat after Vue's update as a fallback.
    if (current.longPress && !cancelled && replying.value) {
      focusEditor();
      void nextTick(focusEditor);
    }
  }
}
function open(event?: MouseEvent) {
  if (replying.value || performance.now() < suppressUntil) {
    // The held gesture's synthetic click must not reach the detail entry or
    // steal focus back from the freshly mounted editor.
    event?.preventDefault();
    return;
  }
  const id = props.note?.id;
  if (id) emit("open", id);
}
function afterLeave(element?: Element) {
  if (!props.note) cancelGesture();
  const id = element?.getAttribute("data-reminder-id");
  emit("settled", id ? Number(id) : undefined);
}
function cancelGesture() {
  clearTimers();
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
    layout?.sync();
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
    scheduleExpiry();
  }
}

function focusEditor() {
  const el = editor.value;
  if (!el || !replying.value) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  const end = el.value.length;
  try {
    el.setSelectionRange(end, end);
  } catch {
    /* Selection is optional. */
  }
}
function restoreFocus() {
  const fallback = cardEl.value?.querySelector<HTMLElement>(
    ".reminder-banner-main",
  );
  const target =
    returnFocus && returnFocus.isConnected && returnFocus !== document.body
      ? returnFocus
      : fallback;
  returnFocus = null;
  if (!target || !target.isConnected) return;
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}
function sectionKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.stopPropagation();
    escape();
    return;
  }
  if (event.key === "Enter" && event.shiftKey) {
    const target = event.target as Element | null;
    if (target?.closest(".banner-reply-panel") || replying.value) return;
    event.preventDefault();
    shortcutReply();
    return;
  }
  if (event.key === "Tab") trapFocus(event);
}
function trapFocus(event: KeyboardEvent) {
  if (!replying.value) return;
  const panel = cardEl.value?.querySelector(".banner-reply-panel");
  if (!panel) return;
  const items = [
    ...panel.querySelectorAll<HTMLElement>("textarea, button:not([disabled])"),
  ].filter((item) => item.offsetParent !== null);
  if (!items.length) return;
  const first = items[0]!,
    last = items[items.length - 1]!,
    current = document.activeElement;
  if (event.shiftKey && (current === first || !panel.contains(current))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && current === last) {
    event.preventDefault();
    first.focus();
  }
}
function escape() {
  const id = props.note?.id;
  if (!id) return;
  if (replying.value) {
    if (!sending.value) emit("cancel", id);
    return;
  }
  emit("dismiss", id, "escape");
}
function shortcutReply() {
  const id = props.note?.id;
  if (id && !replying.value) emit("reply", id);
}
function input(event: Event) {
  emit("update:replyDraft", (event.target as HTMLTextAreaElement).value);
}
function editorKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey) return;
  // Leave the Enter key to the input method while it is composing.
  if (event.isComposing || composing.value || event.keyCode === 229) return;
  event.preventDefault();
  submit();
}
function submit() {
  const id = props.note?.id;
  if (!id || !canSend.value) return;
  emit("send", id);
}
function cancelReply() {
  const id = props.note?.id;
  if (!id || sending.value) return;
  emit("cancel", id);
}
function backdropPointer() {
  if (sending.value) return;
  cancelReply();
}

watch(replying, async (active) => {
  if (active) {
    clearTimeout(autoTimer);
    returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    releaseLock?.();
    releaseLock = lockBackgroundScroll();
    await nextTick();
    layout?.sync();
    focusEditor();
  } else {
    releaseLock?.();
    releaseLock = null;
    // The same position owner reverses to the parked position while the
    // persistent reply slot collapses; do not reset the wrapper mid-motion.
    layout?.sync();
    await nextTick();
    restoreFocus();
    scheduleExpiry();
  }
});

const media = matchMedia("(prefers-reduced-motion: reduce)");
onMounted(() => {
  layout = createBannerReplyLayout({
    position: () => positionEl.value || null,
    card: () => cardEl.value || null,
    editing: () => replying.value,
    focused: () => replying.value && document.activeElement === editor.value,
  });
  layout.start();
  window.addEventListener("blur", cancelGesture);
  window.addEventListener("focus", inactive);
  window.addEventListener("ui-motion-change", inactive);
  document.addEventListener("visibilitychange", inactive);
  media.addEventListener("change", inactive);
});
onBeforeUnmount(() => {
  cancelGesture();
  layout?.stop();
  layout = null;
  releaseLock?.();
  releaseLock = null;
  for (const el of [...flights.keys()]) stopMotion(el);
  window.removeEventListener("blur", cancelGesture);
  window.removeEventListener("focus", inactive);
  window.removeEventListener("ui-motion-change", inactive);
  document.removeEventListener("visibilitychange", inactive);
  media.removeEventListener("change", inactive);
});
</script>
<template>
  <Teleport to="body">
    <Transition name="banner-backdrop">
      <div
        v-if="note && replying"
        class="banner-reply-backdrop"
        aria-hidden="true"
        @pointerdown.prevent="backdropPointer"
        @wheel.prevent
        @touchmove.prevent
      />
    </Transition>
    <div
      ref="positionEl"
      class="reminder-banner-position"
      :class="{ 'is-reply': replying }"
    >
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
          :role="replying ? 'dialog' : 'status'"
          :aria-modal="replying ? 'true' : undefined"
          :aria-live="replying ? undefined : 'polite'"
          :aria-label="
            replying
              ? `回复${replySender || note.sender_name || '室友'}`
              : undefined
          "
          aria-atomic="true"
          data-testid="reminder-banner"
          :data-reminder-id="note.id"
          @keydown="sectionKeydown"
        >
          <div
            ref="cardEl"
            class="reminder-banner-card"
            :class="{
              'is-dragging': dragging,
              'is-held': holdActive,
              'is-reply': replying,
            }"
            :style="swipePose"
            @pointerdown="down"
            @pointermove="move"
            @pointerup="finish($event)"
            @pointercancel="finish($event, true)"
            @lostpointercapture="finish($event, true)"
            @click="open"
            @contextmenu.prevent
          >
            <LiquidGlassSurface
              class="banner-optics"
              :track="false"
              :shift-x="offsetX"
              :shift-y="offset"
              :active="dragging || holdActive"
            />
            <DormCompanion
              v-if="companionEnabled"
              mood="13"
              :interactive="false"
              :size="32"
            />
            <button
              type="button"
              class="reminder-banner-main"
              :tabindex="replying ? -1 : undefined"
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
            <div
              class="banner-reply-slot"
              :class="{ 'is-open': replying }"
              :inert="!replying"
              :aria-hidden="replying ? undefined : 'true'"
            >
              <div class="banner-reply-inner">
                <form
                  class="banner-reply-panel"
                  @submit.prevent="submit"
                  @click.stop
                >
                  <label
                    class="banner-reply-hint"
                    :for="`banner-reply-${note.id}`"
                    >回复{{ replySender || note.sender_name || "室友" }}</label
                  >
                  <textarea
                    :id="`banner-reply-${note.id}`"
                    ref="editor"
                    class="banner-reply-input"
                    rows="1"
                    enterkeyhint="send"
                    :value="draft"
                    :disabled="sending"
                    placeholder="写一句回复…"
                    @input="input"
                    @keydown="editorKeydown"
                    @compositionstart="composing = true"
                    @compositionend="composing = false"
                  />
                  <div class="banner-reply-meta">
                    <span
                      class="banner-reply-count"
                      :class="{ 'is-over': replyLength > REPLY_LIMIT }"
                      >{{ replyLength }}/{{ REPLY_LIMIT }}</span
                    >
                    <span
                      v-if="sending"
                      class="banner-reply-status"
                      role="status"
                      >发送中…</span
                    >
                    <span
                      v-else-if="replyError"
                      class="banner-reply-status is-error"
                      role="alert"
                      >{{ replyError }}</span
                    >
                  </div>
                  <div class="banner-reply-actions">
                    <button
                      type="button"
                      class="banner-reply-cancel"
                      :disabled="sending"
                      @click="cancelReply"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      class="banner-reply-send"
                      :disabled="!canSend"
                    >
                      {{
                        sending
                          ? "发送中"
                          : phase === "failed"
                            ? "重试"
                            : "发送"
                      }}
                    </button>
                  </div>
                </form>
              </div>
            </div>
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
  transition: width 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.reminder-banner-position.is-reply {
  width: min(396px, calc(100% - 18px));
}
.banner-reply-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2899;
  background: #2525254d;
  backdrop-filter: blur(6px) saturate(112%);
  -webkit-backdrop-filter: blur(6px) saturate(112%);
  touch-action: none;
}
.banner-backdrop-enter-active,
.banner-backdrop-leave-active {
  transition: opacity 220ms ease;
}
.banner-backdrop-enter-from,
.banner-backdrop-leave-to {
  opacity: 0;
}
.reminder-banner-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: 42px auto;
  align-items: center;
  column-gap: 10px;
  padding: 8px 14px 8px 10px;
  box-sizing: border-box;
  min-height: 60px;
  position: relative;
  isolation: isolate;
  /* Local clear glass: a low-alpha backing plus a fixed moderate blur keeps
     underlying text from competing while the layer flies and swipes. The
     existing glass rim and flight stay untouched. */
  background: color-mix(in srgb, var(--ui-surface) 62%, transparent);
  backdrop-filter: blur(7px) saturate(118%);
  -webkit-backdrop-filter: blur(7px) saturate(118%);
  border: 1px solid var(--glass-border);
  border-radius: 32px;
  box-shadow: var(--glass-shadow);
  pointer-events: auto;
  touch-action: none;
  transform-origin: 50% 0;
  transition: border-radius 280ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform, opacity;
}
.reminder-banner-card.is-reply {
  border-radius: 24px;
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

.banner-reply-slot {
  grid-column: 1 / -1;
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  visibility: hidden;
  transition:
    grid-template-rows 280ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease,
    visibility 0s linear 280ms;
}
.banner-reply-slot.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
  visibility: visible;
  transition:
    grid-template-rows 280ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease,
    visibility 0s;
}
.banner-reply-inner {
  overflow: hidden;
  min-height: 0;
}
.banner-reply-panel {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  max-height: max(100px, calc(var(--banner-visible-height, 100dvh) - 84px));
  overflow-y: auto;
  touch-action: pan-y;
  overscroll-behavior: contain;
  padding-top: 10px;
  border-top: 1px solid var(--glass-border);
  opacity: 0;
  transform: translateY(-4px);
  transition:
    opacity 200ms ease,
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.banner-reply-slot.is-open .banner-reply-panel {
  opacity: 1;
  transform: none;
}
.banner-reply-hint {
  font-size: 11px;
  color: var(--app-tone-h666, #666);
  line-height: 1.2;
}
.banner-reply-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 44px;
  max-height: 120px;
  resize: none;
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  padding: 10px 12px;
  font: inherit;
  font-size: 16px;
  line-height: 1.45;
  color: var(--app-tone-h111, #111);
  background: color-mix(in srgb, var(--ui-surface) 82%, transparent);
  field-sizing: content;
  overflow: auto;
}
.banner-reply-input:focus-visible {
  /* An inward ring remains complete inside the animated clipping slot. */
  outline: 2px solid var(--app-tone-h7c7c7c, #7c7c7c);
  outline-offset: -2px;
}
.banner-reply-input::placeholder {
  color: var(--app-tone-h888, #888);
}
.banner-reply-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 16px;
  font-size: 11px;
  color: var(--app-tone-h777, #777);
}
.banner-reply-count.is-over,
.banner-reply-status.is-error {
  color: var(--app-tone-h111, #111);
}
.banner-reply-status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.banner-reply-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.banner-reply-actions button {
  min-height: 40px;
  border-radius: 20px;
  padding: 8px 16px;
  font: inherit;
  font-size: 13px;
  transition:
    opacity 160ms ease,
    transform 160ms ease,
    background 160ms ease;
}
.banner-reply-actions button:active {
  transform: scale(0.97);
}
.banner-reply-cancel {
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--app-tone-h555, #555);
}
.banner-reply-send {
  border: 0;
  background: var(--app-tone-h111, #111);
  color: var(--app-tone-hfff, #fff);
}
.banner-reply-actions button:disabled {
  opacity: 0.45;
}

.reminder-banner-motion {
  transform-origin: 50% 0;
  isolation: isolate;
}
.reminder-banner-motion.is-leaving .reminder-banner-card {
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .reminder-banner-position,
  .reminder-banner-card,
  .banner-reply-slot,
  .banner-reply-panel,
  .banner-backdrop-enter-active,
  .banner-backdrop-leave-active {
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
  .reminder-banner-card::after,
  .banner-optics {
    display: none;
  }
  .banner-reply-backdrop {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: #252525d9;
  }
  .banner-reply-input {
    background: var(--app-tone-hfff, #fff);
  }
}
</style>
