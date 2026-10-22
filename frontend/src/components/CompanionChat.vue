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
import { animate, motion, AnimatePresence } from "motion-v";
import DormCompanion from "./DormCompanion.vue";
import CompanionChatComposer from "./CompanionChatComposer.vue";
import ConversationNoteFlow from "./ConversationNoteFlow.vue";
import { useConversationNotes } from "../composables/useConversationNotes";
import type { ChoreMember } from "../api/chores";
import {
  companionClient,
  chatRequestId,
  type ChatReminder,
} from "../api/companionChat";
import { motionAllowed } from "../interaction/motion";
import {
  chatMotion,
  chatTransition,
  bubbleOrigin,
} from "../interaction/chatMotion";
import { createChatScroll } from "../interaction/chatScroll";
import { createChatTravel } from "../interaction/chatTravel";
import { registerNativeBack } from "../interactions/nativeBack";
import { horizontalIntent, rubberBand } from "../interaction/gestures";
const props = defineProps<{
  modelValue: boolean;
  origin: DOMRect | null;
  returnRect?: () => DOMRect | null;
  members?: ChoreMember[];
  noteRequest?: { key: number; target: number };
  invite: string;
  memberId: number;
  token: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  present: [value: boolean];
  noteSent: [];
}>();
const present = ref(false),
  prepared = ref(false),
  phase = ref<"opening" | "open" | "closing">("opening"),
  ball = ref<HTMLElement>(),
  nameplate = ref<HTMLElement>(),
  surface = ref<HTMLElement>(),
  toolbar = ref<HTMLElement>(),
  footer = ref<HTMLElement>(),
  masthead = ref<HTMLElement>(),
  historyContent = ref<HTMLElement>(),
  backdrop = ref<HTMLElement>(),
  scroll = ref<HTMLElement>(),
  historyFrame = ref<HTMLElement>(),
  composer = ref<InstanceType<typeof CompanionChatComposer>>();
const draft = ref("");
let loaded = false;
const available = ref(false),
  loading = ref(false),
  busy = ref(false),
  awaiting = ref(false),
  error = ref(""),
  emotion = ref("02"),
  items = ref<
    {
      id: string;
      role: "user" | "assistant";
      text: string;
      fresh?: boolean;
    }[]
  >([]),
  reminders = ref<ChatReminder[]>([]),
  actionBusy = ref("");
const viewport = ref({ top: 0, height: window.innerHeight }),
  keyboardOpen = ref(false),
  compactViewport = computed(
    () => keyboardOpen.value || viewport.value.height < 560,
  ),
  thinking = computed(() => awaiting.value || notes.sending.value);
let api = companionClient(props.invite, props.memberId, props.token),
  epoch = 0,
  controller: AbortController | undefined,
  removeBack: (() => void) | undefined,
  closing = false,
  motionEpoch = 0,
  restingHeight = window.innerHeight,
  viewportFrame = 0,
  errorTimer: ReturnType<typeof setTimeout> | undefined,
  lastFocus: HTMLElement | null = null,
  delayTimer: ReturnType<typeof setTimeout> | undefined,
  delayResolve: (() => void) | undefined;
