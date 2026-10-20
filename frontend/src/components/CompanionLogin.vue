<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import DormCompanion from "./DormCompanion.vue";
import { naturalGaze } from "../interaction/companionTap";
import { companionEnabled } from "../interaction/companion";
const point = ref({ x: 0, y: 0.1 }),
  privateInput = ref(false),
  peek = ref(false);
const hero = ref<HTMLElement>();
let focusField: HTMLInputElement | null = null,
  privacyTimer: ReturnType<typeof setInterval> | undefined,
  peekTimer: ReturnType<typeof setTimeout> | undefined;
function privateField(input: HTMLInputElement) {
  return (
    input.type === "password" ||
    input.autocomplete === "one-time-code" ||
    /password|account-code/.test(input.name + " " + input.id)
  );
}
function aim(x: number, y: number) {
  const box = hero.value
    ?.querySelector(".dorm-companion")
    ?.getBoundingClientRect();
  if (!box) return;
  point.value = naturalGaze(x, y, box, {
    width: innerWidth,
    height: innerHeight,
  });
}
let gazeFrame = 0;
let measureContext: CanvasRenderingContext2D | null = null;
function caret() {
  cancelAnimationFrame(gazeFrame);
  gazeFrame = requestAnimationFrame(measureCaret);
}
function measureCaret() {
  const input = focusField;
  if (!input || privateInput.value) return;
  const box = input.getBoundingClientRect(),
    style = getComputedStyle(input);
  const ctx = (measureContext ||= document
    .createElement("canvas")
    .getContext("2d"));
  if (ctx) ctx.font = style.font;
  // Measure only non-secret text, locally. No field text leaves this component.
  const width =
    ctx?.measureText(
      input.value.slice(0, input.selectionStart ?? input.value.length),
    ).width || 0;
  aim(
    Math.min(
      box.right - 12,
      Math.max(
        box.left + 12,
        box.left +
          parseFloat(style.paddingLeft || "0") +
          width -
          input.scrollLeft,
      ),
    ),
    box.top + box.height / 2,
  );
}
function focus(event: Event) {
  focusField = event.target instanceof HTMLInputElement ? event.target : null;
  privateInput.value = Boolean(focusField && privateField(focusField));
  peek.value = false;
  if (privateInput.value) point.value = { x: -1, y: -0.85 };
  else caret();
}
function pointer(event: PointerEvent) {
  if (privateInput.value) return;
  const { clientX, clientY } = event;
  cancelAnimationFrame(gazeFrame);
  gazeFrame = requestAnimationFrame(() => {
    if (!privateInput.value) aim(clientX, clientY);
  });
}
function blur() {
  queueMicrotask(() => {
    if (!document.activeElement?.matches("input")) {
      focusField = null;
      privateInput.value = false;
      peek.value = false;
    }
  });
}
onMounted(() => {
  document.addEventListener("focusin", focus);
  document.addEventListener("focusout", blur);
  document.addEventListener("input", caret);
  document.addEventListener("keyup", caret);
  document.addEventListener("selectionchange", caret);
  window.addEventListener("pointermove", pointer, { passive: true });
  window.addEventListener("pointerdown", pointer, { passive: true });
  privacyTimer = setInterval(() => {
    if (privateInput.value && !document.hidden) {
      peek.value = true;
      peekTimer = setTimeout(() => (peek.value = false), 750);
    }
  }, 3800);
  if (document.activeElement instanceof HTMLInputElement)
    focus({ target: document.activeElement } as unknown as Event);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(gazeFrame);
  clearInterval(privacyTimer);
  clearTimeout(peekTimer);
  document.removeEventListener("focusin", focus);
  document.removeEventListener("focusout", blur);
  document.removeEventListener("input", caret);
  document.removeEventListener("keyup", caret);
  document.removeEventListener("selectionchange", caret);
  window.removeEventListener("pointermove", pointer);
  window.removeEventListener("pointerdown", pointer);
});
</script>
<template>
  <div
    v-if="companionEnabled"
    ref="hero"
    class="companion-login"
    data-companion-login
  >
    <DormCompanion
      :size="112"
      :mood="privateInput ? (peek ? '14' : '00') : '03'"
      :gaze-point="point"
      :tips="false"
      :muted="privateInput"
      scene="login"
    />
  </div>
</template>
<style scoped>
.companion-login {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin: clamp(12px, 4dvh, 40px) auto 28px;
  min-height: 210px;
}

.companion-login :deep(.companion-bubble) {
  left: 50%;
  transform: translateX(-50%);
  top: auto;
  bottom: calc(100% - 12px);
}
@media (max-height: 650px) {
  .companion-login {
    margin: 8px auto 18px;
    min-height: 145px;
  }
  .companion-login :deep(.companion-frame),
  .companion-login :deep(.dorm-companion) {
    width: 128px !important;
    height: 128px !important;
  }
}
</style>
