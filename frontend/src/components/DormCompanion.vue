<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import { motionAllowed } from "../interaction/motion";
import CompanionBubble from "./CompanionBubble.vue";
import {
  COMPANION_TAP_RADIUS,
  createCompanionTapGesture,
  naturalGaze,
} from "../interaction/companionTap";
import type { CompanionScene } from "../interaction/companionSpeech";
import { createCompanionPlay } from "../interaction/companionPlay";
import {
  takeCompanionHandoff,
  finishCompanionHandoff,
  ambientEmotion,
  companionEnabled,
  displayedEmotion,
  emotions,
  type EmotionEngine,
  acquireCompanion,
  releaseCompanion,
} from "../interaction/companion";
const props = withDefaults(
  defineProps<{
    mood?: string;
    interactive?: boolean;
    size?: number;
    automatic?: boolean;
    track?: boolean;
    intent?: "play" | "message" | "chat";
    gazePoint?: { x: number; y: number };
    tips?: boolean;
    muted?: boolean;
    scene?: CompanionScene;
    message?: string;
    chatEnabled?: boolean;
    continuous?: boolean;
  }>(),
  {
    mood: "02",
    interactive: true,
    size: 56,
    automatic: false,
    track: false,
    intent: "play",
    tips: false,
    muted: false,
    scene: "general",
  },
);
const emit = defineEmits<{
  message: [];
  chat: [origin: DOMRect];
  chatPreview: [origin: DOMRect];
  chatCommit: [];
  chatCancel: [];
}>();
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let holdPoint: {
  id: number;
  x: number;
  y: number;
  surface: HTMLElement;
} | null = null;
let pointerTap: {
  id: number;
  x: number;
  y: number;
  surface: HTMLElement;
} | null = null;
let suppressTapUntil = 0;
let tapOrigin: DOMRect | null = null;
let tapPoint = { x: 0, y: 0 };
let predictingChat = false,
  queuedDouble = false;