let retry: { text: string; id: string } | null = null;
let entryPointerPending = true;
function chatPointerStarted() {
  entryPointerPending = false;
}
function chatEntryClick(event: MouseEvent) {
  // Safari may retarget the opening long press's release to the newly mounted
  // back button. Only accept a pointer click whose press began inside chat.
  if (entryPointerPending && event.detail > 0) {
    event.preventDefault();
    event.stopPropagation();
  }
}
const scope = () => `${props.invite}:${props.memberId}:${props.token}`;
const notes = useConversationNotes(
  () => ({
    token: props.token,
    invite: props.invite,
    memberId: props.memberId,
    members: props.members || [],
  }),
  (role, text) => {
    items.value.push({
      id: `note:${chatRequestId()}`,
      role,
      text,
      fresh: true,
    });
    bottom();
  },
  () => emit("noteSent"),
);
watch(
  () => props.noteRequest?.key,
  () => {
    if (props.noteRequest)
      void notes.dispatch({ type: "start", target: props.noteRequest.target });
  },
);
watch(notes.sending, (sending) => {
  emotion.value = sending
    ? "30"
    : notes.state.value.phase === "sent"
      ? "39"
      : "12";
});
const motionTransition = computed(() => chatTransition("bubble"));
function fit() {
  if (closing) return;
  const el = scroll.value;
  const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  const v = window.visualViewport;
  const nextTop = v?.offsetTop || 0;
  const nextHeight = v?.height || window.innerHeight;
  const focused =
    surface.value?.contains(document.activeElement) &&
    document.activeElement?.tagName === "TEXTAREA";
  if (!focused) restingHeight = Math.max(restingHeight, nextHeight);
  const nextKeyboard = !!focused && restingHeight - nextHeight > 110;
  const nextCompact = nextKeyboard || nextHeight < 560;
  // The compact class changes the history's padding, which moves the content
  // under the reader. Capture before Vue applies the class and restore after
  // the layout has been committed.
  const compactChanged = nextCompact !== compactViewport.value;
  if (compactChanged && !atBottom) historyScroll.capture();
  viewport.value = { top: nextTop, height: nextHeight };
  keyboardOpen.value = nextKeyboard;
  if (present.value) {
    // Viewport changes can move the source ball or the compact visual; one
    // cached measurement here keeps the travel render free of layout reads.
    chatTravel.measure();
    if (atBottom) bottom(true);
    else if (compactChanged) void nextTick(() => historyScroll.restore());
  }
}
function scheduleFit() {
  cancelAnimationFrame(viewportFrame);
  viewportFrame = requestAnimationFrame(fit);
}
let footerObserver: ResizeObserver | undefined;
watch(footer, (element) => {
  footerObserver?.disconnect();
  if (!element) return;
  footerObserver = new ResizeObserver(() => {
    const history = scroll.value;
    const wasAtBottom =
      !history ||
      history.scrollHeight - history.scrollTop - history.clientHeight < 60;
    surface.value?.style.setProperty(
      "--chat-footer-height",
      `${element.offsetHeight}px`,
    );
    surface.value?.style.setProperty(
      "--chat-input-height",
      `${element.querySelector<HTMLElement>(".chat-composer")?.offsetHeight || 58}px`,
    );
    if (wasAtBottom) bottom(true);
    else {
      // Footer/keyboard padding changes can shrink the scrollable range even
      // when the content box itself did not resize.
      historyScroll.restore();
      refreshEdge();
    }
  });
  footerObserver.observe(element);
});

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
const historyScroll = createChatScroll(
  () => scroll.value,
  refreshEdge,
  () => historyContent.value,
);
function bottom(immediate = false) {
  void nextTick(() => {
    if (!closing) historyScroll.request(immediate);
  });
}
function historyScrolled() {
  historyScroll.scroll();
}
function close() {
  if (!closing) emit("update:modelValue", false);
}
const glassParts = () =>
  [backdrop.value, ...(masthead.value?.children || [])].filter(
    Boolean,
  ) as HTMLElement[];
const entryParts = () =>
  [toolbar.value, nameplate.value, historyFrame.value, footer.value].filter(
    Boolean,
  ) as HTMLElement[];
