<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "reka-ui";
import { animate, motion } from "motion-v";
import DormCompanion from "./DormCompanion.vue";
import CompanionChatComposer from "./CompanionChatComposer.vue";
import { companionClient, type ChatReminder } from "../api/companionChat";
import { motionAllowed, motionTokens } from "../interaction/motion";
import { registerNativeBack } from "../interactions/nativeBack";
const props = defineProps<{
  modelValue: boolean;
  origin: DOMRect | null;
  invite: string;
  memberId: number;
  token: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  present: [value: boolean];
}>();
const present = ref(false),
  phase = ref<"opening" | "open" | "closing">("opening"),
  ball = ref<HTMLElement>(),
  surface = ref<HTMLElement>(),
  backdrop = ref<HTMLElement>(),
  scroll = ref<HTMLElement>(),
  historyFrame = ref<HTMLElement>(),
  composer = ref<InstanceType<typeof CompanionChatComposer>>();
const available = ref(false),
  voiceAvailable = ref(false),
  loading = ref(false),
  busy = ref(false),
  recording = ref(false),
  awaiting = ref(false),
  error = ref(""),
  emotion = ref("02"),
  items = ref<{ id: string; role: "user" | "assistant"; text: string }[]>([]),
  reminders = ref<ChatReminder[]>([]),
  actionBusy = ref("");
const viewport = ref({ top: 0, height: window.innerHeight }),
  thinking = computed(() => awaiting.value);
let api = companionClient(props.invite, props.memberId, props.token),
  epoch = 0,
  controller: AbortController | undefined,
  removeBack: (() => void) | undefined,
  closing = false,
  lastFocus: HTMLElement | null = null,
  delayTimer: ReturnType<typeof setTimeout> | undefined,
  delayResolve: (() => void) | undefined;
