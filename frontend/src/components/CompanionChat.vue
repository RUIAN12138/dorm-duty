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
  toolbar = ref<HTMLElement>(),
  footer = ref<HTMLElement>(),
  masthead = ref<HTMLElement>(),
  historyContent = ref<HTMLElement>(),
  backdrop = ref<HTMLElement>(),
  scroll = ref<HTMLElement>(),
  historyFrame = ref<HTMLElement>(),
  composer = ref<InstanceType<typeof CompanionChatComposer>>();
const available = ref(false),
  loading = ref(false),
  busy = ref(false),
  awaiting = ref(false),
  error = ref(""),
  emotion = ref("02"),
  items = ref<{ id: string; role: "user" | "assistant"; text: string }[]>([]),
  reminders = ref<ChatReminder[]>([]),
  actionBusy = ref("");
const viewport = ref({ top: 0, height: window.innerHeight }),
  keyboardOpen = ref(false),
  compactViewport = computed(
    () => keyboardOpen.value || viewport.value.height < 560,
  ),
  thinking = computed(() => awaiting.value);
let api = companionClient(props.invite, props.memberId, props.token),
  epoch = 0,
  controller: AbortController | undefined,
  removeBack: (() => void) | undefined,
  closing = false,
  motionEpoch = 0,
  originTransform = "none",
  restingHeight = window.innerHeight,
  viewportFrame = 0,
  errorTimer: ReturnType<typeof setTimeout> | undefined,
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
  if (closing) return;
  const el = scroll.value;
  const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  const v = window.visualViewport;
  viewport.value = {
    top: v?.offsetTop || 0,
    height: v?.height || window.innerHeight,
  };
  const focused =
    surface.value?.contains(document.activeElement) &&
    document.activeElement?.tagName === "TEXTAREA";
  if (!focused) restingHeight = Math.max(restingHeight, viewport.value.height);
  keyboardOpen.value = !!focused && restingHeight - viewport.value.height > 110;
  if (present.value && atBottom) bottom();
}
function scheduleFit() {
  cancelAnimationFrame(viewportFrame);
  viewportFrame = requestAnimationFrame(fit);
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
    if (scroll.value && !closing)
      scroll.value.scrollTop = scroll.value.scrollHeight;
    refreshEdge();
  });
}
function close() {
  if (!closing) emit("update:modelValue", false);
}
function openedBall() {
  const el = ball.value;
  if (!el || !props.origin) return "translate3d(0,0,0) scale(1)";
  const target = (
      el.querySelector(".chat-ball-visual") || el
    ).getBoundingClientRect(),
    r = props.origin;
  return `translate3d(${r.left - target.left + (r.width - target.width) / 2}px,${r.top - target.top + (r.height - target.height) / 2}px,0) scale(${r.width / target.width})`;
}
function stopMotion() {
  controls.forEach((c) => c.stop());
  controls = [];
}
const entryParts = () =>
  [toolbar.value, historyFrame.value, footer.value].filter(
    Boolean,
  ) as HTMLElement[];
