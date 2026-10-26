<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, inject } from "vue";
import { tutorialPracticeKey } from "../interaction/tutorialPractice";
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
import ChatReplyText from "./ChatReplyText.vue";
import CompanionChatComposer from "./CompanionChatComposer.vue";
import ConversationNoteFlow from "./ConversationNoteFlow.vue";
import { useConversationNotes } from "../composables/useConversationNotes";
import { useChatReplyPresentation } from "../composables/useChatReplyPresentation";
import { pickQuickPrompts } from "../interaction/chatQuickPrompts";
import type { ChatSourceItem } from "../interaction/chatReplyText";
import type { NoteState } from "../interaction/conversationNotes";
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
import {
  createChatViewport,
  isCompactViewportHeight,
  type ChatViewportState,
} from "../interaction/chatViewport";
import {
  createChatLayoutCoordinator,
  deriveChatHeaderLayout,
  deriveChatPanelMax,
} from "../interaction/chatLayout";
import { registerNativeBack } from "../interactions/nativeBack";
import { horizontalIntent, rubberBand } from "../interaction/gestures";
// `committed` separates the optimistic visual preview from the irreversible
// chat requests. Existing callers keep the previous behaviour by default.
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    origin: DOMRect | null;
    returnRect?: () => DOMRect | null;
    members?: ChoreMember[];
    noteRequest?: { key: number; target: number };
    invite: string;
    memberId: number;
    token: string;
    committed?: boolean;
  }>(),
  { committed: true },
);
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  present: [value: boolean];
  noteSent: [];
  reopen: [];
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
  dockPanel = ref<HTMLElement>(),
  dockInner = ref<HTMLElement>(),
  quickRow = ref<HTMLElement>(),
  composer = ref<InstanceType<typeof CompanionChatComposer>>();
const draft = ref("");
const historyReady = ref(false);
let loaded = false;
// The first state response after opening is always positioned instantly, even
// when cached history was already visible.
let initialStatePending = false;
// One preview opens once, one commit starts exactly one initial state read,
// even if show() and the committed watcher interleave.
let stateRequestedForOpen = false;
const available = ref(false),
  loading = ref(false),
  busy = ref(false),
  awaiting = ref(false),
  error = ref(""),
  emotion = ref("02"),
  items = ref<ChatSourceItem[]>([]),
  reminders = ref<ChatReminder[]>([]),
  actionBusy = ref("");
const replyPresentation = useChatReplyPresentation(() => items.value);
watch(replyPresentation.displayedItems, () => bottom());
const viewport = ref({ top: 0, height: window.innerHeight, inset: 0 }),
  keyboardOpen = ref(false),
  // The short-screen baseline is still decided once on entry. Keyboard
  // occlusion then compresses it progressively from the same viewport state.
  compactViewport = ref(false),
  thinking = computed(() => awaiting.value || notes.sending.value);