let controls: ReturnType<typeof animate>[] = [];
let retry: { text: string; id: string } | null = null;
const scope = () => `${props.invite}:${props.memberId}:${props.token}`;
const motionTransition = computed(() =>
  motionAllowed() ? motionTokens.drawer : { duration: 0 },
);
function fit() {
  viewport.value = {
    top: window.visualViewport?.offsetTop || 0,
    height: window.visualViewport?.height || window.innerHeight,
  };
}
function cancel() {
  epoch++;
  controller?.abort();
  controller = undefined;
  clearTimeout(delayTimer);
  delayResolve?.();
  delayResolve = undefined;
  composer.value?.cancel();
  busy.value = false;
  awaiting.value = false;
  recording.value = false;
  loading.value = false;
  actionBusy.value = "";
}
function pause(ms: number) {
  return new Promise<void>((resolve) => {
    delayResolve = resolve;
    delayTimer = setTimeout(() => {
      delayResolve = undefined;
      resolve();
    }, ms);
  });
}
function refreshEdge() {
  const distance = scroll.value?.scrollTop || 0;
  historyFrame.value?.style.setProperty(
    "--chat-edge",
    String(Math.min(1, Math.max(0, distance / 36))),
  );
}
function bottom() {
  void nextTick(() => {
    if (scroll.value) scroll.value.scrollTop = scroll.value.scrollHeight;
    refreshEdge();
  });
}
function close() {
  if (!closing) emit("update:modelValue", false);
}
function openedBall() {
  const el = ball.value;
  if (!el || !props.origin) return "translate3d(0,0,0) scale(1)";
  const target = el.getBoundingClientRect(),
    r = props.origin;
  return `translate3d(${r.left - target.left + (r.width - target.width) / 2}px,${r.top - target.top + (r.height - target.height) / 2}px,0) scale(${r.width / target.width})`;
}
function stopMotion() {
  controls.forEach((c) => c.stop());
  controls = [];
}
async function show() {
  cancel();
  closing = false;
  phase.value = "opening";
  loading.value = true;
  clearConfirm.value = false;
  present.value = true;
  document.documentElement.dataset.companionChat = "true";
  emit("present", true);
  lastFocus = document.activeElement as HTMLElement;
  await nextTick();
  fit();
  removeBack?.();
  removeBack = registerNativeBack(close);
  if (motionAllowed() && ball.value) {
    const initial = openedBall();
    ball.value.style.transform = initial;
    controls = [
      animate(
        ball.value,
        { transform: [initial, "translate3d(0,0,0) scale(1)"] },
        { ...motionTokens.settle, duration: 0.4 },
      ),
      ...([backdrop.value, surface.value].filter(Boolean) as HTMLElement[]).map(
        (el) => animate(el, { opacity: [0, 1] }, motionTokens.enter),
      ),
    ];
    await Promise.all(controls.map((c) => c.then(() => {})));
  }
  if (!present.value || closing) return;
  phase.value = "open";
  void load();
}
async function hide() {
  if (!present.value || closing) return;
  closing = true;
  cancel();
  phase.value = "closing";
  stopMotion();
  if (motionAllowed() && ball.value) {
    const from = getComputedStyle(ball.value).transform;
    ball.value.style.transform = "none";
    const goal = openedBall();
    ball.value.style.transform = from;
    controls = [
      animate(ball.value, { transform: [from, goal] }, motionTokens.drawer),
      ...([backdrop.value, surface.value].filter(Boolean) as HTMLElement[]).map(
        (el) =>
          animate(
            el,
            { opacity: [getComputedStyle(el).opacity, 0] },
            motionTokens.exit,
          ),
      ),
    ];
    await Promise.all(controls.map((c) => c.then(() => {})));
  }
  if (!closing) return;
  present.value = false;
  delete document.documentElement.dataset.companionChat;
  emit("present", false);
  removeBack?.();
  removeBack = undefined;
  lastFocus?.isConnected && lastFocus.focus({ preventScroll: true });
  closing = false;
}
async function load() {
  const generation = ++epoch;
  controller?.abort();
  const c = new AbortController();
  controller = c;
  loading.value = true;
  error.value = "";
  retry = null;
  try {
    const state = await api.state(c.signal);
    if (generation !== epoch || !props.modelValue) return;
    available.value = state.available;
    voiceAvailable.value = state.voice_available;
    items.value = state.messages.flatMap((m) =>
      m.messages.map((text, i) => ({
        id: `${m.request_id}:${m.role}:${i}`,
        role: m.role,
        text,
      })),
    );
    reminders.value = state.reminders;
    emotion.value = "39";
    if (!available.value) error.value = "球球还未接通AI服务";
    bottom();
  } catch (e) {
    if (generation === epoch && !c.signal.aborted)
      error.value = (e as Error).message;
  } finally {
    if (generation === epoch) loading.value = false;
  }
}
async function send(text: string, isRetry = false) {
  if (busy.value || loading.value || actionBusy.value || !available.value)
    return;
  const request = isRetry && retry ? retry : { text, id: crypto.randomUUID() };
  retry = request;
  const generation = ++epoch,
    c = new AbortController();
  controller?.abort();
  controller = c;
  busy.value = true;
  error.value = "";
  emotion.value = "30";
  awaiting.value = true;
  if (!isRetry)
    items.value.push({ id: request.id + ":user:0", role: "user", text });
  bottom();
  try {
    const reply = await api.send(request.text, request.id, c.signal);
    if (generation !== epoch) return;
    awaiting.value = false;
    emotion.value = reply.emotion;
    for (let i = 0; i < reply.messages.length; i++) {
      if (generation !== epoch) return;
      items.value.push({
        id: `${request.id}:assistant:${i}`,
        role: "assistant",
        text: reply.messages[i]!,
      });
      bottom();
      if (motionAllowed()) await pause(140);
    }
    if (generation === epoch && reply.reminder)
      reminders.value = [...reminders.value, reply.reminder];
    retry = null;
  } catch (e) {
    if (generation === epoch && !c.signal.aborted) {
      error.value = (e as Error).message;
      emotion.value = "12";
    }
  } finally {
    if (generation === epoch) {
      busy.value = false;
      awaiting.value = false;
    }
  }
}
async function transcribe(audio: string) {
  if (busy.value || actionBusy.value) return;
  const generation = ++epoch,
    c = new AbortController();
  controller?.abort();
  controller = c;
  busy.value = true;
  emotion.value = "16";
  error.value = "";
  try {
    const result = await api.voice(audio, c.signal);
    if (generation !== epoch) return;
    composer.value?.receive(result.text);
    emotion.value = "39";
  } catch (e) {
    if (generation === epoch && !c.signal.aborted)
      error.value = (e as Error).message;
  } finally {
    if (generation === epoch) busy.value = false;
  }
}
async function act(a: ChatReminder, action: "confirm" | "cancel") {
  if (actionBusy.value || busy.value || loading.value) return;
  const generation = epoch,
    c = new AbortController();
  controller = c;
  actionBusy.value = a.id;
  error.value = "";
  try {
    const result = await api.reminder(a.id, action, c.signal);
    if (generation !== epoch) return;
    a.status = result.status;
    items.value.push({
      id: crypto.randomUUID(),
      role: "assistant",
      text:
        result.status === "sent"
          ? "这条提醒已经发出"
          : result.status === "expired"
            ? "这条提醒已经过期"
            : result.status === "cancelled"
              ? "这条提醒已取消"
              : "好，到时提醒你们",
    });
    emotion.value = "10";
    bottom();
  } catch (e) {
    if (generation === epoch && !c.signal.aborted)
      error.value = (e as Error).message;
  } finally {
    if (generation === epoch) actionBusy.value = "";
  }
}
const clearConfirm = ref(false);
async function clear() {
  if (busy.value || loading.value || actionBusy.value) return;
  busy.value = true;
  error.value = "";
  const generation = epoch,
    c = new AbortController();
  controller = c;
  try {
    await api.clear(c.signal);
    if (generation === epoch) {
      items.value = [];
      reminders.value = reminders.value.filter((a) => a.status === "pending");
      retry = null;
      clearConfirm.value = false;
    }
  } catch (e) {
    if (generation === epoch && !c.signal.aborted)
      error.value = (e as Error).message;
  } finally {
    if (generation === epoch) busy.value = false;
  }
}
function inactive() {
  if (document.hidden) {
    cancel();
    emotion.value = "02";
  } else if (props.modelValue && phase.value === "open") void load();
}
const media = matchMedia("(prefers-reduced-motion: reduce)");
function quiet() {
  if (!motionAllowed()) {
    stopMotion();
    if (ball.value) ball.value.style.transform = "none";
    if (backdrop.value) backdrop.value.style.opacity = "1";
    if (surface.value) surface.value.style.opacity = "1";
    if (phase.value === "closing") {
      present.value = false;
      delete document.documentElement.dataset.companionChat;
      emit("present", false);
      removeBack?.();
      removeBack = undefined;
      lastFocus?.isConnected && lastFocus.focus({ preventScroll: true });
      closing = false;
    } else if (present.value) {
      phase.value = "open";
      if (!loading.value) void load();
    }
  }
}
watch(
  () => props.modelValue,
  (value) => {
    if (value) void show();
    else void hide();
  },
);
watch(scope, () => {
  cancel();
  items.value = [];
  reminders.value = [];
  retry = null;
  available.value = false;
  api = companionClient(props.invite, props.memberId, props.token);
  if (props.modelValue) close();
});
window.visualViewport?.addEventListener("resize", fit);
window.visualViewport?.addEventListener("scroll", fit);
document.addEventListener("visibilitychange", inactive);
media.addEventListener("change", quiet);
onBeforeUnmount(() => {
  delete document.documentElement.dataset.companionChat;
  cancel();
  stopMotion();
  removeBack?.();
  window.visualViewport?.removeEventListener("resize", fit);
  window.visualViewport?.removeEventListener("scroll", fit);
  document.removeEventListener("visibilitychange", inactive);
  media.removeEventListener("change", quiet);
});
function time(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
</script>
<template>
  <DialogRoot
    :open="present"
    @update:open="
      (value) => {
        if (!value) close();
      }
    "
    ><DialogPortal
      ><DialogOverlay as-child
        ><div ref="backdrop" class="companion-chat-backdrop" /></DialogOverlay
      ><DialogContent
        class="companion-chat"
        :style="{ top: viewport.top + 'px', height: viewport.height + 'px' }"
        :aria-describedby="undefined"
        @escape-key-down.prevent="close"
        @pointer-down-outside.prevent
        @interact-outside.prevent
        @open-auto-focus.prevent
        @close-auto-focus.prevent
      >
        <DialogTitle class="chat-sr-only">和球球聊天</DialogTitle
        ><DialogDescription class="chat-sr-only"
          >输入文字，或切换语音转文字。提醒安排需要确认后才保存。</DialogDescription
        >
        <div ref="ball" class="chat-ball" data-testid="chat-ball">
          <DormCompanion :size="88" :mood="emotion" :interactive="false" />
        </div>
        <div
          ref="surface"
          class="chat-surface"
          :inert="phase === 'closing' ? true : undefined"
        >
          <header class="chat-toolbar">
            <button
              type="button"
              aria-label="清空聊天记录"
              :disabled="busy || loading || !!actionBusy"
              @click="clearConfirm = !clearConfirm"
            >
              <van-icon name="delete-o" /></button
            ><button type="button" aria-label="关闭球球聊天" @click="close">
              <van-icon name="cross" />
            </button>
          </header>
          <div ref="historyFrame" class="chat-history-frame">
            <div
              ref="scroll"
              class="chat-history"
              @scroll.passive="refreshEdge"
              data-native-scroll
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              data-testid="chat-history"
            >
              <div
                v-if="loading"
                class="chat-loading"
                aria-label="正在读取聊天"
              >
                <span /><span />
              </div>
              <div v-if="clearConfirm" class="chat-confirm">
                <p>清空这段聊天？</p>
                <div>
                  <button @click="clearConfirm = false">保留</button
                  ><button :disabled="busy" @click="clear">清空</button>
                </div>
              </div>
              <motion.div
                v-for="item in items"
                :key="item.id"
                class="chat-bubble"
                :class="item.role"
                :initial="
                  motionAllowed() ? { opacity: 0, y: 10, scale: 0.94 } : false
                "
                :animate="{ opacity: 1, y: 0, scale: 1 }"
                :transition="motionTransition"
                >{{ item.text }}</motion.div
              >
              <motion.div
                v-if="thinking"
                key="thinking"
                class="chat-bubble assistant chat-thinking"
                :initial="motionAllowed() ? { opacity: 0, scale: 0.94 } : false"
                :animate="{ opacity: 1, scale: 1 }"
                :transition="motionTransition"
                ><span>让我想一想</span><i /><i /><i
              /></motion.div>
              <motion.div
                v-for="a in reminders.filter(
                  (a) => a.status === 'proposed' || a.status === 'pending',
                )"
                :key="a.id"
                class="chat-reminder"
                :initial="
                  motionAllowed() ? { opacity: 0, y: 10, scale: 0.96 } : false
                "
                :animate="{ opacity: 1, y: 0, scale: 1 }"
                :transition="motionTransition"
                ><span>{{
                  a.status === "pending" ? "已安排提醒" : "确认提醒"
                }}</span
                ><strong>{{ a.target_name }}</strong>
                <p>{{ a.text }}</p>
                <time>{{ time(a.due_at) }} · 北京时间</time>
                <div>
                  <button
                    :disabled="!!actionBusy || busy"
                    @click="act(a, 'cancel')"
                  >
                    {{ a.status === "pending" ? "取消提醒" : "不安排" }}</button
                  ><button
                    v-if="a.status === 'proposed'"
                    class="chat-primary"
                    :disabled="!!actionBusy || busy"
                    @click="act(a, 'confirm')"
                  >
                    {{ actionBusy === a.id ? "正在保存…" : "确认安排" }}
                  </button>
                </div></motion.div
              >
              <div
                v-if="!loading && !items.length && !error"
                class="chat-empty"
              >
                有事就问球球。
              </div>
            </div>
            <div
              class="chat-top-frost"
              aria-hidden="true"
              data-testid="chat-top-frost"
            >
              <i /><i /><i /><i /><i />
            </div>
          </div>
          <footer class="chat-footer">
            <div v-if="error" class="chat-error" role="alert">
              <span>{{ error }}</span
              ><button v-if="retry && !busy" @click="send(retry.text, true)">
                重试</button
              ><button v-else-if="!available && !loading" @click="load">
                重试连接
              </button>
            </div>
            <CompanionChatComposer
              ref="composer"
              :busy="busy || loading || !!actionBusy"
              :enabled="available && !loading && phase === 'open'"
              :voice-enabled="voiceAvailable"
              @send="send"
              @audio="transcribe"
              @error="error = $event"
              @recording="
                recording = $event;
                emotion = $event ? '16' : '30';
              "
            />
          </footer>
        </div> </DialogContent></DialogPortal
  ></DialogRoot>
