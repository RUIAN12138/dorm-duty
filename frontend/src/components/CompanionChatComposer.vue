<script setup lang="ts">
import { ref, nextTick, computed, watch, onBeforeUnmount } from "vue";
import { motion } from "motion-v";
import { motionAllowed, motionTokens } from "../interaction/motion";
import {
  createVoiceRecorder,
  voiceSupported,
  audioBase64,
} from "../interaction/companionVoice";
const props = defineProps<{
  busy: boolean;
  enabled: boolean;
  voiceEnabled: boolean;
}>();
const emit = defineEmits<{
  send: [text: string];
  audio: [audio: string];
  error: [text: string];
  recording: [value: boolean];
}>();
const mode = ref<"text" | "voice">("text"),
  text = ref(""),
  recording = ref(false),
  asking = ref(false),
  input = ref<HTMLTextAreaElement>();
const voice = createVoiceRecorder(),
  transition = computed(() =>
    motionAllowed() ? motionTokens.layout : { duration: 0 },
  );
function cancel() {
  voice.cancel();
  recording.value = false;
  asking.value = false;
  emit("recording", false);
}
function toText() {
  cancel();
  mode.value = "text";
  void nextTick(() => input.value?.focus());
}
const composing = ref(false);
let imeSubmitBlockedUntil = 0;
function enter(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || composing.value) {
    // Preserve the input method's default commit while suppressing the form's
    // implicit submit from this same key event (not a second send gesture).
    imeSubmitBlockedUntil = performance.now() + 100;
    return;
  }
  event.preventDefault();
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
async function activateVoice() {
  if (props.busy || !props.enabled) return;
  if (mode.value !== "voice") {
    if (!props.voiceEnabled || !voiceSupported()) {
      emit("error", "语音转文字暂不可用，可使用键盘听写");
      return;
    }
    mode.value = "voice";
    input.value?.blur();
    return;
  }
  if (recording.value) {
    recording.value = false;
    emit("recording", false);
    voice.stop();
    return;
  }
  if (asking.value) return;
  asking.value = true;
  const started = await voice.start(
    (wav) => {
      recording.value = false;
      asking.value = false;
      emit("recording", false);
      emit("audio", audioBase64(wav));
    },
    (message) => {
      recording.value = false;
      asking.value = false;
      emit("recording", false);
      emit("error", message);
    },
  );
  asking.value = false;
  recording.value = started;
  emit("recording", started);
}
function receive(value: string) {
  mode.value = "text";
  text.value = value;
  void nextTick(() => input.value?.focus());
}
watch(
  () => props.enabled,
  (value) => {
    if (!value) cancel();
  },
);
onBeforeUnmount(cancel);
defineExpose({ receive, cancel });
</script>
<template>
  <form
    class="chat-composer"
    :class="{ 'is-voice': mode === 'voice' }"
    @submit.prevent="send"
    data-testid="chat-composer"
  >
    <motion.button
      layout
      :transition="transition"
      type="button"
      class="composer-voice composer-shape"
      :class="{ 'is-ellipse': mode === 'voice', 'is-recording': recording }"
      :disabled="busy || !enabled"
      :aria-label="
        mode === 'text' ? '切换语音输入' : recording ? '结束录音' : '开始录音'
      "
      :aria-pressed="recording"
      @click="activateVoice"
      data-testid="chat-voice"
    >
      <motion.span
        layout="position"
        :transition="transition"
        class="composer-center"
        ><svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6" /></svg
        ><span v-if="mode === 'voice'">{{
          asking ? "正在打开…" : recording ? "点击结束" : "点击说话"
        }}</span></motion.span
      >
    </motion.button>
    <motion.div
      layout
      :transition="transition"
      class="composer-text composer-shape"
      :class="{ 'is-circle': mode === 'voice' }"
    >
      <template v-if="mode === 'text'">
        <textarea
          ref="input"
          v-model="text"
          rows="1"
          maxlength="1000"
          aria-label="和球球说句话"
          placeholder="和球球说句话…"
          :disabled="busy || !enabled"
          @keydown.enter.exact="enter"
          @compositionstart="composing = true"
          @compositionend="composing = false" /><button
          type="submit"
          class="composer-send"
          @pointerdown="imeSubmitBlockedUntil = 0"
          aria-label="发送消息"
          :disabled="busy || !enabled || !text.trim()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 12 6-6 6 6M12 6v13" />
          </svg></button
      ></template>
      <button
        v-else
        type="button"
        class="composer-keyboard"
        aria-label="切换文字输入"
        @click="toText"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path
            d="M6 9h1m3 0h1m3 0h1m3 0h.1M6 12h1m3 0h1m3 0h1m3 0h.1M7 16h10"
          />
        </svg>
      </button>
    </motion.div>
  </form>
</template>
<style scoped>
.chat-composer {
  display: flex;
  gap: 12px;
  width: 100%;
  align-items: center;
  min-height: 56px;
}
.composer-shape {
  border: 1px solid #ffffff45;
  border-radius: 28px;
  min-width: 0;
  height: 56px;
  box-sizing: border-box;
  overflow: hidden;
}
.composer-voice {
  width: 56px;
  flex: 0 0 56px;
  background: #111;
  color: white;
  display: grid;
  place-items: center;
  padding: 0;
}
.composer-voice.is-ellipse {
  flex: 1 1 0;
  background: var(--chat-glass);
  color: var(--ui-ink);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}
.composer-text {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  background: var(--chat-glass);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  padding: 0 6px 0 18px;
}
.composer-text.is-circle {
  width: 56px;
  flex: 0 0 56px;
  background: #111;
  color: white;
  padding: 0;
  border-color: #ffffff20;
}
.composer-center {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-size: 16px;
}
.chat-composer svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.composer-text textarea {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  outline: 0;
  resize: none;
  width: 100%;
  min-height: 24px;
  height: 24px;
  padding: 0 !important;
  font: inherit;
  font-size: 16px;
  line-height: 24px;
  transform: none !important;
  backdrop-filter: none !important;
  color: var(--ui-ink);
}
.composer-send,
.composer-keyboard {
  border: 0;
  display: grid;
  place-items: center;
  flex: none;
  background: transparent;
  color: inherit;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  padding: 0;
}
.composer-send {
  background: #111;
  color: white;
}
.composer-keyboard {
  width: 100%;
  height: 100%;
}
.chat-composer button {
  cursor: pointer;
  transition: transform var(--ui-release-time) var(--ui-ease-overshoot);
}
.chat-composer button:active:not(:disabled) {
  transform: scale(0.96);
  transition-duration: 90ms;
}
.chat-composer button:disabled {
  cursor: default;
  opacity: 0.45;
}
.composer-text:focus-within {
  outline: 1px solid var(--ui-border);
}
.is-recording .composer-center svg {
  animation: voice-pulse 900ms ease-in-out infinite alternate;
}
@keyframes voice-pulse {
  to {
    opacity: 0.45;
    transform: scale(0.88);
  }
}
@media (prefers-reduced-motion: reduce) {
  .chat-composer button {
    transition: none;
  }
  .is-recording .composer-center svg {
    animation: none;
  }
}
@media (prefers-reduced-transparency: reduce) {
  .composer-shape {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
}
</style>