const ballTravel = { type: "spring" as const, duration: 0.42, bounce: 0.08 };
const travel = {
  type: "spring" as const,
  stiffness: 260,
  damping: 29,
  mass: 1,
  restDelta: 0.001,
  restSpeed: 0.01,
};
function finishClose() {
  present.value = false;
  delete document.documentElement.dataset.companionChat;
  emit("present", false);
  removeBack?.();
  removeBack = undefined;
  lastFocus?.isConnected && lastFocus.focus({ preventScroll: true });
  closing = false;
}
async function show() {
  const generation = ++motionEpoch;
  const wasPresent = present.value;
  stopMotion();
  cancel();
  endPull(true);
  closing = false;
  phase.value = "opening";
  loading.value = true;
  restingHeight = Math.max(
    window.innerHeight,
    window.visualViewport?.height || 0,
  );
  clearConfirm.value = false;
  present.value = true;
  document.documentElement.dataset.companionChat = "true";
  emit("present", true);
  if (!wasPresent) lastFocus = document.activeElement as HTMLElement;
  await nextTick();
  fit();
  await nextTick();
  removeBack?.();
  removeBack = registerNativeBack(close);
  if (!wasPresent) originTransform = openedBall();
  if (motionAllowed() && ball.value) {
    const initial = wasPresent
      ? getComputedStyle(ball.value).transform
      : originTransform;
    ball.value.style.transform = initial;
    controls = [
      animate(
        ball.value,
        { transform: [initial, "translate3d(0,0,0) scale(1)"] },
        ballTravel,
      ),
      ...(
        [backdrop.value, masthead.value].filter(Boolean) as HTMLElement[]
      ).map((el) =>
        animate(
          el,
          {
            opacity: [wasPresent ? Number(getComputedStyle(el).opacity) : 0, 1],
          },
          { duration: 0.32 },
        ),
      ),
      ...entryParts().map((el, index) =>
        animate(
          el,
          {
            opacity: [wasPresent ? Number(getComputedStyle(el).opacity) : 0, 1],
            transform: [
              wasPresent
                ? getComputedStyle(el).transform
                : "translate3d(0,12px,0) scale(.985)",
              "translate3d(0,0,0) scale(1)",
            ],
          },
          {
            ...motionTokens.enter,
            duration: 0.32,
            delay: 0.08 + index * 0.055,
          },
        ),
      ),
    ];
  }
  void load();
  await Promise.all(controls.map((c) => c.then(() => {})));
  if (generation !== motionEpoch || !present.value || closing) return;
  phase.value = "open";
}
async function hide() {
  if (!present.value || closing) return;
  const generation = ++motionEpoch;
  closing = true;
  cancel();
  endPull(true);
  phase.value = "closing";
  stopMotion();
  // Release the extra WebKit fallback under an opaque frosted backdrop, so
  // the page sharpens as that backdrop fades rather than snapping at unmount.
  document.documentElement.dataset.companionChat = "closing";
  composer.value?.dismiss();
  if (motionAllowed() && ball.value) {
    const from = getComputedStyle(ball.value).transform;
    ball.value.style.transform = "none";
    const goal = openedBall();
    ball.value.style.transform = from;
    controls = [
      animate(
        ball.value,
        {
          transform: [from, goal],
        },
        { ...ballTravel, duration: 0.38 },
      ),
      ...(
        [backdrop.value, masthead.value].filter(Boolean) as HTMLElement[]
      ).map((el) =>
        animate(
          el,
          { opacity: [Number(getComputedStyle(el).opacity), 0] },
          { duration: 0.34, delay: 0.02 },
        ),
      ),
      ...entryParts()
        .reverse()
        .map((el, index) =>
          animate(
            el,
            {
              opacity: [Number(getComputedStyle(el).opacity), 0],
              transform: [
                getComputedStyle(el).transform,
                "translate3d(0,10px,0) scale(.985)",
              ],
            },
            { ...motionTokens.exit, duration: 0.22, delay: index * 0.035 },
          ),
        ),
    ];
    await Promise.all(controls.map((c) => c.then(() => {})));
  }
  if (generation !== motionEpoch || !closing) return;
  finishClose();
}
// Only boundary pulls are intercepted. Normal scrolling, text selection and
// horizontal intent remain native; the timeline keeps a single transform owner.
let pull: { x: number; y: number; top: boolean; bottom: boolean } | null = null;
let pullControl: ReturnType<typeof animate> | undefined;
function startPull(event: TouchEvent | PointerEvent) {
  if ("pointerType" in event && event.pointerType === "touch") return;
  if ((event.target as HTMLElement).closest("button,textarea,input,a")) return;
  const point = "touches" in event ? event.touches[0] : event;
  if (!point || !scroll.value || phase.value !== "open") return;
  const el = scroll.value;
  pullControl?.stop();
  pull = {
    x: point.clientX,
    y: point.clientY,
    top: el.scrollTop <= 1,
    bottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
  };
}
function movePull(event: TouchEvent | PointerEvent) {
  if ("pointerType" in event && event.pointerType === "touch") return;
  if (!pull || !historyContent.value) return;
  const point = "touches" in event ? event.touches[0] : event;
  if (!point) return;
  const dy = point.clientY - pull.y,
    dx = point.clientX - pull.x;
  if (Math.abs(dx) > 8 && Math.abs(dx) >= Math.abs(dy)) return endPull();
  if (Math.abs(dy) < 6 || !((dy > 0 && pull.top) || (dy < 0 && pull.bottom)))
    return;
  if (event.cancelable) event.preventDefault();
  if (!motionAllowed()) return;
  const offset = (dy * 0.52) / (1 + Math.abs(dy) / 150);
  historyContent.value.style.transform = `translate3d(0,${offset}px,0) scaleX(${1 - Math.abs(offset) * 0.00012})`;
}
function endPointerPull(event: PointerEvent) {
  if (event.pointerType !== "touch") endPull();
}
function endPull(immediate = false) {
  pull = null;
  if (!historyContent.value) return;
  pullControl?.stop();
  if (immediate || !motionAllowed())
    historyContent.value.style.transform = "none";
  else
    pullControl = animate(
      historyContent.value,
      {
        transform: [
          getComputedStyle(historyContent.value).transform,
          "translate3d(0,0,0) scaleX(1)",
        ],
      },
      travel,
    );
}
const quickPrompts = ["今天做什么？", "怎么改轮序？", "帮我设提醒"];
const hasConversation = computed(() =>
  items.value.some((item) => !item.id.startsWith("welcome:")),
);
async function welcome(generation: number) {
  const messages = [
    "我在，想问什么？",
    "值日、抬水都可以问我。",
    "也能帮你安排提醒。",
  ];
  for (const [index, text] of messages.entries()) {
    if (generation !== epoch || !props.modelValue) return;
    items.value.push({ id: "welcome:" + index, role: "assistant", text });
    bottom();
    if (motionAllowed()) await pause(160);
  }
}
watch(error, (message) => {
  clearTimeout(errorTimer);
  if (message)
    errorTimer = setTimeout(() => {
      error.value = "";
    }, 5500);
});

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
    if (!items.value.length && available.value) await welcome(generation);
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
function requestClear() {
  clearConfirm.value = !clearConfirm.value;
  if (clearConfirm.value)
    void nextTick(() => {
      if (scroll.value) scroll.value.scrollTop = 0;
    });
}
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
      await welcome(generation);
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
    quiet();
    emotion.value = "02";
  } else if (props.modelValue && phase.value === "open") void load();
}
const media = matchMedia("(prefers-reduced-motion: reduce)");
function quiet() {
  if (!motionAllowed()) {
    motionEpoch++;
    stopMotion();
    endPull(true);
    if (ball.value) ball.value.style.transform = "none";
    for (const el of [backdrop.value, masthead.value, ...entryParts()]) {
      if (el) {
        el.style.opacity = "1";
        el.style.transform = "none";
      }
    }
    if (phase.value === "closing") finishClose();
    else if (present.value) phase.value = "open";
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
window.visualViewport?.addEventListener("resize", scheduleFit);
window.addEventListener("resize", scheduleFit);
window.visualViewport?.addEventListener("scroll", scheduleFit);
document.addEventListener("visibilitychange", inactive);
media.addEventListener("change", quiet);
onBeforeUnmount(() => {
  delete document.documentElement.dataset.companionChat;
  cancel();
  motionEpoch++;
  stopMotion();
  endPull(true);
  clearTimeout(errorTimer);
  removeBack?.();
  window.visualViewport?.removeEventListener("resize", scheduleFit);
  window.removeEventListener("resize", scheduleFit);
  cancelAnimationFrame(viewportFrame);
  window.visualViewport?.removeEventListener("scroll", scheduleFit);
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
        ><div class="companion-chat-overlay">
          <div
            ref="backdrop"
            class="companion-chat-backdrop"
          /></div></DialogOverlay
      ><DialogContent
        class="companion-chat"
        :class="{ 'is-compact': compactViewport, 'is-keyboard': keyboardOpen }"
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
          >输入文字与球球聊天。提醒安排需要确认后才保存。</DialogDescription
        >
        <div ref="masthead" class="chat-masthead" aria-hidden="true" />
        <div ref="ball" class="chat-ball" data-testid="chat-ball">
          <div class="chat-ball-visual">
            <DormCompanion
              :size="88"
              :mood="emotion"
              :interactive="true"
              intent="play"
              :tips="false"
            />
          </div>
        </div>
        <div
          ref="surface"
          class="chat-surface"
          :inert="phase === 'closing' ? true : undefined"
        >
          <header ref="toolbar" class="chat-toolbar">
            <button type="button" aria-label="返回宿舍" @click="close">
              <van-icon name="arrow-left" />
            </button>
          </header>
          <div ref="historyFrame" class="chat-history-frame">
            <div
              ref="scroll"
              class="chat-history"
              @scroll.passive="refreshEdge"
              @touchstart.passive="startPull"
              @touchmove="movePull"
              @touchend="endPull()"
              @touchcancel="endPull()"
              @pointerdown="startPull"
              @pointermove="movePull"
              @pointerup="endPointerPull"
              @pointercancel="endPointerPull"
              @pointerleave="endPointerPull"
              data-native-scroll
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              data-testid="chat-history"
            >
              <div ref="historyContent" class="chat-history-content">
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
                  aria-label="球球正在思考"
                  role="status"
                  :initial="
                    motionAllowed() ? { opacity: 0, scale: 0.94 } : false
                  "
                  :animate="{ opacity: 1, scale: 1 }"
                  :transition="motionTransition"
                  ><i /><i /><i
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
                      {{
                        a.status === "pending" ? "取消提醒" : "不安排"
                      }}</button
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
                  v-if="!loading && !hasConversation"
                  class="chat-quick-prompts"
                >
                  <button
                    v-for="prompt in quickPrompts"
                    :key="prompt"
                    :disabled="busy || !available"
                    @click="send(prompt)"
                  >
                    {{ prompt }}
                  </button>
                </div>
                <button
                  v-if="hasConversation"
                  class="chat-clear"
                  aria-label="清空聊天记录"
                  :disabled="busy || loading || !!actionBusy"
                  @click="requestClear"
                >
                  清空聊天
                </button>
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
          <footer ref="footer" class="chat-footer">
            <CompanionChatComposer
              ref="composer"
              :busy="busy || loading || !!actionBusy"
              :enabled="available && !loading && phase === 'open'"
              @focus="scheduleFit"
              @resize="bottom"
              @send="send"
            />
          </footer>
          <Transition name="chat-error">
            <div v-if="error" class="chat-error" role="alert">
              <span>{{ error }}</span
              ><button v-if="retry && !busy" @click="send(retry.text, true)">
                重试
              </button>
              <button v-else-if="!available && !loading" @click="load">
                重试连接
              </button>
            </div>
          </Transition>
        </div>
      </DialogContent></DialogPortal
    ></DialogRoot
  >
</template>
<style scoped>
/* Static page frost also covers WebKit compositors that drop backdrop blur
   across fixed/contained siblings. Only the chat presence owns this state. */
:global(html[data-companion-chat="true"] .app-stage),
:global(html[data-companion-chat="true"] .chore-bottom-nav) {
  filter: blur(5px);
}

.companion-chat-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
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
.chat-masthead {
  position: absolute;
  inset: 0 0 auto;
  height: calc(var(--chat-ball-top) + 160px);
  border-radius: 0 0 32px 32px;
  background: color-mix(in srgb, var(--ui-surface) 74%, transparent);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  mask-image: linear-gradient(#000 60%, transparent);
  -webkit-mask-image: linear-gradient(#000 60%, transparent);
  pointer-events: none;
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
  padding: 0 20px max(58px, calc(env(safe-area-inset-bottom) + 34px));
  position: relative;
  z-index: 1;
  box-sizing: border-box;
}
.chat-toolbar {
  display: flex;
  justify-content: flex-start;
  flex: none;
  padding-top: max(18px, env(safe-area-inset-top));
  height: calc(var(--chat-ball-top) + 104px);
  box-sizing: border-box;
}
.chat-toolbar button {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 0;
  background: transparent;
  color: var(--ui-ink);
  font-size: 26px;
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
  display: block;
  padding: 16px 4px 22px;
  margin: 0;
}
.chat-history-content {
  min-height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  transform-origin: center top;
}
.chat-quick-prompts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}
.chat-quick-prompts button {
  border: 1px solid #ffffff55;
  border-radius: 20px;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  color: var(--ui-ink);
  background: var(--chat-glass);
}
.chat-clear {
  align-self: center;
  border: 0;
  padding: 12px;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 13px;
  background: none;
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
  gap: 5px;
  min-height: 28px;
  padding-inline: 18px;
}
.chat-thinking i {
  display: block;
  width: 3px;
  height: 18px;
  background: currentColor;
  border-radius: 3px;
  transform-origin: center;
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
    transform: translateY(-4px) scaleY(0.65);
    opacity: 0.35;
  }
}
.chat-footer {
  flex: none;
  padding-top: 8px;
}
.chat-error {
  position: absolute;
  z-index: 5;
  left: 12px;
  right: 12px;
  bottom: max(172px, calc(env(safe-area-inset-bottom) + 154px));
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 22px;
  min-height: 76px;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--ui-surface) 96%, transparent);
  border: 1px solid #ffffff60;
  border-radius: 24px;
  font-size: 16px;
  line-height: 1.5;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}
.chat-error button {
  white-space: nowrap;
}
.chat-error-enter-active {
  transition:
    transform 360ms cubic-bezier(0.22, 1.3, 0.36, 1),
    opacity 220ms ease-out;
}
.chat-error-leave-active {
  transition:
    transform 220ms var(--ui-ease-out),
    opacity 180ms ease-out;
}
.chat-error-enter-from,
.chat-error-leave-to {
  transform: translateY(12px) scale(0.96);
  opacity: 0;
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
.chat-ball-visual {
  width: 88px;
  height: 88px;
  transform-origin: center top;
  transition: transform 220ms var(--ui-ease-out);
}
.is-compact {
  --chat-ball-top: 18px;
}
.is-compact .chat-ball-visual {
  transform: scale(0.64);
}
.is-compact .chat-toolbar {
  height: 90px;
  padding-top: 12px;
}
.is-compact .chat-masthead {
  height: 125px;
}
.is-compact .chat-surface {
  padding-bottom: 12px;
}
.is-compact .chat-history {
  padding-top: 8px;
  padding-bottom: 12px;
}
.is-compact .chat-top-frost {
  height: 32px;
}
.is-compact .chat-error {
  bottom: 94px;
  min-height: 64px;
  padding: 16px 20px;
}
@media (prefers-reduced-motion: reduce) {
  .chat-thinking i,
  .chat-loading span {
    animation: none;
  }
  .chat-ball-visual,
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
  .chat-masthead,
  .chat-error,
  .chat-bubble,
  .chat-reminder,
  .chat-confirm {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: var(--ui-surface);
  }
}
</style>