let secondPointer: {
  id: number;
  x: number;
  y: number;
  cancelled: boolean;
} | null = null;
let pointerClicks: { x: number; y: number; until: number }[] = [];
function suppressPointerClick(event: PointerEvent) {
  pointerClicks.push({
    x: event.clientX,
    y: event.clientY,
    until: performance.now() + 500,
  });
}
// The first tap moves the ball immediately. Its old hit area remains a short
// arbitration target even after the dialog covers it; the second tap reverses
// that same flight instead of accidentally clicking the new back button. The
// shared ball inside the opening chat is the same physical target, so its
// pointer-down is mapped back to the first tap coordinates and never reaches
// the chat ball or the back button.
function predictiveDown(event: PointerEvent) {
  // A fresh physical press after the handoff cannot be an old synthetic click.
  if (!predictingChat && !props.muted) pointerClicks = [];
  if (!predictingChat || !event.isPrimary || event.button !== 0 || !tapOrigin)
    return;
  const target = event.target instanceof Element ? event.target : null;
  let sharedBall = !!target?.closest(".chat-ball .dorm-companion");
  if (
    !sharedBall &&
    Math.hypot(event.clientX - tapPoint.x, event.clientY - tapPoint.y) >
      COMPANION_TAP_RADIUS
  ) {
    // The ball keeps travelling between a finger's position sample and the
    // delivered press. Apply the same touch tolerance to its current bounds,
    // not only to the original point or the exact DOM hit target. One layout
    // read on this second press; never a per-frame hit-test loop.
    const rect = document
      .querySelector(".chat-ball .dorm-companion")
      ?.getBoundingClientRect();
    sharedBall =
      !!rect &&
      event.clientX >= rect.left - COMPANION_TAP_RADIUS &&
      event.clientX <= rect.right + COMPANION_TAP_RADIUS &&
      event.clientY >= rect.top - COMPANION_TAP_RADIUS &&
      event.clientY <= rect.bottom + COMPANION_TAP_RADIUS;
  }
  const engaged = tapGesture.press(
    event.clientX,
    event.clientY,
    sharedBall ? tapPoint : undefined,
  );
  if (!engaged) return;
  secondPointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    cancelled: false,
  };
  event.preventDefault();
  event.stopImmediatePropagation();
}
function predictiveMove(event: PointerEvent) {
  if (secondPointer?.id !== event.pointerId) return;
  if (
    Math.hypot(
      event.clientX - secondPointer.x,
      event.clientY - secondPointer.y,
    ) > 18
  ) {
    secondPointer.cancelled = true;
    tapGesture.cancel();
  }
}
function predictiveUp(event: PointerEvent) {
  if (secondPointer?.id !== event.pointerId) return;
  const press = secondPointer;
  secondPointer = null;
  suppressPointerClick(event);
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.type === "pointercancel" || press.cancelled) tapGesture.cancel();
  else tapGesture.tap(event.clientX, event.clientY);
}
function predictiveClick(event: MouseEvent) {
  if (event.detail === 0) return;
  pointerClicks = pointerClicks.filter((p) => performance.now() < p.until);
  const index = pointerClicks.findIndex(
    (p) =>
      Math.hypot(event.clientX - p.x, event.clientY - p.y) <=
      COMPANION_TAP_RADIUS,
  );
  if (index < 0) return;
  pointerClicks.splice(index, 1);
  event.preventDefault();
  event.stopImmediatePropagation();
}
function released(event: PointerEvent) {
  const press = pointerTap;
  pointerTap = null;
  cancelHold();
  if (
    !press ||
    press.id !== event.pointerId ||
    event.button !== 0 ||
    props.muted ||
    flying ||
    document.hidden ||
    performance.now() < suppressTapUntil
  )
    return;
  if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 18) return;
  tapOrigin = press.surface.getBoundingClientRect();
  tapPoint = { x: event.clientX, y: event.clientY };
  suppressPointerClick(event);
  tapGesture.tap(event.clientX, event.clientY);
}