</template>
<style scoped>
/* Static page frost also covers WebKit compositors that drop backdrop blur
   across fixed/contained siblings. Only the chat presence owns this state. */
:global(html[data-companion-chat="true"] .app-stage),
:global(html[data-companion-chat="true"] .chore-bottom-nav) {
  filter: blur(5px);
}

.companion-chat-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2100;
  background: #0005;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.companion-chat {
  --chat-glass: color-mix(in srgb, var(--ui-surface) 82%, transparent);
  position: fixed;
  inset-inline: 0;
  max-width: 520px;
  margin: auto;
  z-index: 2101;
  outline: 0;
  color: var(--ui-ink);
  --chat-ball-top: max(48px, calc(env(safe-area-inset-top) + 28px));
}
.chat-ball {
  position: absolute;
  top: var(--chat-ball-top);
  left: calc(50% - 44px);
  width: 88px;
  height: 88px;
  z-index: 2;
  transform-origin: center;
}
.chat-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0 20px max(18px, env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.chat-toolbar {
  display: flex;
  justify-content: space-between;
  flex: none;
  padding-top: max(18px, env(safe-area-inset-top));
  height: calc(var(--chat-ball-top) + 104px);
  box-sizing: border-box;
}
.chat-toolbar button {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid #ffffff30;
  background: var(--chat-glass);
  color: var(--ui-ink);
  font-size: 20px;
  display: grid;
  place-items: center;
}
.chat-history-frame {
  --chat-edge: 0;
  position: relative;
  flex: 1;
  min-height: 0;
  margin: 0 -4px;
}
.chat-top-frost {
  position: absolute;
  z-index: 2;
  inset: 0 0 auto;
  height: clamp(40px, 9dvh, 72px);
  pointer-events: none;
  opacity: var(--chat-edge);
}
.chat-top-frost i {
  position: absolute;
  inset: 0;
  display: block;
}
.chat-top-frost i:nth-child(1) {
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  mask-image: linear-gradient(#000 0%, #000 50%, transparent);
  -webkit-mask-image: linear-gradient(#000 0%, #000 50%, transparent);
}
.chat-top-frost i:nth-child(2) {
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  mask-image: linear-gradient(#000 0%, #000 28%, transparent 85%);
  -webkit-mask-image: linear-gradient(#000 0%, #000 28%, transparent 85%);
}
.chat-top-frost i:nth-child(3) {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  mask-image: linear-gradient(#000 0%, transparent 65%);
  -webkit-mask-image: linear-gradient(#000 0%, transparent 65%);
}
.chat-top-frost i:nth-child(4) {
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  mask-image: linear-gradient(#000 0%, transparent 42%);
  -webkit-mask-image: linear-gradient(#000 0%, transparent 42%);
}
.chat-top-frost i:nth-child(5) {
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  mask-image: linear-gradient(#000 0%, transparent 24%);
  -webkit-mask-image: linear-gradient(#000 0%, transparent 24%);
}
.chat-history {
  height: 100%;
  box-sizing: border-box;
  mask-image: linear-gradient(
    to bottom,
    rgb(0 0 0 / calc(1 - var(--chat-edge))) 0px,
    #000 48px
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    rgb(0 0 0 / calc(1 - var(--chat-edge))) 0px,
    #000 48px
  );
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 4px 22px;
  margin: 0;
}
.chat-history::-webkit-scrollbar {
  display: none;
}
.chat-bubble {
  max-width: 85%;
  padding: 12px 16px;
  border-radius: 20px 20px 20px 7px;
  background: var(--chat-glass);
  border: 1px solid #ffffff40;
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  transform-origin: bottom left;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.chat-bubble.user {
  align-self: flex-end;
  border-radius: 20px 20px 7px 20px;
  background: color-mix(in srgb, var(--ui-surface-muted) 88%, transparent);
  transform-origin: bottom right;
}
.chat-thinking {
  display: flex;
  align-items: center;
  gap: 4px;
}
.chat-thinking span {
  margin-right: 5px;
}
.chat-thinking i {
  width: 4px;
  height: 4px;
  background: currentColor;
  border-radius: 50%;
  animation: chat-think 900ms ease-in-out infinite alternate;
}
.chat-thinking i:nth-last-child(2) {
  animation-delay: 140ms;
}
.chat-thinking i:last-child {
  animation-delay: 280ms;
}
@keyframes chat-think {
  to {
    transform: translateY(-3px);
    opacity: 0.35;
  }
}
.chat-footer {
  flex: none;
  padding-top: 8px;
}
.chat-error {
  margin-bottom: 12px;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--chat-glass);
  border-radius: 16px;
  font-size: 14px;
}
.chat-error button {
  white-space: nowrap;
}
.chat-empty {
  margin: auto;
  align-self: center;
  font-size: 18px;
  color: var(--ui-ink);
}
.chat-reminder,
.chat-confirm {
  display: grid;
  gap: 10px;
  align-self: stretch;
  padding: 18px;
  border-radius: 20px;
  background: var(--chat-glass);
  border: 1px solid #ffffff55;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.chat-reminder > span,
.chat-reminder time {
  font-size: 14px;
  color: var(--ui-text-muted);
}
.chat-reminder strong {
  font-size: 20px;
}
.chat-reminder p,
.chat-confirm p {
  margin: 0;
  line-height: 1.5;
}
.chat-reminder > div,
.chat-confirm > div {
  display: flex;
  gap: 12px;
}
.chat-reminder button,
.chat-confirm button {
  border: 0;
  border-radius: 20px;
  padding: 10px 16px;
  background: var(--ui-surface-muted);
  color: var(--ui-ink);
  font: inherit;
  flex: 1;
}
.chat-reminder .chat-primary {
  background: #111;
  color: white;
}
.companion-chat button {
  cursor: pointer;
  transition: transform var(--ui-release-time) var(--ui-ease-overshoot);
}
.companion-chat button:active:not(:disabled) {
  transform: scale(0.96);
  transition-duration: 90ms;
}
.companion-chat button:disabled {
  opacity: 0.45;
  cursor: default;
}
.chat-error button {
  border: 0;
  background: none;
  color: inherit;
  text-decoration: underline;
  font: inherit;
}
.chat-loading {
  width: 75%;
  display: grid;
  gap: 12px;
}
.chat-loading span {
  height: 48px;
  border-radius: 18px;
  background: var(--chat-glass);
  animation: chat-think 900ms ease-in-out infinite alternate;
}
.chat-loading span:last-child {
  width: 75%;
}
.chat-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
@media (max-height: 600px) {
  .companion-chat {
    --chat-ball-top: max(18px, env(safe-area-inset-top));
  }
  .chat-ball {
    width: 64px;
    height: 64px;
    left: calc(50% - 32px);
  }
  .chat-ball :deep(.companion-frame),
  .chat-ball :deep(.dorm-companion) {
    width: 64px !important;
    height: 64px !important;
  }
  .chat-toolbar {
    height: calc(var(--chat-ball-top) + 74px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .chat-thinking i,
  .chat-loading span {
    animation: none;
  }
  .companion-chat button {
    transition: none;
  }
}
@media (prefers-reduced-transparency: reduce) {
  :global(html[data-companion-chat="true"] .app-stage),
  :global(html[data-companion-chat="true"] .chore-bottom-nav) {
    filter: none;
  }
  .chat-top-frost {
    display: none;
  }
  .companion-chat-backdrop {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .chat-bubble,
  .chat-reminder,
  .chat-confirm {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: var(--ui-surface);
  }
}
</style>
