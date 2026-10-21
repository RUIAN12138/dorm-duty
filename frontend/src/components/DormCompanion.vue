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
    intent?: "play" | "message";
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
const emit = defineEmits<{ message: []; chat: [origin: DOMRect] }>();
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let holdPoint: {
  id: number;
  x: number;
  y: number;
  surface: HTMLElement;
} | null = null;
let suppressTapUntil = 0;
function cancelHold() {
  clearTimeout(holdTimer);
  const active = holdPoint;
  holdPoint = null;
  if (active?.surface.hasPointerCapture(active.id))
    active.surface.releasePointerCapture(active.id);
}
function hold(event: PointerEvent) {
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
    tapGesture.cancel();
    suppressTapUntil = performance.now() + 1000;
    cancelHold();
    navigator.vibrate?.(10);
    emit("chat", button.getBoundingClientRect());
  }, 380);
}
function moveHold(event: PointerEvent) {
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
  single: () => {
    if (!document.hidden && !props.muted && !flying) emit("message");
  },
  double: tap,
});
watch(
  () => props.muted,
  (muted) => {
    if (muted) {
      cancelHold();
      tapGesture.cancel();
      if (props.continuous && engine) releaseCompanion(engine);
    } else if (props.continuous && engine) {
      acquireCompanion(engine);
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
    tapGesture.cancel();
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
          ? `球球，${label}，${intent === 'message' ? '单击给室友留言，双击互动' : '点击逗逗它'}${chatEnabled ? '，长按聊天，键盘Shift加回车聊天' : ''}`
          : undefined
      "
      :aria-hidden="interactive ? undefined : true"
      :title="interactive ? label : undefined"
      @click.stop="clicked"
      @pointerdown="hold"
      @pointermove="moveHold"
      @pointerup="cancelHold"
      @pointercancel="cancelHold"
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