function cancelHold() {
  clearTimeout(holdTimer);
  const active = holdPoint;
  holdPoint = null;
  if (active?.surface.hasPointerCapture(active.id))
    active.surface.releasePointerCapture(active.id);
}
function hold(event: PointerEvent) {
  if (
    props.intent !== "play" &&
    event.isPrimary &&
    event.button === 0 &&
    !props.muted &&
    !flying
  ) {
    pointerTap = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      surface: event.currentTarget as HTMLElement,
    };
    tapGesture.press(event.clientX, event.clientY);
  }
  if (
    !props.chatEnabled ||
    !event.isPrimary ||
    event.button !== 0 ||
    props.muted ||
    flying
  )
    return;
  const button = event.currentTarget as HTMLElement;
  cancelHold();
  holdPoint = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    surface: button,
  };
  button.setPointerCapture(event.pointerId);
  if (event.pointerType === "touch") window.getSelection()?.removeAllRanges();
  holdTimer = setTimeout(() => {
    if (!holdPoint || props.muted || document.hidden) return;
    pointerTap = null;
    tapGesture.cancel();
    suppressTapUntil = performance.now() + 1000;
    cancelHold();
    navigator.vibrate?.(10);
    emit("chat", button.getBoundingClientRect());
  }, 380);
}
function moveHold(event: PointerEvent) {
  if (
    pointerTap &&
    (event.pointerId !== pointerTap.id ||
      Math.hypot(event.clientX - pointerTap.x, event.clientY - pointerTap.y) >
        18)
  ) {
    pointerTap = null;
    suppressTapUntil = performance.now() + 1000;
    tapGesture.cancel();
  }
  if (
    holdPoint &&
    (event.pointerId !== holdPoint.id ||
      Math.hypot(event.clientX - holdPoint.x, event.clientY - holdPoint.y) > 18)
  ) {
    suppressTapUntil = performance.now() + 1000;
    tapGesture.cancel();
    cancelHold();
  }
}
function leaveHold(event: PointerEvent) {
  if (
    event.type === "lostpointercapture" &&
    event.target !== holdPoint?.surface
  )
    return;
  if (holdPoint?.surface.hasPointerCapture(event.pointerId)) return;
  cancelHold();
}
function abortHold() {
  pointerTap = null;
  cancelHold();
  tapGesture.cancel();
}
function keyboardChat(event: KeyboardEvent) {
  if (
    props.chatEnabled &&
    event.shiftKey &&
    event.key === "Enter" &&
    !props.muted
  ) {
    event.preventDefault();
    tapGesture.cancel();
    emit("chat", (event.currentTarget as HTMLElement).getBoundingClientRect());
  }
}
const play = createCompanionPlay();
const tapGesture = createCompanionTapGesture({
  preview: () => {
    if (
      props.intent !== "chat" ||
      !props.chatEnabled ||
      !tapOrigin ||
      props.muted
    )
      return;
    predictingChat = true;
    emit("chatPreview", tapOrigin);
  },
  rollback: () => {
    if (!predictingChat) return;
    predictingChat = false;
    emit("chatCancel");
  },
  single: () => {
    if (predictingChat) {
      // The preview is now confirmed. No request was made before this point.
      predictingChat = false;
      emit("chatCommit");
      return;
    }
    if (document.hidden || props.muted || flying) return;
    if (props.intent === "chat" && props.chatEnabled && tapOrigin)
      emit("chat", tapOrigin);
    else emit("message");
  },
  double: () => {
    if (props.muted) queuedDouble = true;
    else tap();
  },
});
watch(
  () => props.muted,
  (muted) => {
    if (muted) {
      cancelHold();
      if (!predictingChat) tapGesture.cancel();
      if (props.continuous && engine) releaseCompanion(engine);
    } else if (props.continuous && engine) {
      acquireCompanion(engine);
    }
    if (!muted && queuedDouble) {
      queuedDouble = false;
      tap();
    }
    syncMotion();
  },
);
let flight: Animation | undefined;
let flying = false;
function finishFlight() {
  if (!flying) return;
  flying = false;
  flight?.cancel();
  finishCompanionHandoff();
}
async function flyFromLogin() {
  if (!props.track) return;
  const source = takeCompanionHandoff();
  if (!source) {
    finishCompanionHandoff();
    return;
  }
  await nextTick();
  const el = host.value?.parentElement;
  if (!el || !motionAllowed()) {
    finishCompanionHandoff();
    return;
  }
  const target = el.getBoundingClientRect();
  flying = true;
  flight = el.animate(
    [
      {
        transform: `translate(${source.left - target.left}px,${source.top - target.top}px) scale(${source.width / target.width})`,
      },
      { transform: "translate(0,0) scale(1)" },
    ],
    { duration: 680, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" },
  );
  flight.finished.then(finishFlight, finishFlight);
}
const host = ref<HTMLElement>();
const reaction = ref("");
const idle = ref("02");
const actual = ref(props.mood);
const target = computed(() => {
  if (!props.automatic) return reaction.value || props.mood;
  // Keep operation/error feedback above play; ordinary scene moods may react.
  if (
    ["11", "12", "13", "20", "32", "33", "34", "36", "38"].includes(props.mood)
  )
    return props.mood;
  return (
    reaction.value ||
    (props.mood !== "02" && props.mood !== "19"
      ? props.mood
      : idle.value !== "02"
        ? idle.value
        : props.mood)
  );
});
let engine: EmotionEngine | undefined;
let reactionTimer: ReturnType<typeof setTimeout> | undefined;
let clock: ReturnType<typeof setInterval> | undefined;
let observer: IntersectionObserver | undefined;
let visible = true;
let lastActivity = Date.now();
const media = matchMedia("(prefers-reduced-motion: reduce)");
const label = computed(
  () => emotions.find((e) => e.id === actual.value)?.name || "球球",
);
function react(id: string, duration = 2600) {
  clearTimeout(reactionTimer);
  reaction.value = id;
  reactionTimer = setTimeout(() => (reaction.value = ""), duration);
}
function clearReaction() {
  clearTimeout(reactionTimer);
  reactionTimer = undefined;
  reaction.value = "";
}
function activity(event?: Event) {
  if (!props.automatic) return;
  if (
    event?.target instanceof Element &&
    event.target.closest(".dorm-companion")
  )
    return;
  const wasAsleep = ["00", "06", "15"].includes(idle.value);
  lastActivity = Date.now();
  idle.value = "02";
  if (wasAsleep && props.automatic) react("01", 2300);
}
function tap() {
  if (!props.interactive || props.muted || document.hidden || flying) return;
  const current = actual.value;
  activity();
  react(play.next(current));
}
function clicked(event: MouseEvent) {
  if (performance.now() < suppressTapUntil) return;
  if (flying || props.muted || document.hidden) return;
  if (!props.interactive) return;
  if (props.intent === "play") {
    tap();
    return;
  }
  // Pointer releases already went through the arbiter. Only keyboard/assistive
  // activation belongs to click, even when a browser delays/reorders clicks.
  if (event.detail > 0) return;
  tapOrigin = (event.currentTarget as HTMLElement).getBoundingClientRect();
  tapPoint = { x: event.clientX, y: event.clientY };
  tapGesture.tap(
    event.clientX,
    event.clientY,
    event.detail === 0 && event.clientX === 0 && event.clientY === 0,
  );
}
function applyGaze() {
  if (props.gazePoint) engine?.setGaze(props.gazePoint.x, props.gazePoint.y);
}
watch(() => props.gazePoint, applyGaze, { deep: true });
function gaze(event: PointerEvent) {
  if (props.gazePoint) return;
  if (
    !engine ||
    !props.interactive ||
    !visible ||
    document.hidden ||
    !motionAllowed()
  )
    return;
  const rect = host.value?.getBoundingClientRect();
  if (!rect) return;
  const point = naturalGaze(event.clientX, event.clientY, rect, {
    width: innerWidth,
    height: innerHeight,
  });
  engine.setGaze(point.x, point.y);
}
function syncMotion() {
  if (!motionAllowed()) {
    // Reduced motion disables rendering, not single/double activation. A mute
    // handoff during a predictive launch must not cancel the user intent.
    if (document.hidden) tapGesture.cancel();
    clearReaction();
    finishFlight();
  }
  const animate =
    companionEnabled.value &&
    !props.muted &&
    visible &&
    motionAllowed() &&
    !media.matches;
  engine?.setActive(animate);
  if (!animate && !props.muted) engine?.renderStatic();
}
watch(target, (id) => {
  if (!props.muted) engine?.setEmotion(id);
});
watch(
  () => props.mood,
  () => {
    // Scene navigation must not interrupt a tap reaction mid-sequence.
    lastActivity = Date.now();
    idle.value = "02";
  },
);
watch(companionEnabled, syncMotion);
watch(
  () => props.automatic,
  () => {
    clearTimeout(reactionTimer);
    reaction.value = "";
    idle.value = "02";
    lastActivity = Date.now();
  },
);
onMounted(() => {
  document.addEventListener("pointerdown", predictiveDown, true);
  document.addEventListener("pointermove", predictiveMove, true);
  document.addEventListener("pointerup", predictiveUp, true);
  document.addEventListener("pointercancel", predictiveUp, true);
  document.addEventListener("click", predictiveClick, true);
  if (!host.value || !window.EmotionBall) {
    if (props.track) finishCompanionHandoff();
    return;
  }
  engine = window.EmotionBall.create(host.value, {
    emotion: target.value,
    shape: "blob",
    eyeScale: props.size < 80 ? 1.5 : 1,
    autostart: false,
    idle: false,
    lite: false,
  });
  engine.on("change", ({ id }) => {
    actual.value = id;
    if (props.track) displayedEmotion.value = id;
  });
  const restored = props.continuous && acquireCompanion(engine);
  syncMotion();
  if (!restored) engine.setEmotion(target.value);
  applyGaze();
  void flyFromLogin();
  if (!restored && props.automatic && ["02", "19"].includes(props.mood))
    react("05", 900);
  observer = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    syncMotion();
  });
  observer.observe(host.value);
  if (props.interactive) {
    clock = setInterval(() => {
      if (props.automatic && !document.hidden)
        idle.value = ambientEmotion(Date.now() - lastActivity);
    }, 1000);
    window.addEventListener("pointermove", gaze, { passive: true });
    window.addEventListener("pointerdown", activity, { passive: true });
    window.addEventListener("keydown", activity);
  }
  document.addEventListener("visibilitychange", syncMotion);
  window.addEventListener("ui-motion-change", syncMotion);
  media.addEventListener("change", syncMotion);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", predictiveDown, true);
  document.removeEventListener("pointermove", predictiveMove, true);
  document.removeEventListener("pointerup", predictiveUp, true);
  document.removeEventListener("pointercancel", predictiveUp, true);
  document.removeEventListener("click", predictiveClick, true);
  cancelHold();
  tapGesture.cancel();
  finishFlight();
  clearTimeout(reactionTimer);
  clearInterval(clock);
  observer?.disconnect();
  if (props.continuous && engine) releaseCompanion(engine);
  engine?.destroy();
  window.removeEventListener("pointermove", gaze);
  window.removeEventListener("pointerdown", activity);
  window.removeEventListener("keydown", activity);
  document.removeEventListener("visibilitychange", syncMotion);
  window.removeEventListener("ui-motion-change", syncMotion);
  media.removeEventListener("change", syncMotion);
});
</script>
<template>
  <span
    class="companion-frame"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <component
      :is="interactive ? 'button' : 'span'"
      :type="interactive ? 'button' : undefined"
      class="dorm-companion"
      :class="{ 'is-interactive': interactive, 'is-chat-enabled': chatEnabled }"
      :style="{ width: `${size}px`, height: `${size}px` }"
      :aria-label="
        interactive
          ? `球球，${label}，${intent === 'chat' ? '单击聊天，双击互动' : intent === 'message' ? '单击给室友留言，双击互动' : '点击逗逗它'}${chatEnabled ? '，长按聊天，键盘Shift加回车聊天' : ''}`
          : undefined
      "
      :aria-hidden="interactive ? undefined : true"
      :title="interactive ? label : undefined"
      @click.stop="clicked"
      @pointerdown="hold"
      @pointermove="moveHold"
      @pointerup="released"
      @pointercancel="abortHold"
      @pointerleave="leaveHold"
      @lostpointercapture="leaveHold"
      @selectstart.prevent
      @keydown="keyboardChat"
      @contextmenu="chatEnabled && $event.preventDefault()"
    >
      <span ref="host" class="emotion-ball-host" aria-hidden="true"></span>
    </component>
    <CompanionBubble
      v-if="tips"
      :scene="scene"
      :muted="muted"
      :message="message"
    />
  </span>
</template>
<style scoped>
.companion-frame {
  display: inline-flex;
  position: relative;
  flex: none;
  vertical-align: middle;
}
.dorm-companion {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: none;
  transform-origin: top left;
  vertical-align: middle;
  -webkit-tap-highlight-color: transparent;
}
.is-interactive {
  cursor: pointer;
  touch-action: manipulation;
}
.is-chat-enabled {
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
.is-chat-enabled :deep(*) {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.emotion-ball-host {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.emotion-ball-host :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.dorm-companion:focus-visible {
  outline: 2px solid var(--app-tone-h333, #333);
  outline-offset: 3px;
  border-radius: 50%;
}
</style>
