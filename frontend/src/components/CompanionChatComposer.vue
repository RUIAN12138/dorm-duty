<script setup lang="ts">
import {
  ref,
  nextTick,
  watch,
  onBeforeUnmount,
  onMounted,
  computed,
} from "vue";
import { animate } from "motion-v";
import { motionAllowed } from "../interaction/motion";
import { chatMotion } from "../interaction/chatMotion";
const props = defineProps<{
  busy: boolean;
  enabled: boolean;
  placeholder?: string;
  draft?: string;
}>();
const emit = defineEmits<{
  send: [text: string];
  focus: [];
  resize: [];
  "update:draft": [value: string];
}>();
const text = computed({
    get: () => props.draft || "",
    set: (value: string) => emit("update:draft", value),
  }),
  editing = ref(false),
  pressed = ref(false),
  input = ref<HTMLTextAreaElement>(),
  composerText = ref<HTMLElement>(),
  inputHeight = ref(26);
const composing = ref(false);
let imeSubmitBlockedUntil = 0;
let textControl: ReturnType<typeof animate> | undefined;
function press(
  el: HTMLElement | undefined,
  control: ReturnType<typeof animate> | undefined,
  down: boolean,
) {
  if (!el) return control;
  control?.stop();
  const target = down
    ? { scaleX: 1.012, scaleY: 0.955 }
    : { scaleX: 1, scaleY: 1 };
  if (!motionAllowed()) {
    el.style.transform = "none";
    return undefined;
  }
  return animate(el, target, chatMotion.press);
}
function prepare(event: PointerEvent) {
  if (!props.enabled) return;
  pressed.value = true;
  textControl = press(composerText.value, textControl, true);
  if (!editing.value) {
    // First touch opens editing without invoking the mobile keyboard. A later
    // deliberate touch in the textarea performs native focus and selection.
    event.preventDefault();
    editing.value = true;
  }
}
function resize() {
  if (!input.value) return;
  input.value.style.height = "26px";
  inputHeight.value = Math.min(78, Math.max(26, input.value.scrollHeight));
  input.value.style.height = inputHeight.value + "px";
  emit("resize");
}
watch(text, () => {
  void nextTick(resize);
});
function dismiss() {
  input.value?.blur();
  release();
}
function release() {
  if (!pressed.value) return;
  pressed.value = false;
  textControl = press(composerText.value, textControl, false);
}
function enter(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || composing.value) {
    imeSubmitBlockedUntil = performance.now() + 100;
    return;
  }
  event.preventDefault();
  if (!editing.value) {
    editing.value = true;
    return;
  }
  imeSubmitBlockedUntil = 0;
  send();
}
function send() {
  const value = text.value.trim();
  if (
    !value ||
    props.busy ||
    !props.enabled ||
    composing.value ||
    performance.now() < imeSubmitBlockedUntil
  )
    return;
  emit("send", value);
  text.value = "";
}
function cancel() {
  release();
}
onMounted(() => {
  void nextTick(resize);
});
window.addEventListener("pointerup", release);
window.addEventListener("pointercancel", release);
onBeforeUnmount(() => {
  window.removeEventListener("pointerup", release);
  window.removeEventListener("pointercancel", release);
  textControl?.stop();
});
defineExpose({ cancel, dismiss });
</script>
<template>
  <form
    class="chat-composer"
    @submit.prevent="send"
    data-testid="chat-composer"
  >
    <div
      ref="composerText"
      class="composer-text"
      :class="{ 'is-pressed': pressed }"
      @pointerdown="prepare"
    >
      <textarea
        ref="input"
        :style="{ height: inputHeight + 'px' }"
        v-model="text"
        rows="1"
        maxlength="1000"
        aria-label="和球球说句话"
        :placeholder="placeholder || '和球球说句话…'"
        :disabled="!enabled"
        @focus="emit('focus')"
        @blur="emit('focus')"
        :readonly="!editing"
        @keydown.enter.exact="enter"
        @compositionstart="composing = true"
        @compositionend="composing = false"
      />
      <button
        type="submit"
        class="composer-send"
        @pointerdown.stop.prevent="imeSubmitBlockedUntil = 0"
        aria-label="发送消息"
        :disabled="busy || !enabled || !text.trim()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 12 6-6 6 6M12 6v13" />
        </svg>
      </button>
    </div>
  </form>
</template>
<style scoped>
.chat-composer {
  margin: 0;
  width: 100%;
  min-height: 58px;
}
.composer-text {
  width: 100%;
  min-height: 58px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 7px 6px 20px;
  border: 1px solid #ffffff65;
  border-radius: 30px;
  background: color-mix(in srgb, var(--ui-surface) 42%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transform-origin: center;
}
.composer-text:focus-within {
  /* Two local layers: a crisp edge and a soft outer glow, both scoped to the
     input glass. Keyboard focus still gets its visible outline below. */
  outline: none;
  box-shadow:
    0 0 0 1px var(--ui-focus-ring),
    0 10px 26px var(--ui-focus-glow);
  transition: box-shadow 180ms var(--ui-ease-out);
}
.composer-text:has(textarea:focus-visible) {
  outline: 1px solid var(--ui-border);
  outline-offset: 2px;
}
.composer-text textarea {
  flex: 1;
  min-width: 0;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  outline: 0;
  resize: none;
  min-height: 26px;
  max-height: 78px;
  overflow-y: auto;
  scrollbar-width: none;
  padding: 0 !important;
  font: inherit;
  font-size: 16px;
  line-height: 26px;
  transform: none !important;
  backdrop-filter: none !important;
  color: var(--ui-ink);
  border-radius: 0;
}
.composer-send {
  border: 0;
  display: grid;
  place-items: center;
  flex: none;
  background: #111;
  color: white;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  padding: 0;
  cursor: pointer;
  transition: opacity 180ms ease;
}
.composer-send:disabled {
  cursor: default;
  opacity: 0.4;
}
.composer-send svg {
  width: 23px;
  height: 23px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
@media (prefers-reduced-motion: reduce) {
  .composer-send,
  .composer-text {
    transition: none;
  }
}
@media (prefers-reduced-transparency: reduce) {
  .composer-text {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: var(--ui-surface);
  }
}
</style>
