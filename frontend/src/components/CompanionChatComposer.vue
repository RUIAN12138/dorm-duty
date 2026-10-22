<script setup lang="ts">
import { ref, nextTick, watch, onBeforeUnmount } from "vue";
const props = defineProps<{
  busy: boolean;
  enabled: boolean;
  placeholder?: string;
}>();
const emit = defineEmits<{ send: [text: string]; focus: []; resize: [] }>();
const text = ref(""),
  editing = ref(false),
  pressed = ref(false),
  input = ref<HTMLTextAreaElement>(),
  inputHeight = ref(26);
const composing = ref(false);
let imeSubmitBlockedUntil = 0;
function prepare(event: PointerEvent) {
  if (!props.enabled) return;
  pressed.value = true;
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
  pressed.value = false;
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
window.addEventListener("pointerup", release);
window.addEventListener("pointercancel", release);
onBeforeUnmount(() => {
  window.removeEventListener("pointerup", release);
  window.removeEventListener("pointercancel", release);
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
  background: var(--chat-glass);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  transform: scale(1);
  transform-origin: center;
  transition: transform 480ms cubic-bezier(0.22, 1.35, 0.36, 1);
}
.composer-text.is-pressed {
  transform: scaleX(1.012) scaleY(0.955);
  transition-duration: 100ms;
}
.composer-text:focus-within {
  outline: 1px solid var(--ui-border);
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
  transition:
    transform 420ms cubic-bezier(0.22, 1.35, 0.36, 1),
    opacity 180ms ease;
}
.composer-send:active:not(:disabled) {
  transform: scale(0.95);
  transition-duration: 90ms;
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
  .composer-text,
  .composer-send {
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