const practice = inject(tutorialPracticeKey, null);
function client() {
  return practice?.matches(props.invite, props.memberId, props.token)
    ? practice.api : companionClient(props.invite, props.memberId, props.token);
}
let api = client(),
  epoch = 0,
  controller: AbortController | undefined,
  removeBack: (() => void) | undefined,
  closing = false,
  motionEpoch = 0,
  restingHeight = window.innerHeight,
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
  practice?.matches(props.invite, props.memberId, props.token) ? practice.sendNote : undefined,
);
let handledNoteKey: number | undefined;
watch(
  () => [props.noteRequest?.key, props.committed] as const,
  () => {
    const request = props.noteRequest;
    if (request && props.committed && request.key !== handledNoteKey) {
      handledNoteKey = request.key;
      void notes.dispatch({ type: "start", target: request.target });
    }
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
// Header values are pure derivations of the one viewport state. No separate
// keyboard flag, timer or media query drives the compact pose.
const headerLayout = computed(() =>
  deriveChatHeaderLayout({
    compact: compactViewport.value,
    inset: viewport.value.inset,
  }),
);
const chatStyle = computed<Record<string, string>>(() => {
  const header = headerLayout.value;
  return {
    top: viewport.value.top + "px",
    height: viewport.value.height + "px",
    "--chat-keyboard-inset": viewport.value.inset + "px",
    "--chat-progress": String(header.progress),
    "--chat-ball-scale": String(header.ballScale),
    "--chat-ball-top-base": header.ballTopBase + "px",
    "--chat-ball-safe-gap": header.ballSafeGap + "px",
    "--chat-toolbar-extra": header.toolbarExtra + "px",
    "--chat-toolbar-pad-offset": header.toolbarPadOffset + "px",
    "--chat-history-extra": header.historyExtra + "px",
    "--chat-frost-extra": header.frostExtra + "px",
    "--chat-nameplate-offset": header.nameplateOffset + "px",
    "--chat-nameplate-font": header.nameplateFont + "px",
    "--chat-nameplate-pad-y": header.nameplatePadY + "px",
    "--chat-nameplate-pad-x": header.nameplatePadX + "px",
    "--chat-back-opacity": String(header.backOpacity),
  };
});
const panelMaxHeight = computed(() =>
  deriveChatPanelMax(viewport.value.height),
);
// Suggestions are allowed once per entry. The keyboard hides them without
// consuming that permission; choosing an AI prompt collapses them for the
// entry, while the note workflow simply occupies the dock until it ends.
const suggestionsAllowed = ref(true),
  leavingNote = ref<NoteState | null>(null),
  panelHeight = ref(0);
const suggestionsVisible = computed(
  () =>
    historyReady.value &&
    phase.value === "open" &&
    suggestionsAllowed.value &&
    !keyboardOpen.value &&
    !notes.active.value &&
    !leavingNote.value,
);
const displayedNote = computed(() =>
  notes.active.value ? notes.state.value : leavingNote.value,
);
// The panel target closes while a cancelled note is still visible; the frozen
// copy is removed after the reverse height animation has played.
const panelTargetOpen = computed(
  () => notes.active.value || suggestionsVisible.value,
);
// Keep the last live workflow state for the reverse transition. The state
// machine itself is not duplicated or replayed.
const liveNote = ref<NoteState>(notes.state.value);
watch(
  notes.state,
  (state) => {
    if (notes.active.value) liveNote.value = state;
  },
  { deep: true, immediate: true },
);
watch(notes.active, (active, was) => {
  if (active) {
    leavingNote.value = null;
    layout.invalidate();
    return;
  }
  if (!was) return;
  // Reduced motion has no reverse height animation to cover, so release the
  // frozen content immediately instead of delaying the final state.
  if (!motionAllowed()) {
    leavingNote.value = null;
    layout.invalidate();
    return;
  }
  leavingNote.value = liveNote.value;
  layout.invalidate();
  // Release only after the actual panel transition settles, including a
  // reversal. A fixed timer would release the content mid-flight.
  void nextTick(() => {
    if (
      panelHeight.value === 0 &&
      (!dockPanel.value || dockPanel.value.offsetHeight < 0.5)
    )
      finishPanelClose();
  });
});
watch([panelTargetOpen, () => notes.state.value.phase], () =>
  layout.invalidate(),
);
watch(dockInner, (element) => {
  dockObserver?.disconnect();
  if (!element) return;
  dockObserver = new ResizeObserver(() => layout.invalidate());
  dockObserver.observe(element);
});
function finishPanelClose(event?: TransitionEvent) {
  if (
    event &&
    (event.target !== dockPanel.value || event.propertyName !== "height")
  )
    return;
  if (leavingNote.value && !notes.active.value && panelHeight.value === 0) {
    leavingNote.value = null;
    layout.invalidate();
  }
}
function composerFocused() {
  const active = document.activeElement;
  return !!surface.value?.contains(active) && active?.tagName === "TEXTAREA";
}
// One rAF-driven state is the only writer of the real visual viewport. The
// root, footer gap, frosted glass and history all read this same geometry.
function applyViewport(next: ChatViewportState) {
  // Closing intentionally freezes the viewport pose; the return spring follows
  // the live destination through the controller subscription instead.
  if (closing) return;
  const previous = viewport.value;
  restingHeight = next.restingHeight;
  if (
    previous.top === next.top &&
    previous.height === next.height &&
    previous.inset === next.inset &&
    keyboardOpen.value === next.keyboard
  )
    return;
  const active = present.value;
  // Preserve the reader before any Vue style/padding change. Near-bottom
  // followers use the controller's pinned state, never a post-layout distance.
  const pinned = historyScroll.isPinned();
  if (active && !pinned) historyScroll.capture();
  viewport.value = {
    top: next.top,
    height: next.height,
    inset: next.inset,
  };
  keyboardOpen.value = next.keyboard;
  if (!active) return;
  // Only an opening/closing ball has a moving source endpoint. A normal
  // keyboard change must not measure layout on every frame.
  if (phase.value !== "open") chatTravel.measure();
  // Header CSS, the dock cap and scroll anchoring settle once after this
  // commit instead of each listener running its own follow.
  layout.invalidate();
}
function scheduleFit() {
  viewportController.schedule();
}
let footerObserver: ResizeObserver | undefined;
watch(footer, (element) => {
  document.fonts?.removeEventListener("loadingdone", fontMetricsChanged);
  footerObserver?.disconnect();
  if (!element) return;
  footerObserver = new ResizeObserver(() => {
    // Read both sizes (and preserve a reading anchor) before writing; skip
    // writes that would not change the layout so the observer cannot restyle
    // itself in a loop.
    const footerHeight = element.offsetHeight;
    const inputHeight =
      element.querySelector<HTMLElement>(".chat-composer")?.offsetHeight || 58;
    const pinned = historyScroll.isPinned();
    if (present.value && !pinned) historyScroll.capture();
    const host = surface.value;
    if (host) {
      const footerValue = `${footerHeight}px`;
      const inputValue = `${inputHeight}px`;
      if (host.style.getPropertyValue("--chat-footer-height") !== footerValue)
        host.style.setProperty("--chat-footer-height", footerValue);
      if (host.style.getPropertyValue("--chat-input-height") !== inputValue)
        host.style.setProperty("--chat-input-height", inputValue);
    }
    // The same pinned state as viewport and message updates decides whether
    // this footer/keyboard padding change follows the latest message.
    layout.invalidate();
  });
  footerObserver.observe(element);
});

function cancel() {
  replyPresentation.flush();
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
// One post-update pass measures the dock and settles the reader. Viewport,
// footer, note and suggestion changes all invalidate this single coordinator.
const layout = createChatLayoutCoordinator(() => {
  measureDock();
  // Reduced-motion/input-mode changes can cancel CSS transitions without an
  // end event. The same layout owner releases the exit snapshot immediately.
  if (!motionAllowed()) finishPanelClose();
  historyScroll.settleLayout();
  refreshEdge();
});
let dockObserver: ResizeObserver | undefined;
function measureDock() {
  const inner = dockInner.value;
  if (!inner || !panelTargetOpen.value) {
    if (panelHeight.value !== 0) panelHeight.value = 0;
    return;
  }
  const target = Math.max(
    0,
    Math.min(inner.offsetHeight, panelMaxHeight.value),
  );
  if (Math.abs(panelHeight.value - target) >= 0.5)
    panelHeight.value = Math.round(target);
}
function bottom(immediate = false) {
  void nextTick(() => {
    if (!closing) historyScroll.request(immediate);
  });
}
// A composer measurement changes the dock height; it is a layout event, not a
// new-message follow, so it settles rather than starting a smooth scroll.
function queueLayout() {
  layout.invalidate();
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
const viewportController = createChatViewport({
  focused: composerFocused,
  onFrame: applyViewport,
});
const settleSpring = chatMotion.layout;
let backgroundScroll = {x:0,y:0}, returnScrollPending = false;
function restoreBackgroundScroll() {
  if (!returnScrollPending || present.value || closing || document.activeElement?.matches("input,textarea,[contenteditable=true]")) return;
  window.scrollTo({left:backgroundScroll.x, top:backgroundScroll.y, behavior:"instant"});
  const state = viewportController.state();
  if (!state.keyboard && state.inset === 0) returnScrollPending = false;
}
// All visualViewport/window events coalesce here. During a close the same
// frames only refresh the return destination; no fixed-delay loop is added.
viewportController.subscribe(() => {
  if (closing && phase.value === "closing") chatTravel.refreshDestination();
  if (!present.value && returnScrollPending) restoreBackgroundScroll();
});
viewportController.start();
function reopenFromBall(event: PointerEvent) {
  // Only the still-visible ball during closing is intercepted; in the open
  // state every pointer interaction belongs to DormCompanion.
  if (phase.value !== "closing") return;
  event.preventDefault();
  event.stopPropagation();
  closing = false;
  phase.value = "opening";
  // Reopening a chat that was already confirmed is not an optimistic preview.
  emit("reopen");
  emit("update:modelValue", true);
}
function reopenClick(event: MouseEvent) {
  if (phase.value !== "closing") return;
  event.preventDefault();
  event.stopPropagation();
}
function finishClose() {
  present.value = false;
  delete document.documentElement.dataset.companionChat;
  emit("present", false);
  removeBack?.();
  removeBack = undefined;
  lastFocus?.isConnected && lastFocus.focus({ preventScroll: true });
  closing = false;
  returnScrollPending = true;
  const generation = motionEpoch;
  // Release the Dialog's native scroll lock before undoing a focus-induced
  // document pan. Late keyboard frames use the existing viewport subscriber.
  void nextTick().then(() => requestAnimationFrame(() => {
    if (generation === motionEpoch) restoreBackgroundScroll();
  }));
}
// Reveal the history only after the real layout exists, then pin it
// synchronously. The observer stays instant until releaseInitial() below, so
// late layout work can never turn the first frame into a smooth scroll.
async function settleHistory() {
  const generation = motionEpoch;
  if (!present.value) return;
  historyReady.value = true;
  await nextTick();
  if (generation !== motionEpoch || !present.value) return;
  historyScroll.positionInitial();
  historyScroll.releaseInitial();
  const fonts = document.fonts;
  void fonts?.ready.then(() => {
    // Late font metrics can change bubble height after the first paint.
    if (
      generation === motionEpoch &&
      present.value &&
      !closing &&
      historyScroll.isPinned()
    )
      historyScroll.request(true);
  });
}
function requestInitialState() {
  if (stateRequestedForOpen) return;
  if (!props.committed || !props.modelValue) return;
  stateRequestedForOpen = true;
  void load();
}
async function show() {
  entryPointerPending = true;
  const generation = ++motionEpoch;
  const wasPresent = present.value;
  returnScrollPending = false;
  if (!wasPresent) backgroundScroll = {x:window.scrollX,y:window.scrollY};
  stateRequestedForOpen = false;
  if (!wasPresent) {
    prepared.value = false;
    historyReady.value = false;
  }
  // Reopened history never replays the reply reveal.
  for (const item of items.value) item.fresh = false;
  initialStatePending = true;
  // Every entry offers the existing quick prompts again, with the note action
  // first. A pending reverse transition from the previous entry is discarded.
  suggestionsAllowed.value = true;
  if (!wasPresent)
    quickPrompts.value = pickQuickPrompts(
      window.innerWidth,
      quickPrompts.value,
    );
  if (quickRow.value) quickRow.value.scrollLeft = 0;
  leavingNote.value = null;
  panelHeight.value = 0;
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
  // A short screen decides its own compact layout before the surface exists.
  // Reopening the same conversation keeps that entry decision.
  if (!wasPresent)
    compactViewport.value = isCompactViewportHeight(restingHeight);
  clearConfirm.value = false;
  present.value = true;
  document.documentElement.dataset.companionChat = "true";
  emit("present", true);
  if (!wasPresent) lastFocus = document.activeElement as HTMLElement;
  await nextTick();
  viewportController.flush();
  // Closing freezes the rendered pose while the controller continues tracking
  // the keyboard. Reapply its snapshot even if no new viewport event arrives.
  applyViewport(viewportController.state());
  await nextTick();
  removeBack?.();
  removeBack = registerNativeBack(close);
  // Cold open jumps to the source ball synchronously and springs from there;
  // reopening during closing continues at the current pose and velocity.
  const flight = chatTravel.open(props.origin, { fromClosed: !wasPresent });
  prepared.value = true;
  if (wasPresent) {
    // Reopening during close keeps the cached surface visible, but still
    // pins the latest history in the same frame.
    historyScroll.positionInitial();
    historyScroll.releaseInitial();
  } else if (loaded) {
    void settleHistory();
  }
  // Optimistic previews never touch the companion API; only a confirmed tap
  // (or the existing long-press/keyboard/reply entries) starts the load.
  requestInitialState();
  const outcome = await flight;
  if (outcome !== "done") return;
  if (generation !== motionEpoch || !present.value || closing) return;
  phase.value = "open";
}
function awaitKeyboardReturn(generation: number) {
  const initial = viewportController.state();
  // If the viewport already restored before the close spring settled, there
  // may be no later event to await.
  if (
    initial.height >= initial.restingHeight - 8 &&
    Math.abs(initial.top - initial.restingTop) <= 8
  )
    return Promise.resolve();
  return new Promise<void>((resolve) => {
    let stable = 0;
    let timer = 0;
    let unsubscribe = () => {};
    const finish = () => {
      unsubscribe();
      clearTimeout(timer);
      resolve();
    };
    // The same coalesced frames that refresh the return destination also
    // decide when the keyboard has actually restored; no second listener set.
    unsubscribe = viewportController.subscribe((state) => {
      if (
        generation !== motionEpoch ||
        !closing ||
        !present.value ||
        document.hidden
      )
        return finish();
      if (
        state.height >= state.restingHeight - 8 &&
        Math.abs(state.top - state.restingTop) <= 8
      )
        stable++;
      else stable = 0;
      if (stable >= 2) finish();
      else if (stable === 1) viewportController.schedule();
    });
    timer = window.setTimeout(finish, 1000);
    // Sample the current viewport immediately and again on the next frame so
    // a restoration that arrived before subscribing is not missed.
    viewportController.flush();
    viewportController.schedule();
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
const quickPrompts = ref<string[]>([]);
function useQuickPrompt(prompt: string) {
  // Choosing an AI prompt collapses this entry's suggestions; new messages do
  // not reopen them.
  suggestionsAllowed.value = false;
  void send(prompt);
}
function startQuickNote() {
  // The existing note state machine starts without an AI request. The dock is
  // occupied by the workflow and returns to suggestions when it ends.
  void notes.dispatch({ type: "start" });
}
const hasConversation = computed(() =>
  items.value.some((item) => !item.id.startsWith("welcome:")),
);
// Until the first history frame has been measured and pinned, only the
// existing skeleton exists in the history area. The ball, input and glass have
// already expanded around it.
const visibleItems = computed(() =>
  historyReady.value ? replyPresentation.displayedItems.value : [],
);
const visibleReminders = computed(() =>
  historyReady.value
    ? reminders.value.filter(
        (a) => a.status === "proposed" || a.status === "pending",
      )
    : [],
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
  if (!props.committed) return;
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
    // A reader who moved away from the bottom keeps their anchor even if the
    // first state response arrives late.
    const keepReading = !historyScroll.isPinned();
    if (keepReading) historyScroll.capture();
    const localNotes = items.value.filter((m) => m.id.startsWith("note:"));
    items.value = [
      ...state.messages.flatMap((m) =>
        m.role === "assistant"
          ? [
              {
                id: `${m.request_id}:assistant:0`,
                role: m.role,
                text: m.messages.join(""),
                parts: [...m.messages],
                fresh: false,
              },
            ]
          : m.messages.map((text, i) => ({
              id: `${m.request_id}:${m.role}:${i}`,
              role: m.role,
              text,
              fresh: false,
            })),
      ),
      ...localNotes,
    ];
    reminders.value = state.reminders;
    loaded = true;
    emotion.value = "39";
    if (!available.value) error.value = "球球还未接通AI服务";
    const firstState = initialStatePending;
    initialStatePending = false;
    loading.value = false;
    await nextTick();
    if (generation !== epoch || !props.modelValue) return;
    if (!historyReady.value) await settleHistory();
    else if (keepReading) {
      await nextTick();
      if (generation === epoch) historyScroll.restore();
    } else if (firstState) {
      // Cached history was already visible and pinned; the first state
      // response re-pins the latest messages instantly instead of
      // top-then-smooth.
      historyScroll.positionInitial();
      historyScroll.releaseInitial();
    } else bottom();
    if (!items.value.length && available.value) await welcome(generation);
  } catch (e) {
    if (generation === epoch && !c.signal.aborted) {
      error.value = (e as Error).message;
      // A failed refresh must reveal the retained history (or an empty but
      // selectable view) together with the error, never hide it forever.
      const firstState = initialStatePending;
      initialStatePending = false;
      loading.value = false;
      await nextTick();
      if (generation !== epoch || !props.modelValue) return;
      if (!historyReady.value) await settleHistory();
      else if (firstState && historyScroll.isPinned()) {
        historyScroll.positionInitial();
        historyScroll.releaseInitial();
      }
    }
  } finally {
    if (generation === epoch) loading.value = false;
  }
}
async function send(text: string, isRetry = false) {
  if (!props.committed) return;
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
    items.value.push({
      id: `${request.id}:assistant:0`,
      role: "assistant",
      text: reply.messages.join(""),
      parts: [...reply.messages],
      fresh: true,
    });
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
  if (!props.committed) return;
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
  if (!props.committed) return;
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
  } else if (props.modelValue && props.committed && phase.value === "open")
    void load();
}
const media = matchMedia("(prefers-reduced-motion: reduce)");
function quiet() {
  if (!motionAllowed()) {
    replyPresentation.flush();
    const closingNow = phase.value === "closing";
    motionEpoch++;
    chatTravel.complete(closingNow ? "close" : "open");
    endPull(true);
    finishPanelClose();
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
watch(
  () => props.committed,
  (value) => {
    // A late commit for an already closed conversation must never reopen it.
    if (value && props.modelValue && present.value && !closing)
      requestInitialState();
  },
);
watch(scope, () => {
  cancel();
  leavingNote.value = null;
  panelHeight.value = 0;
  items.value = [];
  draft.value = "";
  loaded = false;
  historyReady.value = false;
  initialStatePending = false;
  stateRequestedForOpen = false;
  historyScroll.stop();
  notes.reset();
  reminders.value = [];
  retry = null;
  available.value = false;
  api = client();
  if (props.modelValue) close();
});
function fontMetricsChanged() {
  if (present.value && !closing && historyScroll.isPinned())
    historyScroll.request(true);
}
document.fonts?.addEventListener("loadingdone", fontMetricsChanged);
document.addEventListener("visibilitychange", inactive);
media.addEventListener("change", quiet);
onBeforeUnmount(() => {
  footerObserver?.disconnect();
  dockObserver?.disconnect();
  layout.stop();
  historyScroll.destroy();
  delete document.documentElement.dataset.companionChat;
  cancel();
  motionEpoch++;
  viewportController.stop();
  chatTravel.destroy();
  edgeControl?.stop();
  endPull(true);
  clearTimeout(errorTimer);
  removeBack?.();
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
        :style="chatStyle"
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
            <button
              type="button"
              aria-label="返回宿舍"
              :style="{ opacity: headerLayout.backOpacity }"
              :tabindex="headerLayout.backOpacity > 0.05 ? undefined : -1"
              :inert="headerLayout.backOpacity > 0.05 ? undefined : true"
              @click="close"
            >
              <van-icon name="arrow-left" />
            </button>
          </header>
          <div ref="historyFrame" class="chat-history-frame">
            <div
              ref="scroll"
              class="chat-history"
              :inert="!committed ? true : undefined"
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
                  v-if="!historyReady"
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
                  v-for="item in visibleItems"
                  :key="item.id"
                  class="chat-bubble"
                  :class="[item.role, { 'is-followup': item.followup }]"
                  :data-message-id="item.id"
                  :data-message-group="item.group"
                  :initial="item.fresh ? bubbleOrigin(item.role) : false"
                  :animate="{ opacity: 1, x: 0, y: 0, scale: 1 }"
                  :transition="motionTransition"
                  ><ChatReplyText
                    :text="item.text"
                    :animated="item.role === 'assistant' && !!item.fresh"
                /></motion.div>
                <motion.div
                  v-if="thinking && historyReady"
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
                  v-for="a in visibleReminders"
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
                <button
                  v-if="historyReady && hasConversation"
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
            <div class="chat-dock">
              <!-- The panel wrapper is the only owner of reversible size. Its
                   content may scroll locally but never overlays the composer. -->
              <div
                ref="dockPanel"
                class="chat-dock-panel"
                :style="{ height: panelHeight + 'px' }"
                @transitionend="finishPanelClose"
              >
                <div
                  ref="dockContent"
                  class="chat-dock-content"
                  :style="{ maxHeight: panelMaxHeight + 'px' }"
                >
                  <div ref="dockInner" class="chat-dock-inner">
                    <div
                      v-if="displayedNote"
                      class="chat-dock-note"
                      :class="{ 'is-leaving': !notes.active.value }"
                      :inert="notes.active.value ? undefined : true"
                    >
                      <ConversationNoteFlow
                        :state="displayedNote"
                        :style="{
                          maxHeight: Math.max(36, panelMaxHeight - 8) + 'px',
                        }"
                        :members="members || []"
                        :member-id="memberId"
                        @choose="
                          notes.dispatch({ type: 'choose', target: $event })
                        "
                        @edit="notes.dispatch({ type: 'edit', field: $event })"
                        @cancel="notes.dispatch({ type: 'cancel' })"
                        @confirm="notes.dispatch({ type: 'submit' })"
                      />
                    </div>
                    <div
                      v-else
                      ref="quickRow"
                      class="chat-quick-prompts"
                      :class="{ 'is-hidden': !suggestionsVisible }"
                      :inert="!suggestionsVisible ? true : undefined"
                      :aria-hidden="!suggestionsVisible"
                      data-testid="chat-quick-prompts"
                    >
                      <button
                        type="button"
                        :disabled="busy || !!actionBusy || phase !== 'open'"
                        @click="startQuickNote"
                      >
                        我要留言
                      </button>
                      <button
                        v-for="prompt in quickPrompts"
                        :key="prompt"
                        type="button"
                        :disabled="busy || !available"
                        @click="useQuickPrompt(prompt)"
                      >
                        {{ prompt }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
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
                @resize="queueLayout"
                @send="send"
              />
            </div>
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
  opacity: 0;
  position: fixed;
  inset: 0;
  z-index: 2100;
  background: #0005;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.companion-chat {
  /* Local 1–3% lift only for the conversation surfaces; the rest of the app
     keeps its existing palette. The glass alpha and edges are unchanged. */
  --chat-tint: var(--ui-tint-3);
  --chat-glass: color-mix(in srgb, var(--chat-tint) 82%, transparent);
  position: fixed;
  inset-inline: 0;
  max-width: 520px;
  margin: auto;
  z-index: 2101;
  outline: 0;
  color: var(--ui-ink);
  /* The ball top keeps the real safe area while its base and gap interpolate
     from the keyboard progress. Every header metric below derives from the
     same progress value. */
  --chat-ball-top: max(
    var(--chat-ball-top-base, 48px),
    calc(env(safe-area-inset-top) + var(--chat-ball-safe-gap, 28px))
  );
  --chat-toolbar-extra: 128px;
  --chat-toolbar-pad-offset: 12px;
  --chat-history-extra: 144px;
  --chat-frost-extra: 144px;
  --chat-nameplate-offset: 96px;
  --chat-nameplate-font: 14px;
  --chat-nameplate-pad-y: 5px;
  --chat-nameplate-pad-x: 18px;
  --chat-ball-scale: 1;
  --chat-history-bottom-extra: 22px;
  touch-action: pan-y pinch-zoom;
}
.companion-chat[data-ready="false"] {
  visibility: hidden;
}
.chat-masthead {
  position: absolute;
  z-index: 2;
  inset: 0 0 auto;
  height: calc(var(--chat-ball-top) + var(--chat-frost-extra));
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
  /* The idle gap is preserved; the real keyboard occlusion is subtracted in
     one continuous step. No further safe-area is added while a keyboard is
     attached, so a rounded 34px gap cannot reappear. */
  --chat-safe-bottom: env(safe-area-inset-bottom, 0px);
  --chat-footer-gap-idle: max(58px, calc(var(--chat-safe-bottom) + 34px));
  --chat-footer-gap: max(
    10px,
    calc(var(--chat-footer-gap-idle) - var(--chat-keyboard-inset, 0px))
  );
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
  padding-top: max(
    8px,
    calc(var(--chat-ball-top) - var(--chat-toolbar-pad-offset))
  );
  height: calc(var(--chat-ball-top) + var(--chat-toolbar-extra));
  box-sizing: border-box;
}
.chat-toolbar button {
  pointer-events: auto;
  /* paintReveal owns the toolbar opacity; the back control fades separately so
     the two never write the same property. */
  opacity: var(--chat-back-opacity, 1);
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
  top: calc(var(--chat-ball-top) + var(--chat-nameplate-offset));
  left: 50%;
  translate: -50% 0;
  padding: var(--chat-nameplate-pad-y) var(--chat-nameplate-pad-x);
  border-radius: 16px;
  border: 1px solid #ffffff50;
  background: var(--chat-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-size: var(--chat-nameplate-font);
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
  padding: calc(var(--chat-ball-top) + var(--chat-history-extra)) 4px
    calc(
      var(--chat-footer-height) + var(--chat-footer-gap) +
        var(--chat-history-bottom-extra)
    );
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
  flex-wrap: nowrap;
  height: 44px;
  flex: none;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  touch-action: pan-x;
  scrollbar-width: none;
  gap: 8px;
  margin: 0;
  transition:
    opacity 180ms var(--ui-ease-out),
    transform 240ms var(--ui-ease-out);
}
.chat-quick-prompts::-webkit-scrollbar {
  display: none;
}
.chat-quick-prompts.is-hidden {
  opacity: 0;
  transform: translateY(4px) scale(0.985);
  pointer-events: none;
}
.chat-quick-prompts button {
  flex: 0 0 auto;
  white-space: nowrap;
  max-height: 42px;
  border: 1px solid #ffffff55;
  border-radius: 20px;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  color: var(--ui-ink);
  background: var(--chat-glass);
}
/* Note, suggestions and composer share this dock. The panel is the one
   interruptible size owner; its content scrolls locally when space is short. */
.chat-dock {
  position: relative;
  width: 100%;
}
.chat-dock-panel {
  height: 0;
  overflow: hidden;
  transition: height 260ms var(--ui-ease-out);
}
.chat-dock-content {
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}
.chat-dock-content::-webkit-scrollbar {
  display: none;
}
.chat-dock-inner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 8px;
}
.chat-dock-note {
  width: 100%;
  opacity: 1;
  transform-origin: center bottom;
  transition:
    opacity 200ms var(--ui-ease-out),
    transform 260ms var(--ui-ease-out);
}
.chat-dock-note :deep(.conversation-note) {
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}
.chat-dock-note :deep(.conversation-note)::-webkit-scrollbar {
  display: none;
}
.chat-dock-note.is-leaving {
  opacity: 0;
  transform: translateY(5px) scale(0.985);
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
  color: var(--ui-chat-body-ink);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  line-break: loose;
  text-wrap: pretty;
  transform-origin: bottom left;
}
.chat-bubble.is-followup {
  margin-top: -6px;
}
.chat-bubble.user {
  align-self: flex-end;
  border-radius: 20px 20px 7px 20px;
  background: color-mix(in srgb, var(--ui-surface-muted) 88%, transparent);
  transform-origin: bottom right;
}
:global(html[data-theme="dark"]) .chat-bubble {
  font-weight: 450;
}
:global(html[data-theme="dark"]) .chat-reminder strong {
  font-weight: 610;
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
.chat-reminder time {
  font-variant-numeric: tabular-nums;
}
.chat-reminder strong {
  font-size: 20px;
  color: var(--ui-chat-title-ink);
}
.chat-reminder p,
.chat-confirm p {
  margin: 0;
  line-height: 1.5;
  line-break: loose;
  text-wrap: pretty;
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
  /* chatTravel owns the outer .chat-ball transform; this inner scale is the
     only compact-scale driver. No transition: viewport samples are the frames. */
  transform: scale(var(--chat-ball-scale, 1));
}
/* Fallbacks for the first paint before the derived inline values arrive. The
   inline values use the same idle numbers, so a keyboard-free view is exact. */
.is-compact {
  --chat-ball-top-base: 18px;
  --chat-ball-safe-gap: 8px;
  --chat-toolbar-extra: 90px;
  --chat-toolbar-pad-offset: 6px;
  --chat-history-extra: 98px;
  --chat-frost-extra: 107px;
  --chat-nameplate-offset: 61px;
  --chat-nameplate-font: 12px;
  --chat-nameplate-pad-y: 3px;
  --chat-nameplate-pad-x: 12px;
  --chat-history-bottom-extra: 12px;
}
.is-compact .chat-surface {
  --chat-footer-gap-idle: max(12px, var(--chat-safe-bottom));
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
  .chat-dock-panel,
  .chat-dock-note,
  .chat-quick-prompts,
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
