<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
  companionReply,
  speechPages,
  type CompanionScene,
} from "../interaction/companionSpeech";
const props = withDefaults(
  defineProps<{ scene?: CompanionScene; muted?: boolean; message?: string }>(),
  { scene: "general", muted: false, message: "" },
);
const text = ref("");
let pageTimer: ReturnType<typeof setTimeout> | undefined,
  tipTimer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | undefined,
  dead = false,
  generation = 0;
const quiet = computed(() => props.muted || document.hidden);
function cancel() {
  generation++;
  clearTimeout(pageTimer);
  controller?.abort();
  text.value = "";
}
function say(value: string) {
  cancel();
  if (quiet.value) return;
  const pages = speechPages(value);
  const id = generation;
  let page = 0;
  function show() {
    if (dead || quiet.value || id !== generation) return;
    text.value = pages[page++] || "";
    pageTimer = setTimeout(() => {
      if (page < pages.length) show();
      else text.value = "";
    }, 3400);
  }
  show();
}
async function tip() {
  if (dead) return;
  if (!quiet.value) {
    controller?.abort();
    const c = new AbortController();
    controller = c;
    try {
      const value = await companionReply(props.scene, "tip", c.signal);
      if (!c.signal.aborted && !dead) say(value);
    } catch {}
  }
  tipTimer = setTimeout(tip, 45000 + Math.random() * 20000);
}
function visibility() {
  if (document.hidden) cancel();
}
watch(
  () => props.message,
  (value) => {
    if (value) say(value);
  },
);
watch(
  () => props.muted,
  (value) => {
    if (value) cancel();
  },
);
onMounted(() => {
  tipTimer = setTimeout(tip, 6500);
  document.addEventListener("visibilitychange", visibility);
});
onBeforeUnmount(() => {
  dead = true;
  cancel();
  clearTimeout(tipTimer);
  document.removeEventListener("visibilitychange", visibility);
});
defineExpose({ say });
</script>
<template>
  <Transition name="companion-whisper"
    ><button
      v-if="text && !muted"
      class="companion-bubble"
      role="status"
      aria-live="polite"
      @click.stop="cancel"
    >
      {{ text }}
    </button></Transition
  >
</template>
<style scoped>
.companion-bubble {
  position: absolute;
  left: 4px;
  top: calc(100% + 2px);
  z-index: 20;
  width: max-content;
  max-width: min(154px, calc(100vw - 56px));
  padding: 7px 10px;
  border: 1px solid #e5e5e5;
  border-radius: 5px 13px 13px 13px;
  background: rgba(255, 255, 255, 0.96);
  color: #777;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.6;
  font-weight: 400;
  text-align: left;
  box-shadow: 0 3px 12px #00000006;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.companion-whisper-enter-active,
.companion-whisper-leave-active {
  transition:
    opacity 170ms,
    transform 170ms;
}
.companion-whisper-enter-from,
.companion-whisper-leave-to {
  opacity: 0;
  transform: translateY(3px);
}
@media (prefers-reduced-motion: reduce) {
  .companion-whisper-enter-active,
  .companion-whisper-leave-active {
    transition: none;
  }
}
</style>