const ENTRY_STAGGER = 0.06;
// One opacity stage drives the backdrop, all four frost layers and the short
// overlapping content entry. It is interruptible because it is a persistent
// MotionValue, not a one-shot keyframe list.
function paintReveal(value: number) {
  const progress = Math.max(0, Math.min(1, value));
  for (const el of glassParts()) el.style.opacity = String(progress);
  entryParts().forEach((el, index) => {
    const offset = index * ENTRY_STAGGER;
    const local = Math.max(0, Math.min(1, (progress - offset) / (1 - offset)));
    el.style.opacity = String(local);
    el.style.transform =
      local >= 1
        ? "none"
        : `translate3d(0,${((1 - local) * 12).toFixed(2)}px,0) scale(${(
            1 -
            (1 - local) * 0.015
          ).toFixed(4)})`;
  });
}
const chatTravel = createChatTravel({
  ball: () => ball.value,
  visual: () =>
    ball.value?.querySelector<HTMLElement>(".chat-ball-visual") || undefined,
  onReveal: paintReveal,
});
const settleSpring = chatMotion.layout;
let stopReturnTracking: (() => void) | undefined;
// During a close, only visualViewport events refresh the source endpoint and
// cached base; no rAF loop measures or paints the return path.
function trackReturnOnViewport() {
  stopReturnTracking?.();
  const view = window.visualViewport;
  if (!view || !motionAllowed()) return;
  const update = () => {
    if (!closing || phase.value !== "closing") return;
    chatTravel.refreshDestination();
  };
  view.addEventListener("resize", update);
  view.addEventListener("scroll", update);
  stopReturnTracking = () => {
    view.removeEventListener("resize", update);
    view.removeEventListener("scroll", update);
    stopReturnTracking = undefined;
  };
}
function reopenFromBall(event: PointerEvent) {
  // Only the still-visible ball during closing is intercepted; in the open
  // state every pointer interaction belongs to DormCompanion.
  if (phase.value !== "closing") return;
  event.preventDefault();
  event.stopPropagation();
  closing = false;
  phase.value = "opening";
  emit("update:modelValue", true);
}
function reopenClick(event: MouseEvent) {
  if (phase.value !== "closing") return;
  event.preventDefault();
  event.stopPropagation();
}
function finishClose() {
  stopReturnTracking?.();
  present.value = false;
  delete document.documentElement.dataset.companionChat;
  emit("present", false);
  removeBack?.();
  removeBack = undefined;
  lastFocus?.isConnected && lastFocus.focus({ preventScroll: true });
  closing = false;
}
async function show() {
  entryPointerPending = true;
  const generation = ++motionEpoch;
  const wasPresent = present.value;
  if (!wasPresent) {
    prepared.value = false;
    for (const item of items.value) item.fresh = false;
  }
  stopReturnTracking?.();
  cancel();
  endPull(true);
  closing = false;
  phase.value = "opening";
  loading.value = !loaded;
  historyScroll.pin();
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
  // Cold open jumps to the source ball synchronously and springs from there;
  // reopening during closing continues at the current pose and velocity.
  const flight = chatTravel.open(props.origin, { fromClosed: !wasPresent });
  prepared.value = true;
  void load();
  const outcome = await flight;
  if (outcome !== "done") return;
  if (generation !== motionEpoch || !present.value || closing) return;
  phase.value = "open";
}
function awaitKeyboardReturn(generation: number) {
  const view = window.visualViewport;
  if (!view) return Promise.resolve();
  // The return spring already follows resize events. If it settled after the
  // keyboard fully restored, there may be no second resize event to await.
  if (view.height >= restingHeight - 8 && view.offsetTop < 1)
    return Promise.resolve();
  return new Promise<void>((resolve) => {
    let stable = 0;
    let timer = 0;
    const finish = () => {
      view.removeEventListener("resize", update);
      view.removeEventListener("scroll", update);
      clearTimeout(timer);
      resolve();
    };
    const update = () => {
      if (
        generation !== motionEpoch ||
        !closing ||
        !present.value ||
        document.hidden
      )
        return finish();
      // The base and return endpoint follow the real source position while
      // the keyboard retreats; no frame loop paints or measures.
      chatTravel.refreshDestination();
      if (view.height >= restingHeight - 8 && view.offsetTop < 1) stable++;
      else stable = 0;
      if (stable >= 2) finish();
    };
    view.addEventListener("resize", update);
    view.addEventListener("scroll", update);
    timer = window.setTimeout(finish, 1000);
    update();
  });
}
async function hide() {
  if (!present.value || closing) return;
  const generation = ++motionEpoch;
  const keyboardReturning =
    keyboardOpen.value || restingHeight - viewport.value.height > 110;
  closing = true;
  cancel();
  historyScroll.stop();
  endPull(true);
  phase.value = "closing";
  edgeControl?.stop();
  // Release the extra WebKit fallback under an opaque frosted backdrop, so
  // the page sharpens as that backdrop fades rather than snapping at unmount.
  document.documentElement.dataset.companionChat = "closing";
  composer.value?.dismiss();
  trackReturnOnViewport();
  const destination = () => props.returnRect?.() || props.origin;
  const outcome = await chatTravel.close(destination, {
    instant: !motionAllowed(),
  });
  if (
    outcome !== "done" ||
    generation !== motionEpoch ||
    !closing ||
    !present.value
  )
    return;
  stopReturnTracking?.();
  if (keyboardReturning && motionAllowed())
    await awaitKeyboardReturn(generation);
  if (generation !== motionEpoch || !closing || !present.value) return;
  // Hand the ball back only after the keyboard has settled, at the source's
  // latest layout position.
  chatTravel.snapClosed(props.returnRect?.() || props.origin);
  finishClose();
}
// Only boundary pulls are intercepted. Normal scrolling, text selection and
// horizontal intent remain native; the timeline keeps a single transform owner.
let pull: {
  x: number;
  y: number;
  top: boolean;
  bottom: boolean;
  engaged: boolean;
} | null = null;
let pullControl: ReturnType<typeof animate> | undefined;
function startPull(event: TouchEvent | PointerEvent) {
  // Touch interrupts programmatic follow. A mouse press alone is not a scroll
  // intent; wheel already interrupts separately.
  const isTouch =
    "touches" in event ||
    ("pointerType" in event && event.pointerType === "touch");
  if (isTouch) historyScroll.interrupt();
  if ("pointerType" in event && event.pointerType === "touch") return;
  if ((event.target as HTMLElement).closest("button,textarea,input,a")) return;
  const point = "touches" in event ? event.touches[0] : event;
  if (!point || !scroll.value || phase.value !== "open") return;
  const el = scroll.value;
  pull = {
    x: point.clientX,
    y: point.clientY,
    top: el.scrollTop <= 1,
    bottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
    engaged: false,
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
  if (!pull.engaged) {
    pullControl?.stop();
    pullControl = undefined;
  }
  pull.engaged = true;
  const offset = (dy * 0.52) / (1 + Math.abs(dy) / 150);
  historyContent.value.style.transform = `translate3d(0,${offset}px,0) scaleX(${1 - Math.abs(offset) * 0.00012})`;
}
function endPointerPull(event: PointerEvent) {
  if (event.pointerType !== "touch") endPull();
}
function endPull(immediate = false) {
  const engaged = pull?.engaged;
  pull = null;
  // A boundary pull can pause follow without changing scrollTop, so no native
  // scroll event would restore near-bottom state. Recheck once on release;
  // readers away from the bottom remain paused and keep their anchor.
  if (!immediate) historyScroll.scroll();
  if (!historyContent.value) return;
  // Native scrolling does not need an animation or a synchronous style read.
  if (!engaged && !immediate) return;
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
      settleSpring,
    );
}
let edge: {
  id: number;
  x: number;
  y: number;
  active: boolean;
  el: HTMLElement;
} | null = null;
let edgeControl: ReturnType<typeof animate> | undefined;
function edgeDown(event: PointerEvent) {
  const el = event.currentTarget as HTMLElement;
  if (
    !event.isPrimary ||
    event.button !== 0 ||
    phase.value !== "open" ||
    event.clientX - el.getBoundingClientRect().left > 30 ||
    (event.target as Element).closest("button,input,textarea,a")
  )
    return;
  edgeControl?.stop();
  edge = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    active: false,
    el,
  };
}
function edgeMove(event: PointerEvent) {
  if (!edge || edge.id !== event.pointerId) return;
  const dx = event.clientX - edge.x,
    dy = event.clientY - edge.y;
  if (!edge.active) {
    const intent = horizontalIntent(dx, dy);
    if (intent === "vertical" || dx < -8) {
      edge = null;
      return;
    }
    if (intent !== "horizontal") return;
    edge.active = true;
    edge.el.setPointerCapture(event.pointerId);
    endPull(true);
  }
  event.preventDefault();
  if (motionAllowed())
    edge.el.style.transform = `translate3d(${rubberBand(Math.max(0, dx), 300)}px,0,0)`;
}
function edgeUp(event: PointerEvent) {
  if (!edge || edge.id !== event.pointerId) return;
  if (
    event.type === "lostpointercapture" &&
    edge.el.hasPointerCapture(event.pointerId)
  )
    return;
  const g = edge;
  edge = null;
  if (g.el.hasPointerCapture(g.id)) g.el.releasePointerCapture(g.id);
  if (!g.active) return;
  if (event.type === "pointerup" && event.clientX - g.x > 80) {
    // Keep the followed surface still while the ball travels to its source.
    // Simultaneously resetting this parent would compensate the X offset twice.
    close();
    return;
  }
  // Returning the surface also settles cancelled/short edge gestures.
  edgeControl = animate(
    g.el,
    { transform: [getComputedStyle(g.el).transform, "translate3d(0,0,0)"] },
    motionAllowed() ? settleSpring : { duration: 0 },
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
    items.value.push({
      id: "welcome:" + index,
      role: "assistant",
      text,
      fresh: true,
    });
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
  loading.value = !loaded;
  error.value = "";
  retry = null;
  try {
    const state = await api.state(c.signal);
    if (generation !== epoch || !props.modelValue) return;
    available.value = state.available;
    const localNotes = items.value.filter((m) => m.id.startsWith("note:"));
    items.value = [
      ...state.messages.flatMap((m) =>
        m.messages.map((text, i) => ({
          id: `${m.request_id}:${m.role}:${i}`,
          role: m.role,
          text,
          fresh: false,
        })),
      ),
      ...localNotes,
    ];
    reminders.value = state.reminders;
    const initialHistory = !loaded;
    loaded = true;
    emotion.value = "39";
    if (!available.value) error.value = "球球还未接通AI服务";
    bottom(initialHistory);
    if (!items.value.length && available.value) await welcome(generation);
  } catch (e) {
    if (generation === epoch && !c.signal.aborted)
      error.value = (e as Error).message;
  } finally {
    if (generation === epoch) loading.value = false;
  }
}
async function send(text: string, isRetry = false) {
  if (busy.value || actionBusy.value || notes.sending.value) return;
  // Sending must not pull a reader who has deliberately scrolled history.
  if (!isRetry && notes.input(text)) return;
  if (loading.value || !available.value) return;
  const request = isRetry && retry ? retry : { text, id: chatRequestId() };
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
    items.value.push({
      id: request.id + ":user:0",
      role: "user",
      text,
      fresh: true,
    });
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
        fresh: true,
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
      id: chatRequestId(),
      role: "assistant",
      fresh: true,
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
  if (notes.active.value) return;
  clearConfirm.value = !clearConfirm.value;
  if (clearConfirm.value)
    void nextTick(() => {
      if (scroll.value) scroll.value.scrollTop = 0;
    });
}
async function clear() {
  if (busy.value || loading.value || actionBusy.value || notes.active.value)
    return;
  busy.value = true;
  error.value = "";
  const generation = epoch,
    c = new AbortController();
  controller = c;
  try {
    await api.clear(c.signal);
    if (generation === epoch) {
      items.value = [];
      notes.reset();
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
    const closingNow = phase.value === "closing";
    motionEpoch++;
    chatTravel.complete(closingNow ? "close" : "open");
    endPull(true);
    if (closingNow) finishClose();
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
  draft.value = "";
  loaded = false;
  historyScroll.stop();
  notes.reset();
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
  footerObserver?.disconnect();
  historyScroll.destroy();
  delete document.documentElement.dataset.companionChat;
  cancel();
  motionEpoch++;
  stopReturnTracking?.();
  chatTravel.destroy();
  edgeControl?.stop();
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
        :data-ready="prepared"
        :data-phase="phase"
        :class="{ 'is-compact': compactViewport, 'is-keyboard': keyboardOpen }"
        :style="{ top: viewport.top + 'px', height: viewport.height + 'px' }"
        @pointerdown.capture="chatPointerStarted"
        @click.capture="chatEntryClick"
        :aria-describedby="undefined"
        @escape-key-down.prevent="close"
        @pointer-down-outside.prevent
        @interact-outside.prevent
        @open-auto-focus.prevent
        @close-auto-focus.prevent
        @pointerdown="edgeDown"
        @pointermove="edgeMove"
        @pointerup="edgeUp"
        @pointercancel="edgeUp"
        @lostpointercapture="edgeUp"
      >
        <DialogTitle class="chat-sr-only">和球球聊天</DialogTitle
        ><DialogDescription class="chat-sr-only"
          >输入文字与球球聊天。提醒安排需要确认后才保存。</DialogDescription
        >
        <div
          ref="ball"
          class="chat-ball"
          data-testid="chat-ball"
          @pointerdown.capture="reopenFromBall"
          @click.capture="reopenClick"
        >
          <div class="chat-ball-visual">
            <DormCompanion
              :size="88"
              :mood="emotion"
              :interactive="true"
              automatic
              continuous
              intent="play"
              :tips="true"
              :muted="!prepared"
              scene="chat"
            />
          </div>
        </div>
        <div ref="nameplate" class="chat-nameplate">球球</div>
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
              @scroll.passive="historyScrolled"
              @wheel.passive="historyScroll.interrupt"
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
                  :initial="item.fresh ? bubbleOrigin(item.role) : false"
                  :animate="{ opacity: 1, x: 0, y: 0, scale: 1 }"
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
                <AnimatePresence :initial="false"
                  ><motion.div
                    v-if="notes.active.value"
                    :initial="
                      motionAllowed()
                        ? { opacity: 0, y: 10, scale: 0.97 }
                        : false
                    "
                    :animate="{ opacity: 1, y: 0, scale: 1 }"
                    :exit="{ opacity: 0, y: 5, scale: 0.97 }"
                    :transition="chatTransition('layout')"
                    style="width: 100%"
                    key="note-flow"
                  >
                    <ConversationNoteFlow
                      :state="notes.state.value"
                      :members="members || []"
                      :member-id="memberId"
                      @choose="
                        notes.dispatch({ type: 'choose', target: $event })
                      "
                      @edit="notes.dispatch({ type: 'edit', field: $event })"
                      @cancel="notes.dispatch({ type: 'cancel' })"
                      @confirm="
                        notes.dispatch({ type: 'submit' })
                      " /></motion.div
                ></AnimatePresence>
                <button
                  v-if="hasConversation"
                  class="chat-clear"
                  aria-label="清空聊天记录"
                  :disabled="
                    busy || loading || !!actionBusy || notes.active.value
                  "
                  @click="requestClear"
                >
                  清空聊天
                </button>
              </div>
            </div>
          </div>
          <div
            ref="masthead"
            class="chat-masthead chat-top-frost"
            aria-hidden="true"
            data-testid="chat-top-frost"
          >
            <i /><i /><i /><i />
          </div>
          <footer ref="footer" class="chat-footer">
            <div
              class="chat-footer-glass"
              aria-hidden="true"
              data-testid="chat-bottom-frost"
            >
              <i class="glass-top-soft" /><i class="glass-top-edge" />
              <i class="glass-bottom-soft" /><i class="glass-bottom-edge" />
            </div>
            <button
              v-if="!notes.active.value && !keyboardOpen"
              class="chat-note-shortcut"
              :disabled="busy || !!actionBusy || phase !== 'open'"
              @click="notes.dispatch({ type: 'start' })"
            >
              我要留言
            </button>
            <CompanionChatComposer
              ref="composer"
              v-model:draft="draft"
              :busy="
                busy ||
                (loading && !notes.active.value) ||
                !!actionBusy ||
                notes.sending.value
              "
              :enabled="
                (available || notes.active.value) &&
                !notes.sending.value &&
                phase === 'open'
              "
              :placeholder="
                notes.state.value.phase === 'content'
                  ? '写下留言内容…'
                  : notes.state.value.phase === 'recipient'
                    ? '输入完整姓名，或点选室友…'
                    : '和球球说句话…'
              "
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
.chat-note-shortcut {
  width: max-content;
  min-height: 36px;
  padding: 6px 14px;
  margin-bottom: 8px;
  border: 1px solid var(--ui-border);
  border-radius: 18px;
  background: var(--chat-glass);
  color: var(--ui-ink);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: transform var(--ui-release-time) var(--ui-ease-out);
}
.chat-note-shortcut:not(:disabled):active {
  transform: var(--ui-press-small);
  transition-duration: var(--ui-press-time);
}
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
  opacity: 0;
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
  touch-action: pan-y pinch-zoom;
}
.companion-chat[data-ready="false"] {
  visibility: hidden;
}
.chat-masthead {
  position: absolute;
  z-index: 2;
  inset: 0 0 auto;
  height: calc(var(--chat-ball-top) + 144px);
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
  --chat-footer-height: 102px;
  --chat-input-height: 58px;
  --chat-footer-gap: max(58px, calc(env(safe-area-inset-bottom) + 34px));
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0 20px;
  position: relative;
  z-index: 1;
  box-sizing: border-box;
}
.chat-toolbar {
  position: relative;
  z-index: 4;
  pointer-events: none;
  opacity: 0;
  display: flex;
  justify-content: flex-start;
  flex: none;
  padding-top: max(24px, calc(var(--chat-ball-top) - 12px));
  height: calc(var(--chat-ball-top) + 128px);
  box-sizing: border-box;
}
.chat-toolbar button {
  pointer-events: auto;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid #ffffff28;
  background: #161616b8;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  color: #fff;
  font-size: 29px;
  display: grid;
  place-items: center;
}
.chat-toolbar button:active {
  transform: scaleX(1.06) scaleY(0.94);
}
.chat-nameplate {
  opacity: 0;
  position: absolute;
  top: calc(var(--chat-ball-top) + 96px);
  left: 50%;
  translate: -50% 0;
  padding: 5px 18px;
  border-radius: 16px;
  border: 1px solid #ffffff50;
  background: var(--chat-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-size: 14px;
  z-index: 3;
}
.chat-ball :deep(.companion-bubble) {
  left: calc(100% - 6px);
  top: -12px;
  translate: 0 -50%;
  max-width: min(128px, calc(50vw - 68px));
  border-radius: 13px 13px 13px 4px;
  transform-origin: bottom left;
  z-index: 6;
}
.chat-history-frame {
  opacity: 0;
  --chat-edge: 0;
  position: absolute;
  inset: 0 16px;
  min-height: 0;
}
.chat-top-frost i {
  opacity: 0;
  position: absolute;
  inset: 0;
  display: block;
  background: color-mix(in srgb, var(--ui-surface) 9%, transparent);
}
.chat-top-frost i:nth-child(1) {
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  mask-image: linear-gradient(#000 48%, transparent);
  -webkit-mask-image: linear-gradient(#000 48%, transparent);
}
.chat-top-frost i:nth-child(2) {
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  mask-image: linear-gradient(#000 24%, transparent 86%);
  -webkit-mask-image: linear-gradient(#000 24%, transparent 86%);
}
.chat-top-frost i:nth-child(3) {
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  mask-image: linear-gradient(#000, transparent 60%);
  -webkit-mask-image: linear-gradient(#000, transparent 60%);
}
.chat-top-frost i:nth-child(4) {
  backdrop-filter: blur(26px);
  -webkit-backdrop-filter: blur(26px);
  mask-image: linear-gradient(#000, transparent 34%);
  -webkit-mask-image: linear-gradient(#000, transparent 34%);
}
.chat-history {
  touch-action: pan-y pinch-zoom;
  height: 100%;
  box-sizing: border-box;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
  scrollbar-width: none;
  display: block;
  padding: calc(var(--chat-ball-top) + 144px) 4px
    calc(var(--chat-footer-height) + var(--chat-footer-gap) + 22px);
  margin: 0;
}
.chat-history-content {
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
  position: absolute;
  z-index: 3;
  inset-inline: 20px;
  bottom: var(--chat-footer-gap);
  opacity: 0;
  flex: none;
  padding-top: 8px;
}
.chat-footer::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: -48px -20px calc(-1 * var(--chat-footer-gap));
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    transparent,
    color-mix(in srgb, var(--ui-surface) 10%, transparent) 48px,
    color-mix(in srgb, var(--ui-surface) 12%, transparent) 70%,
    color-mix(in srgb, var(--ui-surface) 18%, transparent)
  );
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  mask-image: linear-gradient(transparent, #000 48px);
  -webkit-mask-image: linear-gradient(transparent, #000 48px);
}
.chat-footer > * {
  position: relative;
  z-index: 1;
}
.chat-footer > .chat-footer-glass {
  position: absolute;
  z-index: 0;
  inset: -48px -20px calc(-1 * var(--chat-footer-gap));
  pointer-events: none;
}
.chat-footer-glass i {
  position: absolute;
  inset-inline: 0;
  display: block;
  pointer-events: none;
}
.glass-top-soft,
.glass-top-edge {
  top: 0;
  height: calc(
    48px + var(--chat-footer-height) - var(--chat-input-height) + 24px
  );
}
.glass-top-soft {
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  mask-image: linear-gradient(transparent, #000 48%, #000 62%, transparent);
  -webkit-mask-image: linear-gradient(
    transparent,
    #000 48%,
    #000 62%,
    transparent
  );
}
.glass-top-edge {
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  mask-image: linear-gradient(transparent 12%, #000 60%, transparent);
  -webkit-mask-image: linear-gradient(transparent 12%, #000 60%, transparent);
}
.glass-bottom-soft {
  bottom: 0;
  height: calc(var(--chat-footer-gap) + var(--chat-input-height) * 0.45);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  mask-image: linear-gradient(transparent, #000 70%);
  -webkit-mask-image: linear-gradient(transparent, #000 70%);
}
.glass-bottom-edge {
  bottom: 0;
  height: calc(var(--chat-footer-gap) + var(--chat-input-height) * 0.15);
  backdrop-filter: blur(26px);
  -webkit-backdrop-filter: blur(26px);
  mask-image: linear-gradient(transparent 5%, #000);
  -webkit-mask-image: linear-gradient(transparent 5%, #000);
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
  height: 108px;
  padding-top: 12px;
}
.is-compact .chat-nameplate {
  top: 79px;
  padding: 3px 12px;
  font-size: 12px;
}
.is-compact .chat-masthead {
  height: 125px;
}
.is-compact .chat-surface {
  --chat-footer-gap: max(12px, env(safe-area-inset-bottom));
}
.is-compact .chat-history {
  padding-top: 116px;
  padding-bottom: calc(
    var(--chat-footer-height) + var(--chat-footer-gap) + 12px
  );
}
.is-compact .chat-top-frost {
  height: 125px;
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
  .chat-top-frost,
  .chat-footer-glass {
    display: none;
  }
  .chat-footer::before {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: var(--ui-surface);
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
