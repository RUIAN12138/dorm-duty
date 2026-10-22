<script setup lang="ts">
import {
  revealPage,
  cancelPageReveal,
  pageLayers,
} from "../interaction/pageReveal";
import { provideSheetNavigation } from "../interaction/sheetNavigation";
import CompanionChat from "./CompanionChat.vue";
import DormCompanion from "./DormCompanion.vue";
import CompanionSettings from "./CompanionSettings.vue";
import {
  companionPreview,
  companionEnabled,
  errorEmotion,
  companionEntering,
} from "../interaction/companion";
import LoadingSkeleton from "./LoadingSkeleton.vue";
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onBeforeUnmount,
  onUnmounted,
  ref,
  h,
  watch,
} from "vue";
import { completionFeedback } from "../interaction/completionFeedback";
import { showToast } from "../interaction/notice";
import { createVelocityTracker, rubberBand } from "../interaction/gestures";
import { useRouter } from "vue-router";
import { ApiError } from "../api";
import { applyCalendarReceipt } from "../interaction/calendarRecords";
import { completeChore } from "../api/completion";
import {
  choreRequest,
  getChoreBoard,
  type ChoreBoardData,
  type ChoreMember,
  type ChoreReminder,
  type ChoreCompletion,
  type ChoreTask,
} from "../api/chores";
import RoundProgress from "./RoundProgress.vue";
import WaterNudge from "./WaterNudge.vue";
import WaterExceptionSheet from "./WaterExceptionSheet.vue";
import WaterHandoffName from "./WaterHandoffName.vue";
import WaterOrderSheet from "./WaterOrderSheet.vue";
import TaskTitle from "./TaskTitle.vue";
import CompletionAction from "./CompletionAction.vue";
import GalaxySpinner from "./GalaxySpinner.vue";
import ChoreMenu, { type MenuAction } from "./ChoreMenu.vue";
import ChoreMessages from "./ChoreMessages.vue";
import ReminderBanner from "./ReminderBanner.vue";
import RefreshNotice from "./RefreshNotice.vue";
import { useReminderBanner } from "../composables/useReminderBanner";
import ChoreReminderSheet from "./ChoreReminderSheet.vue";
const settingsNavigation = provideSheetNavigation();

import { lastWaterNudge, waterNudge, waterNudgeTime } from "../api/waterNudge";
import AsyncPageError from "./AsyncPageError.vue";
const loadCalendarPage = () => import("./ChoreCalendar.vue");
const ChoreCalendar = defineAsyncComponent({
  loader: loadCalendarPage,
  loadingComponent: {
    render: () => h(LoadingSkeleton, { variant: "calendar" }),
  },
  errorComponent: AsyncPageError,
  delay: 0,
  timeout: 15000,
});
// Warm code, never room data, outside the first page's rendering work. A failed
// warm-up is optional: the async component retains its loading/error/retry path.
let cancelCalendarWarmup: (() => void) | undefined;
onMounted(() => {
  const warm = () => {
    if (!document.hidden) void loadCalendarPage().catch(() => {});
  };
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(warm, { timeout: 1000 });
    cancelCalendarWarmup = () => window.cancelIdleCallback(id);
  } else {
    const id = window.setTimeout(warm, 200);
    cancelCalendarWarmup = () => window.clearTimeout(id);
  }
});
onBeforeUnmount(() => cancelCalendarWarmup?.());
import ChoreSettings from "./ChoreSettings.vue";
import ChorePushSettings from "./ChorePushSettings.vue";
import CreatorRecovery from "./CreatorRecovery.vue";
import { syncMemberPush } from "../api/memberPush";
import {
  createBackgroundRefresh,
  createPushSyncGate,
} from "../interaction/backgroundRefresh";
import { onNativePushReady } from "../api/nativePush";
import ElasticSheet from "./ElasticSheet.vue";
import MemberMark from "./MemberMark.vue";
import MarkerPicker from "./MarkerPicker.vue";
import { useReminderInbox } from "../composables/useReminderInbox";
import { createCalendarViewMemory } from "../interaction/calendarViewMemory";
import { useMarkerEditor } from "../composables/useMarkerEditor";
import { createTaskSwipe } from "../interaction/taskSwipe";
import { navigationOrigin, motionAllowed } from "../interaction/motion";
const props = defineProps<{
  invite: string;
  dormName: string;
  memberId: number;
  token: string;
  demo: boolean;
  section: "duty" | "water" | "calendar";
}>();
const router = useRouter();
const pushSync = createPushSyncGate(syncMemberPush);
const emit = defineEmits<{
  expired: [];
  member: [value: ChoreMember];
  "switch-member": [];
  "join-dorm": [];
  "create-dorm": [];
  "recover-owner": [];
  "email-account": [];
  "exit-demo": [];
}>();
const board = ref<ChoreBoardData | null>(null),
  loading = ref(false),
  error = ref(""),
  actionError = ref(""),
  busy = ref("");
const completionReceipt = ref<ChoreTask | null>(null);
const completionEpoch = ref(0);
const completionMorphId = ref<number | null>(null);
let completionMorphTimer: ReturnType<typeof setTimeout> | undefined;
function settleCompletion(id: number) {
  if (completionMorphId.value === id) completionMorphId.value = null;
  if (settlingTask.value?.id === id) {
    const finished = settlingTask.value;
    clearTimeout(settleTaskTimer);
    settlingTask.value = null;
    showCompletionPraise(finished);
  }
}
onUnmounted(() => clearTimeout(completionMorphTimer));
const waterReceipt = ref<ChoreTask | null>(null);
const waterActionTask = computed(
  () =>
    waterReceipt.value ||
    (water.value?.can_complete ||
    (props.demo && water.value?.assignee_id === props.memberId)
      ? water.value
      : null),
);
const completionSyncPending = ref(false),
  syncAction = ref("打卡");
const showSyncStatus = ref(false);
let syncStatusTimer: ReturnType<typeof setTimeout> | undefined;
watch(completionSyncPending, (pending) => {
  clearTimeout(syncStatusTimer);
  showSyncStatus.value = false;
  if (pending)
    syncStatusTimer = setTimeout(() => {
      showSyncStatus.value = true;
    }, 700);
});
onUnmounted(() => clearTimeout(syncStatusTimer));
const calendarMemory = ref(createCalendarViewMemory());
const month = ref(
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
  })
    .format(new Date())
    .replace("/", "-"),
);
// Format YYYY-MM explicitly; some browsers format en-CA month/year in another order.
const initialParts = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
}).formatToParts(new Date());
month.value = `${initialParts.find((part) => part.type === "year")?.value}-${initialParts.find((part) => part.type === "month")?.value}`;
const messagesOpen = ref(false),
  settingsOpen = ref(false),
  settingsCategory = ref<ChoreTask["key"]>(),
  reminderOpen = ref(false),
  markerOpen = ref(false);
const toolsOpen = ref(false),
  preferencesOpen = ref(false),
  companionOpen = ref(false),
  orderOpen = ref(false);
let alive = true;
const waterExceptionOpen = ref(false);
const roundOpen = ref(false);
const roundVisibleCount = ref(0);
const pushOpen = ref(false);
const recoveryOpen = ref(false);
let queuedTool: (() => void) | null = null;
function openTools() {
  if (detailTask.value) {
    queuedTool = () => {
      toolsOpen.value = true;
    };
    detailOpen.value = false;
  } else toolsOpen.value = true;
}
function menuAction(action: MenuAction) {
  const actions: Record<MenuAction, () => void> = {
    order: () => {
      orderOpen.value = true;
    },
    reminder: () => openReminder(),
    messages: () => {
      messagesOpen.value = true;
    },
    join: () => emit("join-dorm"),
    push: () => {
      pushOpen.value = true;
    },
    companion: () => {
      companionOpen.value = true;
    },
    preferences: () => {
      preferencesOpen.value = true;
    },
    settings: () => {
      settingsCategory.value = undefined;
      settingsOpen.value = true;
    },
    email: () => emit("email-account"),
    identity: () => emit("switch-member"),
    marker: openMarker,
    create: () => emit("create-dorm"),
    recovery: () =>
      board.value?.is_creator
        ? (recoveryOpen.value = true)
        : emit("recover-owner"),
    refresh: () => {
      void refreshArrangements();
    },
  };
  const insideSettings = [
    "order",
    "reminder",
    "messages",
    "push",
    "companion",
    "preferences",
    "settings",
    "marker",
    "refresh",
    "email",
    "recovery",
  ].includes(action);
  if (insideSettings) actions[action]();
  else {
    // Route/account entry still closes settings before leaving this page.
    queuedTool = actions[action];
    toolsOpen.value = false;
    preferencesOpen.value = false;
  }
}
function runQueuedTool() {
  // Embedded content exits before the root sheet. Route/entry actions must
  // wait for the root's closed event, otherwise its cleanup closes the new UI.
  if (settingsNavigation.active.value) return;
  const action = queuedTool;
  queuedTool = null;
  action?.();
}
const selectedTaskId = ref<number | null>(null);
const selectedTaskKey = ref<ChoreTask["key"] | null>(null);
const titleAnimation = ref(true),
  titleDirection = ref(1);
function chooseDutyTask(id: number, event: MouseEvent) {
  titleAnimation.value = true;
  const previous = personalTasks.value.findIndex(
      (task) => task.id === activeDutyTask.value?.id,
    ),
    next = personalTasks.value.findIndex((task) => task.id === id);
  titleDirection.value = next < previous ? -1 : 1;
  if (settlingTask.value && settlingTask.value.id !== id)
    settleCompletion(settlingTask.value.id);
  selectedTaskId.value = id;
  selectedTaskKey.value =
    personalTasks.value.find((task) => task.id === id)?.key || null;
}
const titleOffset = ref(0),
  titleDragging = ref(false);
const taskSwipe = createTaskSwipe(
  (value, dragging) => {
    titleOffset.value = value;
    titleDragging.value = dragging;
  },
  (direction) => {
    const index = personalTasks.value.findIndex(
      (task) => task.id === activeDutyTask.value?.id,
    );
    const next = personalTasks.value[index + direction];
    if (next) {
      titleDirection.value = direction;
      titleAnimation.value = true;
      selectedTaskId.value = next.id;
      selectedTaskKey.value = next.key;
    } else if (personalTasks.value.length > 1)
      showToast(direction > 0 ? "已经是最后一项" : "已经是第一项");
  },
);
const detailTask = ref<ChoreTask | null>(null);
const chatOpen = ref(false),
  chatPresent = ref(false),
  chatOrigin = ref<DOMRect | null>(null),
  companionHome = ref<HTMLElement>();
function companionReturnRect() {
  return (
    companionHome.value
      ?.querySelector(".dorm-companion")
      ?.getBoundingClientRect() || chatOrigin.value
  );
}
function openChat(origin: DOMRect) {
  if (demoChatUnavailable()) return;
  chatOrigin.value = origin;
  chatOpen.value = true;
}
function demoChatUnavailable() {
  if (!props.demo) return false;
  demoNotice();
  return true;
}
const detailOpen = ref(false);
const detailMotion = ref<"shared" | "bottom">("shared");
const detailOrigin = ref<DOMRect | null>(null);
const sectionOrder = ["duty", "water", "calendar"];
const sectionPaths = ["/", "/water", "/calendar"];
const sectionSwipeOffset = ref(0);
const sectionSwipeDragging = ref(false);
let sectionSuppressClickUntil = 0;
function sectionSwipeClick(event: MouseEvent) {
  if (performance.now() < sectionSuppressClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}
let sectionPointer: {
  id: number;
  x: number;
  y: number;
  horizontal: boolean;
  surface: HTMLElement;
  velocity: ReturnType<typeof createVelocityTracker>;
} | null = null;
let sectionControlPointer: { id: number; x: number; y: number } | null = null;
function resetSectionSwipe() {
  const active = sectionPointer;
  sectionPointer = null;
  sectionControlPointer = null;
  sectionSwipeDragging.value = false;
  sectionSwipeOffset.value = 0;
  if (active?.surface.hasPointerCapture(active.id))
    active.surface.releasePointerCapture(active.id);
}
function sectionSwipeDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || sectionPointer) return;
  if (
    !boardRoot.value ||
    !(event.target instanceof Element) ||
    !event.target.closest(".app-stage.is-signed-in")
  )
    return;
  if (
    event.clientX < 24 ||
    event.clientX > window.innerWidth - 24 ||
    chatPresent.value ||
    document.querySelector('.sheet-layer,[role="dialog"]')
  )
    return;
  // Observe (without capture or navigation) drags on the two tap actions, so a
  // horizontal swipe cannot turn into an accidental completion or reminder.
  if (event.target.closest('.completion-surface,[data-testid="water-nudge"]')) {
    sectionControlPointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    return;
  }
  if (
    !(event.target instanceof Element) ||
    !event.target.matches("div,section,header,main,article,.identity-name")
  )
    return;
  if (
    !(event.target instanceof Element) ||
    event.target.closest(
      "button,a,input,textarea,select,[role=tablist],[role=slider],[contenteditable=true],.calendar-surface,.task-title-stage,.water-title-stage,.task-selector,.completion-surface,.round-progress,.companion-frame,.stats-mode,.deck-stage,[role=button],[draggable=true],[data-sheet-scroll],[data-page-gesture],[data-native-scroll]",
    )
  )
    return;
  sectionPointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    horizontal: false,
    surface: boardRoot.value,
    velocity: createVelocityTracker(event.clientX, performance.now()),
  };
}
function sectionSwipeMove(event: PointerEvent) {
  const control = sectionControlPointer;
  if (
    control?.id === event.pointerId &&
    Math.abs(event.clientX - control.x) > 12 &&
    Math.abs(event.clientX - control.x) > Math.abs(event.clientY - control.y)
  )
    sectionSuppressClickUntil = performance.now() + 500;
  const active = sectionPointer;
  if (!active || active.id !== event.pointerId) return;
  const x = event.clientX - active.x;
  const y = event.clientY - active.y;
  active.velocity.add(event.clientX, performance.now());
  if (!active.horizontal) {
    if (Math.abs(y) > 8 && Math.abs(y) >= Math.abs(x)) {
      resetSectionSwipe();
      return;
    }
    if (Math.abs(x) < 8 || Math.abs(x) <= Math.abs(y) * 1.2) return;
    active.horizontal = true;
    active.surface.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
  sectionSuppressClickUntil = performance.now() + 500;
  sectionSwipeDragging.value = true;
  sectionSwipeOffset.value = rubberBand(x, 150);
}
function sectionSwipeUp(event: PointerEvent) {
  if (sectionControlPointer?.id === event.pointerId)
    sectionControlPointer = null;
  const active = sectionPointer;
  if (!active || active.id !== event.pointerId) return;
  const x = event.clientX - active.x;
  const speed = active.velocity.read(performance.now());
  const projected = x + speed * 160;
  const commit =
    active.horizontal &&
    Math.abs(x) >= 18 &&
    (Math.abs(x) >= 56 || Math.abs(projected) >= 72);
  const travel = Math.abs(speed) > 0.3 ? projected : x;
  resetSectionSwipe();
  if (!commit) return;
  const index = sectionOrder.indexOf(props.section);
  const next = index + (travel < 0 ? 1 : -1);
  const path = sectionPaths[next];
  if (path) void router.push(path);
  else showToast(x < 0 ? "已经是最后一页" : "已经是第一页");
}
function sectionSwipeCancel(event: PointerEvent) {
  if (sectionControlPointer?.id === event.pointerId)
    sectionControlPointer = null;
  if (
    event.type === "lostpointercapture" &&
    (event.target !== sectionPointer?.surface ||
      sectionPointer?.surface.hasPointerCapture(event.pointerId))
  )
    return;
  if (sectionPointer?.id === event.pointerId) resetSectionSwipe();
}
function sectionHidden() {
  if (document.hidden) {
    resetSectionSwipe();
    backgroundRefresh.interrupt();
    // Suspended mobile fetches may otherwise hold `loading` through resume.
    // Only the read request is cancelled; task mutations have their own flow.
    if (loading.value) {
      ++requestId;
      controller?.abort();
      loading.value = false;
    }
  }
}
onMounted(() => {
  // ScreenStage owns the safe-area blank space outside the board itself.
  // Listen at the window, but admit only signed-in stage blank regions above.
  window.addEventListener("pointerdown", sectionSwipeDown);
  window.addEventListener("pointermove", sectionSwipeMove, { passive: false });
  window.addEventListener("pointerup", sectionSwipeUp);
  window.addEventListener("pointercancel", sectionSwipeCancel);
  window.addEventListener("lostpointercapture", sectionSwipeCancel);
  window.addEventListener("blur", resetSectionSwipe);
  document.addEventListener("visibilitychange", sectionHidden);
});
onUnmounted(() => {
  resetSectionSwipe();
  window.removeEventListener("pointerdown", sectionSwipeDown);
  window.removeEventListener("pointermove", sectionSwipeMove);
  window.removeEventListener("pointerup", sectionSwipeUp);
  window.removeEventListener("pointercancel", sectionSwipeCancel);
  window.removeEventListener("lostpointercapture", sectionSwipeCancel);
  window.removeEventListener("blur", resetSectionSwipe);
  document.removeEventListener("visibilitychange", sectionHidden);
});
watch(
  () => props.section,
  () => {
    taskSwipe.cancel();
    resetSectionSwipe();
    detailOpen.value = false;
    if (props.section === "calendar" && board.value && !busy.value) void load();
  },
);
function openTask(task: ChoreTask, event: MouseEvent) {
  if (task.key !== "water" && taskSwipe.suppressesClick(event)) return;
  detailMotion.value = "bottom";
  detailOrigin.value = null;
  detailTask.value = task;
  detailOpen.value = true;
}
function showEntered(element: Element) {
  element.removeAttribute("aria-hidden");
  element.removeAttribute("inert");
  navigationOrigin.value = null;
}
const boardRoot = ref<HTMLElement>();
onBeforeUnmount(() => {
  if (boardRoot.value) cancelPageReveal(boardRoot.value);
});
function enterPage(element: Element) {
  // Async calendar owns its entrance after its actual content has mounted.
  if (element.classList.contains("calendar-page")) return;
  if (!companionEntering.value) revealPage(element, pageLayers);
}
function hideLeaving(element: Element) {
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("inert", "");
}
let controller: AbortController | null = null,
  requestId = 0;
let poll: ReturnType<typeof setInterval> | null = null,
  midnight: ReturnType<typeof setTimeout> | null = null;
const personalToday = computed(
  () => board.value?.today_tasks.filter((task) => task.key !== "water") || [],
);
const personalNext = computed(
  () =>
    board.value?.next_tasks
      .filter((task) => task.key !== "water")
      .sort((a, b) => a.duty_date.localeCompare(b.duty_date)) || [],
);
const personalTasks = computed(() =>
  personalToday.value.length ? personalToday.value : personalNext.value,
);
const completedOpen = ref(false);
const completedTasks = computed(() => {
  const own = [
    ...personalToday.value,
    ...(board.value?.undo_tasks || []),
  ].filter(
    (task) =>
      task.status === "completed" &&
      (props.section === "water" ? task.key === "water" : task.key !== "water"),
  );
  return [...new Map(own.map((task) => [task.id, task])).values()].sort(
    (a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""),
  );
});
const praiseTask = ref<ChoreTask | null>(null);
const arrivalReveal = ref(companionEntering.value);
let arrivalTimer: ReturnType<typeof setTimeout> | undefined;
watch(companionEntering, (pending) => {
  if (!pending && arrivalReveal.value)
    arrivalTimer = setTimeout(() => (arrivalReveal.value = false), 1200);
  if (!pending)
    void nextTick(() =>
      revealPage(
        boardRoot.value?.querySelector(
          ".board-focus>.focus-pane:not([inert])",
        ) || null,
        pageLayers,
      ),
    );
});
onUnmounted(() => clearTimeout(arrivalTimer));
const chatNoteRequest = ref<{ key: number; target: number }>();
let chatNoteSequence = 0;
const companionPulse = ref("");
let companionPulseTimer: ReturnType<typeof setTimeout> | undefined;
function pulseCompanion(id: string, duration = 2600) {
  clearTimeout(companionPulseTimer);
  companionPulse.value = id;
  companionPulseTimer = setTimeout(() => (companionPulse.value = ""), duration);
}
onUnmounted(() => clearTimeout(companionPulseTimer));
watch(
  () => props.section,
  (section) =>
    pulseCompanion(
      section === "calendar" ? "40" : section === "water" ? "31" : "03",
    ),
);
watch(busy, (current, previous) => {
  if (!current && previous.startsWith("undo-") && !actionError.value)
    pulseCompanion("18");
});
const companionMood = computed(
  () =>
    companionPreview.value ||
    (error.value || actionError.value
      ? errorEmotion(error.value || actionError.value)
      : praiseTask.value
        ? "33"
        : /失败|稍后重试/.test(nudgeStatus.value)
          ? "11"
          : busy.value
            ? "32"
            : loading.value
              ? "36"
              : companionPulse.value ||
                (reminderOpen.value
                  ? "35"
                  : messagesOpen.value
                    ? "39"
                    : settingsOpen.value || orderOpen.value
                      ? "30"
                      : detailOpen.value
                        ? "16"
                        : completedOpen.value
                          ? "37"
                          : personalToday.value.length &&
                              personalToday.value.every(
                                (t) => t.status === "completed",
                              )
                            ? "19"
                            : "02")),
);
const praiseElement = ref<HTMLElement>();
const praiseTop = ref<number | null>(null);
let praiseTimer: ReturnType<typeof setTimeout> | undefined;
onUnmounted(() => clearTimeout(praiseTimer));
function showCompletionPraise(task: ChoreTask) {
  praiseTop.value = null;
  praiseTask.value = task;
  clearTimeout(praiseTimer);
  praiseTimer = setTimeout(() => (praiseTask.value = null), 2200);
  void nextTick(positionPraise);
}
function positionPraise() {
  const el = praiseElement.value;
  const nav = document.querySelector(".chore-bottom-nav");
  if (!el || !nav || !praiseTask.value) return;
  const height = el.offsetHeight;
  const end = nav.getBoundingClientRect().top - 12;
  let cursor =
    (document.querySelector(".board-identity")?.getBoundingClientRect()
      .bottom || 56) + 4;
  const preferred = end - (innerHeight <= 650 ? 12 : 42) - height;
  const rows = [
    ...document.querySelectorAll(
      ".board-focus .hero-caption, .board-focus .task-selector, .board-focus .task-title-stage, .board-focus .water-title-stage, .board-focus .completion-surface, .board-focus .round-progress, .board-focus .water-nudge-actions",
    ),
  ]
    .map((node) => node.getBoundingClientRect())
    .filter((r) => r.width && r.height && r.bottom > cursor && r.top < end)
    .sort((a, b) => a.top - b.top);
  const candidates: number[] = [];
  for (const row of [...rows, { top: end, bottom: end }]) {
    if (row.top - cursor >= height + 12)
      candidates.push(
        Math.max(cursor + 6, Math.min(row.top - height - 6, preferred)),
      );
    cursor = Math.max(cursor, row.bottom);
  }
  praiseTop.value =
    candidates.sort(
      (a, b) => Math.abs(a - preferred) - Math.abs(b - preferred),
    )[0] ?? preferred;
}
onMounted(() => window.addEventListener("resize", positionPraise));
onUnmounted(() => window.removeEventListener("resize", positionPraise));
function canUndoTask(id: number) {
  return board.value?.undo_tasks.some((task) => task.id === id) || false;
}

const settlingTask = ref<ChoreTask | null>(null);
let settleTaskTimer: ReturnType<typeof setTimeout> | undefined;
onUnmounted(() => clearTimeout(settleTaskTimer));
const activeDutyTask = computed(
  () =>
    (settlingTask.value?.key !== "water" ? settlingTask.value : null) ||
    personalTasks.value.find((task) => task.id === selectedTaskId.value) ||
    personalTasks.value.find((task) => task.key === selectedTaskKey.value) ||
    personalTasks.value.find((task) => task.status !== "completed") ||
    personalTasks.value[0] ||
    null,
);
const activeRound = computed(
  () =>
    board.value?.rounds?.find(
      (round) => round.key === activeDutyTask.value?.key,
    ) || null,
);
const completedRoundReceipt = ref<ChoreBoardData["rounds"][number] | null>(
  null,
);
const displayRound = computed(() => {
  const last = completedRoundReceipt.value;
  const current = activeRound.value;
  return last &&
    current?.key === last.key &&
    current.sequence === last.sequence + 1 &&
    current.completed === 0
    ? last
    : current;
});
watch(roundOpen, (open) => {
  // Size once per opening. Changing the roster filter animates the contents,
  // not the whole sheet jumping to a different height behind them.
  if (open)
    roundVisibleCount.value = displayRound.value?.completions?.length || 0;
  else completedRoundReceipt.value = null;
});

const dutyCaption = computed(() =>
  activeRound.value
    ? activeDutyTask.value?.status === "completed"
      ? "本轮已完成"
      : "这轮你可以做："
    : todayComplete.value
      ? "今天的任务已完成"
      : hasToday.value
        ? "你今天的任务是："
        : hasUpcoming.value
          ? "你下次的任务是："
          : "当前没有任务",
);
const water = computed(() =>
  board.value?.categories.find((category) => category.key === "water")?.enabled
    ? board.value?.water_task || null
    : null,
);
const displayedWater = computed(() =>
  settlingTask.value?.key === "water" ? settlingTask.value : water.value,
);
const nudgeStatus = ref("");
const nudgeSentAt = ref<string | null>(null);
const nudgeNow = ref(Date.now());
let nudgeClock: ReturnType<typeof setInterval> | null = null;
function updateNudgeClock() {
  nudgeNow.value = Date.now();
}
onMounted(() => {
  nudgeClock = setInterval(updateNudgeClock, 15000);
  document.addEventListener("visibilitychange", updateNudgeClock);
});
onUnmounted(() => {
  taskSwipe.cancel();
  if (nudgeClock) clearInterval(nudgeClock);
  document.removeEventListener("visibilitychange", updateNudgeClock);
});
const nudgeCaption = computed(() => {
  const status = nudgeStatus.value;
  if (!status || status === "已提醒" || status === "刚刚已提醒") {
    if (nudgeSentAt.value)
      return waterNudgeTime(nudgeSentAt.value, new Date(nudgeNow.value));
  }
  return status || "";
});
let nudgeController: AbortController | null = null;
watch(
  [() => props.invite, () => props.memberId, () => water.value?.id],
  () => {
    nudgeController?.abort();
    nudgeStatus.value = "";
    nudgeSentAt.value =
      !props.demo && water.value
        ? lastWaterNudge(`${props.invite}:${props.memberId}:${water.value.id}`)
        : null;
  },
  { immediate: true },
);
onUnmounted(() => nudgeController?.abort());
const nextWaterPerson = computed(() => {
  const order = board.value?.water_order || [];
  const index = order.indexOf(water.value?.assignee_id || 0);
  const id = order[(index + 1) % order.length];
  return id === undefined ? null : currentMember(id);
});
const hasToday = computed(() => personalToday.value.length > 0);
const hasUpcoming = computed(() => personalNext.value.length > 0);
const todayComplete = computed(
  () =>
    personalToday.value.length > 0 &&
    personalToday.value.every((task) => task.status === "completed"),
);
const unread = computed(
  () => board.value?.reminders.filter((note) => !note.read_at) || [],
);
const reminderBanner = useReminderBanner(() => ({
  identity: `${props.invite}:${props.memberId}`,
  notes: unread.value,
  visible: !props.demo && document.visibilityState === "visible",
  inboxOpen: messagesOpen.value,
  blocked:
    !!busy.value ||
    settingsOpen.value ||
    reminderOpen.value ||
    markerOpen.value ||
    toolsOpen.value ||
    preferencesOpen.value ||
    companionOpen.value ||
    chatPresent.value ||
    orderOpen.value ||
    roundOpen.value ||
    pushOpen.value ||
    recoveryOpen.value ||
    !!detailTask.value ||
    !!document.querySelector(".sheet-layer"),
}));
function presentNewReminders() {
  reminderBanner.refresh();
  if (messagesOpen.value)
    unread.value.forEach((note) => acknowledgeMessage(note.id));
  const shown = reminderBanner.active.value;
  if (
    shown &&
    presentedMessages.has(`${props.invite}:${props.memberId}:${shown.id}`)
  )
    void acknowledgeMessage(shown.id);
}
const presentedMessages = new Set<string>(),
  receivedMessages = new Set<string>(),
  receivingMessages = new Set<string>();
async function acknowledgeMessage(id: number) {
  if (
    props.demo ||
    document.hidden ||
    !props.token ||
    !unread.value.some((note) => note.id === id)
  )
    return;
  const scope = `${props.invite}:${props.memberId}:${id}`;
  if (receivedMessages.has(scope) || receivingMessages.has(scope)) return;
  receivingMessages.add(scope);
  try {
    await choreRequest(`/chores/reminders/${id}/received`, props.token, {
      method: "PATCH",
    });
    receivedMessages.add(scope);
  } catch {
    /* No confirmed delivery: email remains the fallback; retry on poll. */
  } finally {
    receivingMessages.delete(scope);
  }
}
function messagePresented(id: number) {
  if (reminderBanner.active.value?.id !== id || document.hidden) return;
  presentedMessages.add(`${props.invite}:${props.memberId}:${id}`);
  void acknowledgeMessage(id);
}
watch(
  [messagesOpen, unread],
  () => {
    if (messagesOpen.value)
      unread.value.forEach((note) => acknowledgeMessage(note.id));
  },
  { flush: "post" },
);
async function dismissBannerMessage() {
  const id = reminderBanner.active.value?.id;
  reminderBanner.dismiss();
  if (id) {
    const confirmed = await markRead(id, true);
    if (alive && !confirmed) showToast("未能标为已读，请稍后重试");
  }
}
function replyBannerMessage() {
  const note = reminderBanner.active.value;
  if (!note) return;
  const sender = board.value?.members.find(
    (m) => m.user_id === note.sender_id && m.user_id !== props.memberId,
  );
  if (!sender) {
    openBannerMessages();
    return;
  }
  chatNoteRequest.value = { key: ++chatNoteSequence, target: sender.user_id };
  reminderBanner.dismiss();
  openChat(companionReturnRect() || new DOMRect(20, 20, 52, 52));
}
function openBannerMessages() {
  messagesOpen.value = true;
  reminderBanner.dismiss();
}

watch(
  [
    unread,
    busy,
    settingsOpen,
    reminderOpen,
    markerOpen,
    toolsOpen,
    preferencesOpen,
    companionOpen,
    chatPresent,
    orderOpen,
    roundOpen,
    pushOpen,
    recoveryOpen,
    detailTask,
    messagesOpen,
  ],
  presentNewReminders,
  { flush: "post" },
);
const occupied = computed(
  () =>
    board.value?.members
      .filter((person) => person.user_id !== props.memberId)
      .map((person) => person.marker_id) || [],
);
function dateText(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(`${value}T12:00:00+08:00`));
}
function clock(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
function currentMember(id: number) {
  return board.value?.members.find((person) => person.user_id === id);
}
function statusText(task: ChoreTask) {
  return task.status === "completed"
    ? "已完成"
    : task.mode === "self_round"
      ? "本轮待完成"
      : task.key === "water"
        ? "轮到抬水"
        : task.duty_date > (board.value?.today || "")
          ? "待开始"
          : new Date(task.deadline_at).getTime() <
              new Date(board.value?.server_time || Date.now()).getTime()
            ? "已过截止时间"
            : "待完成";
}
function demoNotice() {
  showToast("游客模式仅供体验，请创建或加入正式宿舍。");
}
function scheduleMidnight(serverTime: string) {
  if (midnight) clearTimeout(midnight);
  const now = new Date(serverTime).getTime();
  if (!Number.isFinite(now)) return;
  const local = new Date(now + 8 * 3600000);
  const next =
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + 1,
    ) -
    8 * 3600000;
  midnight = setTimeout(() => void load(), Math.max(1000, next - now + 1500));
}
async function load(): Promise<boolean> {
  if (document.hidden && board.value) return false;
  controller?.abort();
  const requestController = new AbortController();
  controller = requestController;
  const id = ++requestId;
  loading.value = true;
  if (!board.value) error.value = "";
  try {
    const result = await getChoreBoard(
      props.invite,
      props.memberId,
      month.value,
      props.demo ? "" : props.token,
      requestController.signal,
    );
    if (id !== requestId || requestController.signal.aborted) return false;
    if (result.member.user_id !== props.memberId)
      throw new Error("任务身份已变化，请重新选择室友。");

    if (board.value && result.version < board.value.version) return false;
    result.reminders = reconcileMessages(result.reminders);
    board.value = result;
    backgroundRefresh.markSuccessful();
    error.value = "";
    if (
      waterReceipt.value &&
      !result.undo_tasks.some((t) => t.id === waterReceipt.value?.id)
    )
      waterReceipt.value = null;
    completionSyncPending.value = false;
    if (!props.demo) void pushSync.run(props.token);
    emit("member", result.member);
    scheduleMidnight(result.server_time);
    return true;
  } catch (e) {
    if (id !== requestId || requestController.signal.aborted) return false;
    if (e instanceof ApiError && [401, 428].includes(e.status)) {
      emit("expired");
      return false;
    }
    error.value = (e as Error).message;
    return false;
  } finally {
    if (id === requestId) loading.value = false;
  }
}
async function refreshArrangements() {
  const success = await load();
  if (success) showToast("安排已更新");
}
function acceptCompletion(receipt: ChoreCompletion) {
  if (!board.value) return;
  const finished = receipt.task;
  // Reject reads that began before this confirmed mutation.
  ++requestId;
  controller?.abort();
  loading.value = false;
  backgroundRefresh.interrupt();
  applyCalendarReceipt(board.value, finished);
  completedOpen.value = false;
  completionReceipt.value = finished;
  settlingTask.value = finished;
  clearTimeout(settleTaskTimer);
  settleTaskTimer = setTimeout(
    () => settleCompletion(finished.id),
    motionAllowed() ? 1800 : 0,
  );
  completionEpoch.value++;
  if (motionAllowed()) {
    completionMorphId.value = finished.id;
    clearTimeout(completionMorphTimer);
    completionMorphTimer = setTimeout(
      () => settleCompletion(finished.id),
      1800,
    );
  }
  if (finished.key === "water") waterReceipt.value = finished;
  const existed = board.value.today_tasks.find(
    (task) => task.id === finished.id,
  );
  board.value.today_tasks = board.value.today_tasks.map((task) =>
    task.id === finished.id ? finished : task,
  );
  board.value.next_tasks = board.value.next_tasks.map((task) =>
    task.id === finished.id ? finished : task,
  );
  if (finished.key === "water") {
    board.value.water_task = receipt.next_water;
    if (finished.sequence != null)
      board.value.water_handoff = receipt.water_handoff || {
        id: finished.id,
        sequence: finished.sequence || 0,
        from_member_id: finished.assignee_id,
        completed_at: finished.completed_at!,
      };
  }
  if (detailTask.value?.id === finished.id) detailTask.value = finished;
  const round = board.value.rounds.find(
    (item) => item.key === finished.key && item.sequence === finished.sequence,
  );
  if (round && existed?.status !== "completed") {
    const member = round.members.find(
      (person) => person.user_id === finished.assignee_id,
    );
    if (member && !member.completed) {
      member.completed = true;
      round.completions ||= [];
      round.completions.push({
        user_id: finished.assignee_id,
        nickname: finished.assignee_name,
        marker_id: finished.marker_id,
        id: finished.id,
        completed_at: finished.completed_at!,
      });
      round.completed = round.members.filter(
        (person) => person.completed,
      ).length;
      if (round.completed === round.total)
        completedRoundReceipt.value = JSON.parse(JSON.stringify(round));
    }
  }
  board.value.version = Math.max(board.value.version, receipt.version);
  completionSyncPending.value = true;
}
async function complete(task: ChoreTask, circle = false) {
  if (props.demo) {
    demoNotice();
    return;
  }
  if (
    busy.value ||
    completionSyncPending.value ||
    !task.can_complete ||
    task.status === "completed"
  )
    return;
  if (task.key !== "water") {
    selectedTaskId.value = task.id;
    selectedTaskKey.value = task.key;
  }
  const surface =
    document.querySelector<HTMLElement>(
      `[data-testid="complete-${task.key}-${task.id}"]`,
    ) ||
    document.querySelector<HTMLElement>(
      `[data-testid="complete-circle-${task.id}"]`,
    );
  const feedbackBounds = surface?.getBoundingClientRect();
  syncAction.value = "打卡";
  busy.value = `complete-${task.id}`;
  actionError.value = "";
  try {
    const syncStatus = await completeChore(
      task.id,
      props.token,
      (receipt) => {
        if (!alive) return;
        acceptCompletion(receipt);
        if (circle) completionFeedback(feedbackBounds);
      },
      () => (alive ? load() : Promise.resolve(false)),
    );
    if (syncStatus === "pending") error.value = "";
  } catch (e) {
    actionError.value = (e as Error).message;
  } finally {
    busy.value = "";
  }
}
const recentUndo = computed(
  () =>
    board.value?.undo_tasks?.find((task) =>
      sectionIsWater()
        ? task.key === "water"
        : task.key === activeDutyTask.value?.key,
    ) || null,
);
function sectionIsWater() {
  return props.section === "water";
}
async function undo(id: number) {
  if (props.demo) {
    demoNotice();
    return;
  }
  if (busy.value || completionSyncPending.value) return;
  busy.value = `undo-${id}`;
  actionError.value = "";
  syncAction.value = "撤销";
  try {
    const receipt = await choreRequest<{ task: ChoreTask; version: number }>(
      `/chores/tasks/${id}/undo`,
      props.token,
      { method: "PATCH", body: "{}" },
    );
    if (!alive || !board.value) return;
    if (settlingTask.value?.id === id) {
      clearTimeout(settleTaskTimer);
      settlingTask.value = null;
    }
    completedOpen.value = false;
    if (praiseTask.value?.id === id) praiseTask.value = null;
    if (receipt.task.key === "water") waterReceipt.value = null;
    board.value.today_tasks = board.value.today_tasks.map((t) =>
      t.id === id ? receipt.task : t,
    );
    board.value.undo_tasks = (board.value.undo_tasks || []).filter(
      (t) => t.id !== id,
    );
    ++requestId;
    controller?.abort();
    loading.value = false;
    backgroundRefresh.interrupt();
    applyCalendarReceipt(board.value, receipt.task);
    if (receipt.task.key === "water") {
      if (receipt.task.sequence != null) board.value.water_task = receipt.task;
      else board.value.water_advance_task_id = null;
    } else {
      selectedTaskId.value = id;
      selectedTaskKey.value = receipt.task.key;
    }
    board.value.version = receipt.version;
    completionSyncPending.value = true;
    await load();
  } catch (e) {
    if (alive) actionError.value = (e as Error).message;
  } finally {
    if (alive) busy.value = "";
  }
}
async function nudgeWater() {
  const task = water.value;
  if (!task || task.assignee_id === props.memberId || busy.value) return;
  if (props.demo) {
    nudgeStatus.value = "游客体验 · 未发送提醒";
    return;
  }
  const key = `${props.invite}:${props.memberId}:${task.id}`;
  try {
    nudgeStatus.value = "正在提醒…";
    const status = await waterNudge(key, async () => {
      nudgeController = new AbortController();
      return choreRequest<ChoreReminder>("/chores/remind", props.token, {
        method: "POST",
        signal: nudgeController.signal,
        body: JSON.stringify({
          target_member_id: task.assignee_id,
          task_id: task.id,
        }),
      });
    });
    if (water.value?.id === task.id) {
      updateNudgeClock();
      nudgeSentAt.value = lastWaterNudge(key);
      nudgeStatus.value =
        status === "sending"
          ? "正在提醒…"
          : status === "recent"
            ? "刚刚已提醒"
            : "已提醒";
    }
  } catch (error) {
    if (water.value?.id !== task.id || nudgeController?.signal.aborted) return;
    nudgeStatus.value =
      error instanceof ApiError && error.status === 429
        ? "刚刚已提醒"
        : (error as Error).message;
    if (error instanceof ApiError && error.status === 409) void load();
  }
}
const reminderContext = ref<{ memberId: number; taskId: number } | null>(null);
function openReminder(task?: ChoreTask) {
  if (props.demo) {
    demoNotice();
    return;
  }
  reminderContext.value = task
    ? { memberId: task.assignee_id, taskId: task.id }
    : null;
  reminderOpen.value = true;
}
const {
  error: messageError,
  read: markRead,
  reconcile: reconcileMessages,
} = useReminderInbox(
  () => ({
    open: messagesOpen.value,
    token: props.token,
    invite: props.invite,
    memberId: props.memberId,
  }),
  busy,
  {
    confirmed: (id, readAt) => {
      const note = board.value?.reminders.find((note) => note.id === id);
      if (note) note.read_at = readAt;
      void load();
    },
  },
);
const {
  draft: markerDraft,
  error: markerError,
  save: saveMarker,
} = useMarkerEditor(
  () => ({
    open: markerOpen.value,
    token: props.token,
    memberId: props.memberId,
    current: board.value?.member.marker_id || "",
  }),
  busy,
  {
    close: () => {
      markerOpen.value = false;
    },
    saved: (marker) => {
      if (board.value) {
        board.value.member.marker_id = marker;
        const person = board.value.members.find(
          (m) => m.user_id === props.memberId,
        );
        if (person) person.marker_id = marker;
        emit("member", board.value.member);
      }
      showToast("标记已保存");
      void load();
    },
  },
);
function openMarker() {
  if (props.demo) {
    demoNotice();
    return;
  }
  markerOpen.value = true;
}
const backgroundRefresh = createBackgroundRefresh(load);
function visibleRefresh(event?: Event) {
  presentNewReminders();
  if (document.visibilityState === "visible" && !navigator.onLine) {
    if (board.value) {
      backgroundRefresh.interrupt();
      // Keep the last confirmed board while releasing a suspended read so
      // the next online event can refresh immediately. Writes are unaffected.
      if (loading.value) {
        ++requestId;
        controller?.abort();
        loading.value = false;
      }
      error.value = "当前离线，请联网后重试";
    }
    return;
  }
  if (
    document.visibilityState === "visible" &&
    navigator.onLine &&
    !loading.value &&
    !busy.value &&
    !settingsOpen.value &&
    !reminderOpen.value &&
    !markerOpen.value &&
    !toolsOpen.value &&
    !preferencesOpen.value &&
    !companionOpen.value &&
    !orderOpen.value &&
    !roundOpen.value &&
    !pushOpen.value &&
    !recoveryOpen.value &&
    !detailTask.value &&
    (!document.querySelector(".sheet-layer") || messagesOpen.value)
  )
    void backgroundRefresh.run(
      event?.type === "online" ? "online" : event ? "foreground" : "poll",
    );
}
function pushOnline() {
  if (!props.demo && !document.hidden && board.value)
    void pushSync.run(props.token, true);
}
watch(month, () => void load());
watch(
  () => props.token,
  () => void load(),
);
const removeNativeReady = onNativePushReady(() => {
  if (!props.demo && board.value) void pushSync.run(props.token, true);
});
onMounted(() => {
  void backgroundRefresh.run("foreground");
  poll = setInterval(visibleRefresh, 10000);
  document.addEventListener("visibilitychange", visibleRefresh);
  window.addEventListener("focus", visibleRefresh);
  window.addEventListener("online", visibleRefresh);
  window.addEventListener("offline", visibleRefresh);
  window.addEventListener("online", pushOnline);
  window.addEventListener("pageshow", visibleRefresh);
});
onUnmounted(() => {
  alive = false;
  backgroundRefresh.dispose();
  pushSync.dispose();
  removeNativeReady();
  resetSectionSwipe();
  ++requestId;
  controller?.abort();
  if (poll) clearInterval(poll);
  if (midnight) clearTimeout(midnight);
  document.removeEventListener("visibilitychange", visibleRefresh);
  window.removeEventListener("focus", visibleRefresh);
  window.removeEventListener("online", visibleRefresh);
  window.removeEventListener("offline", visibleRefresh);
  window.removeEventListener("online", pushOnline);
  window.removeEventListener("pageshow", visibleRefresh);
});
</script>
<template>
  <div
    ref="boardRoot"
    class="chore-board"
    @click.capture="sectionSwipeClick"
    :class="{
      'arrival-pending': companionEntering,
      'arrival-reveal': arrivalReveal,
    }"
    data-testid="chore-board"
  >
    <ReminderBanner
      :note="reminderBanner.active.value"
      @dismiss="dismissBannerMessage"
      @expire="reminderBanner.dismiss"
      @reply="replyBannerMessage"
      @open="openBannerMessages"
      @settled="reminderBanner.settled"
      @presented="messagePresented"
    />
    <LoadingSkeleton
      v-if="loading && !board"
      :variant="section === 'calendar' ? 'calendar' : 'task'"
    />
    <div
      v-if="completionSyncPending && showSyncStatus"
      class="chore-sync-status"
      role="status"
      data-testid="completion-sync-pending"
    >
      <span
        >{{ syncAction }}已记录，{{ loading ? "正在同步…" : "等待同步" }}</span
      >
      <button :disabled="loading" @click="load">
        {{ loading ? "同步中" : "重试同步" }}
      </button>
    </div>
    <div v-else-if="error && !board" class="chore-inline-error" role="alert">
      {{ error }}<button :disabled="loading" @click="load">重新加载</button>
    </div>
    <template v-if="board">
      <div class="board-identity">
        <button v-if="demo" class="demo-exit" @click="emit('exit-demo')">
          退出游客
        </button>
        <div ref="companionHome" class="companion-identity">
          <DormCompanion
            v-if="companionEnabled"
            :mood="companionMood"
            :automatic="!companionPreview"
            :track="true"
            continuous
            :size="52"
            :chat-enabled="!demo"
            :style="{ visibility: chatPresent ? 'hidden' : undefined }"
            @chat="openChat"
            intent="chat"
            :tips="true"
            :scene="section"
            :message="
              board.overdue_categories?.length
                ? `${board.overdue_categories.map((c) => c.name).join('、')}超过五天没做啦，记得安排一下。点我可以聊天。`
                : ''
            "
            :muted="
              chatPresent ||
              toolsOpen ||
              preferencesOpen ||
              companionOpen ||
              reminderOpen ||
              messagesOpen ||
              settingsOpen ||
              !!detailTask
            "
          />
          <span class="identity-name"
            ><span>{{ dormName }}</span
            ><span class="current-identity"
              >{{ demo ? "游客 · " : "" }}{{ board.member.nickname }}</span
            ></span
          >
        </div>
        <div class="identity-actions">
          <RefreshNotice :error="error" :loading="loading" @retry="load" />
          <button
            class="tools-button"
            :aria-label="
              unread.length ? `设置，${unread.length} 条未读消息` : '设置'
            "
            data-testid="open-tools"
            @click="openTools"
          >
            <van-icon name="setting-o" aria-hidden="true" />
            <span
              v-if="unread.length"
              class="tools-unread"
              aria-hidden="true"
              >{{ unread.length > 9 ? "9+" : unread.length }}</span
            >
          </button>
        </div>
      </div>
      <div
        class="board-focus"
        :class="{
          'section-swipe-dragging': sectionSwipeDragging,
          'quiet-pages': !motionAllowed(),
        }"
        :style="{
          '--section-swipe-opacity': String(
            1 - Math.min(0.42, Math.abs(sectionSwipeOffset) / 210),
          ),
        }"
      >
        <Transition
          name="focus-fade"
          mode="out-in"
          appear
          @before-leave="hideLeaving"
          @before-enter="showEntered"
          @enter="enterPage"
          @after-leave="cancelPageReveal"
        >
          <div
            :key="section"
            class="focus-pane"
            :class="{ 'calendar-page': section === 'calendar' }"
          >
            <section
              v-if="section === 'calendar'"
              class="calendar-pane"
              data-testid="pane-calendar"
            >
              <ChoreCalendar
                :memory="calendarMemory"
                :month="month"
                :invite="invite"
                :token="demo ? '' : token"
                :version="board.version"
                :rounds="board.rounds"
                :categories="board.categories"
                @settings="
                  settingsCategory = $event;
                  settingsOpen = true;
                "
                :creator="board.is_creator"
                :undo-ids="board.undo_tasks.map((task) => task.id)"
                @refresh="load"
                :today="board.today"
                :records="board.calendar"
                :neighbors="board.calendar_neighbors"
                :members="board.members"
                :member-id="memberId"
                :busy="!!busy || completionSyncPending"
                :undo-error="actionError"
                @undo="undo"
                :loading="loading"
                @change="month = $event"
                @closed="presentNewReminders"
              />
            </section>
            <section
              v-if="section === 'duty'"
              class="chore-personal"
              :class="{
                'completion-linked': activeDutyTask?.status === 'completed',
              }"
              aria-labelledby="personal-title"
              data-testid="pane-duty"
            >
              <h1
                id="personal-title"
                class="hero-caption"
                data-section-swipe-handle
                data-testid="page-swipe-title"
              >
                {{ dutyCaption }}
              </h1>
              <div
                v-if="personalTasks.length > 1"
                class="task-selector"
                aria-label="选择值日任务"
              >
                <button
                  v-for="task in personalTasks"
                  :key="task.id"
                  :aria-pressed="activeDutyTask?.id === task.id"
                  @click="chooseDutyTask(task.id, $event)"
                >
                  <span class="task-option-name">{{ task.name }}</span>
                  <van-icon
                    name="success"
                    class="task-option-state"
                    :class="{ 'is-complete': task.status === 'completed' }"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <article
                v-if="activeDutyTask"
                class="chore-task focus-hero"
                :class="{
                  'task-is-completed': activeDutyTask.status === 'completed',
                }"
                :data-testid="`chore-task-${activeDutyTask.key}-${activeDutyTask.id}`"
              >
                <div
                  class="task-title-stage"
                  data-testid="task-title-swipe"
                  aria-live="polite"
                  aria-atomic="true"
                  :class="{ 'title-dragging': titleDragging }"
                  :style="{ transform: `translate3d(${titleOffset}px,0,0)` }"
                  @pointerdown="taskSwipe.down"
                  @pointermove="taskSwipe.move"
                  @pointerup="taskSwipe.up"
                  @pointercancel="taskSwipe.cancel"
                  @lostpointercapture="taskSwipe.cancel"
                  @keydown.esc="taskSwipe.cancel"
                >
                  <TaskTitle
                    :value="`${activeDutyTask.key}:${activeDutyTask.name}`"
                    :animated="titleAnimation"
                    :direction="titleDirection"
                  >
                    <button
                      class="task-title-button"
                      :aria-label="`查看${activeDutyTask.name}详情`"
                      @click="openTask(activeDutyTask, $event)"
                    >
                      {{ activeDutyTask.name }}
                    </button>
                  </TaskTitle>
                </div>
                <p v-if="!hasToday && !activeRound" class="hero-date">
                  {{ dateText(activeDutyTask.duty_date) }}
                </p>
                <CompletionAction
                  v-if="
                    activeDutyTask.status === 'completed' ||
                    activeDutyTask.can_complete ||
                    demo
                  "
                  :key="activeDutyTask.id"
                  :task="activeDutyTask"
                  :busy="!!busy"
                  :syncing="completionSyncPending"
                  :disabled="
                    completionSyncPending ||
                    (!demo && activeDutyTask.duty_date > board.today)
                  "
                  :demo="demo"
                  :receipt="completionReceipt"
                  @settled="settleCompletion"
                  @complete="complete"
                  @undo="undo($event.id)"
                />
                <CompletionAction
                  v-if="
                    recentUndo &&
                    recentUndo.id !== activeDutyTask.id &&
                    recentUndo.id !== completionMorphId
                  "
                  :task="recentUndo"
                  :busy="!!busy"
                  :syncing="completionSyncPending"
                  :disabled="completionSyncPending"
                  :demo="demo"
                  @undo="undo($event.id)"
                />
                <button
                  v-if="activeRound"
                  class="round-progress"
                  data-testid="round-progress"
                  @click="roundOpen = true"
                >
                  <RoundProgress
                    v-if="displayRound"
                    :round="displayRound"
                    :active="section === 'duty'"
                    :celebrate="completionEpoch"
                    compact
                  />
                  <span v-if="displayRound" class="round-progress-label"
                    >{{ displayRound.completed }}/{{ displayRound.total }} · 第
                    {{ displayRound.sequence }} 轮</span
                  >
                  <van-icon name="arrow" aria-hidden="true" />
                </button>
              </article>
              <div v-else class="focus-hero"><h2>休息</h2></div>
            </section>
            <section
              v-if="section === 'water'"
              class="water-pane"
              data-testid="pane-water"
            >
              <template v-if="water">
                <h1
                  class="hero-caption"
                  data-section-swipe-handle
                  data-testid="page-swipe-title"
                >
                  {{
                    water.assignee_id === memberId
                      ? "没水时轮到你："
                      : "抬水轮到："
                  }}
                </h1>
                <section
                  class="chore-water focus-hero"
                  aria-labelledby="water-title"
                  data-testid="water-task"
                >
                  <div class="water-title-stage">
                    <TaskTitle
                      value="water"
                      :animated="false"
                      id="water-title"
                      :style="
                        water.assignee_id !== memberId &&
                        water.assignee_name.length > 8
                          ? { fontSize: 'clamp(30px, 9vw, 40px)' }
                          : undefined
                      "
                    >
                      <WaterHandoffName
                        :scope="`${invite}:${memberId}`"
                        :event="board.water_handoff"
                        :members="board.members"
                        :target-id="water.assignee_id"
                        :target-name="water.assignee_name"
                        :active="
                          !messagesOpen &&
                          !orderOpen &&
                          !toolsOpen &&
                          !preferencesOpen &&
                          !companionOpen &&
                          !pushOpen &&
                          !settingsOpen &&
                          !recoveryOpen &&
                          !reminderOpen &&
                          !markerOpen &&
                          !detailTask &&
                          !roundOpen &&
                          !waterExceptionOpen
                        "
                      >
                        <WaterNudge
                          v-if="water.assignee_id !== memberId"
                          :key="water.id"
                          :name="water.assignee_name"
                          @tap="nudgeWater"
                        />
                        <button
                          v-else
                          class="task-title-button"
                          :aria-label="`查看${water.name}详情`"
                          @click="openTask(water, $event)"
                        >
                          {{ water.name }}
                        </button>
                      </WaterHandoffName>
                    </TaskTitle>
                  </div>
                  <CompletionAction
                    v-if="waterActionTask"
                    :task="waterActionTask"
                    :receipt="completionReceipt"
                    @settled="settleCompletion"
                    :busy="!!busy"
                    :syncing="completionSyncPending"
                    :disabled="completionSyncPending"
                    :demo="demo"
                    @complete="complete"
                    @undo="undo($event.id)"
                  />
                  <div class="water-nudge-actions">
                    <p
                      v-if="water.assignee_id !== memberId"
                      class="hero-date"
                      role="status"
                    >
                      {{ nudgeCaption }}
                    </p>
                    <div class="water-task-links">
                      <button
                        class="water-remind"
                        @click="openTask(water, $event)"
                      >
                        查看任务
                      </button>
                      <button
                        class="water-exception-trigger"
                        aria-label="抬水临时安排"
                        @click="waterExceptionOpen = true"
                      >
                        ?
                      </button>
                    </div>
                  </div>
                  <p
                    v-if="water.assignee_id === memberId && !waterActionTask"
                    class="hero-date"
                  >
                    {{ dateText(water.duty_date) }} 开始
                  </p>
                  <CompletionAction
                    v-if="recentUndo && recentUndo.id !== waterActionTask?.id"
                    :task="recentUndo"
                    :busy="!!busy"
                    :syncing="completionSyncPending"
                    :disabled="completionSyncPending"
                    :demo="demo"
                    @undo="undo($event.id)"
                  />
                </section>
              </template>
              <div v-else class="water-empty" data-testid="water-empty">
                <h1
                  class="hero-caption"
                  data-section-swipe-handle
                  data-testid="page-swipe-title"
                >
                  抬水已暂停
                </h1>
                <h2>休息</h2>
              </div>
            </section>
          </div>
        </Transition>
      </div>
      <Teleport to="body">
        <Transition name="quiet-toast">
          <p
            v-if="praiseTask"
            :key="praiseTask.id"
            ref="praiseElement"
            class="completion-praise"
            :style="
              praiseTop === null
                ? undefined
                : { top: `${praiseTop}px`, bottom: 'auto' }
            "
            role="status"
            data-testid="completion-toast"
          >
            <span class="completion-praise-bubble">你真棒👍！</span>
          </p>
        </Transition>
      </Teleport>
      <p
        v-if="actionError && !markerOpen"
        class="chore-inline-error"
        role="alert"
      >
        {{ actionError }}
      </p>
      <CompanionChat
        v-model="chatOpen"
        :origin="chatOrigin"
        :return-rect="companionReturnRect"
        :members="board.members"
        :note-request="chatNoteRequest"
        @note-sent="load"
        :invite="invite"
        :member-id="memberId"
        :token="token"
        @present="chatPresent = $event"
      />
      <ChoreMenu
        v-model:tools="toolsOpen"
        v-model:preferences="preferencesOpen"
        :dorm-name="dormName"
        :member="board.member"
        :creator="board.is_creator"
        :demo="demo"
        :unread-count="unread.length"
        :disabled="loading || !!busy"
        @action="menuAction"
        @closed="runQueuedTool"
      />
      <WaterOrderSheet
        v-if="board.categories.find((c) => c.key === 'water')"
        v-model="orderOpen"
        :members="board.members"
        :category="board.categories.find((c) => c.key === 'water')!"
        :initial-key="section === 'duty' ? activeDutyTask?.key : 'water'"
        :current-id="water?.assignee_id"
        :last-water-id="board.water_handoff?.from_member_id"
        :editable="!demo"
        :categories="board.categories"
        :version="board.version"
        :token="token"
        @saved="load"
        @closed="
          runQueuedTool();
          presentNewReminders();
        "
      />
      <ElasticSheet
        v-model="detailOpen"
        :title="detailTask?.name || '任务详情'"
        :origin="detailOrigin"
        :motion="detailMotion"
        :modal="detailMotion !== 'bottom'"
        @closed="
          detailTask = null;
          runQueuedTool();
        "
      >
        <div
          v-if="detailTask"
          class="task-detail-card"
          data-testid="task-detail"
        >
          <p class="task-full-content">{{ detailTask.content }}</p>
          <div class="task-detail-person">
            <MemberMark
              :id="currentMember(detailTask.assignee_id)?.marker_id"
              :size="30"
            />
            <strong class="task-detail-assignee">{{
              detailTask.assignee_name
            }}</strong>
            <span class="task-detail-status">{{ statusText(detailTask) }}</span>
          </div>
          <p v-if="detailTask.mode === 'scheduled'" class="task-detail-timing">
            {{ dateText(detailTask.duty_date) }} ·
            {{ clock(detailTask.deadline_at) }} 前
          </p>
          <p v-if="detailTask.completed_at" class="task-detail-timing">
            {{ clock(detailTask.completed_at) }} 已完成
          </p>
        </div>
      </ElasticSheet>
      <WaterExceptionSheet
        v-if="water"
        :open="waterExceptionOpen"
        @update:open="waterExceptionOpen = $event"
        :task="water"
        :member-id="memberId"
        :member-name="board.member.nickname"
        :token="token"
        :version="board.version"
        :demo="demo"
        :advance-task-id="board.water_advance_task_id"
        @saved="load"
        @completed="
          acceptCompletion($event);
          load();
        "
      />
      <ElasticSheet
        v-model="roundOpen"
        expandable
        expand-from-scroll
        :content-height="`min(75dvh, 820px, calc(min(224px, 27dvh) + 224px + ${roundVisibleCount * 66}px + env(safe-area-inset-bottom, 0px)))`"
        contained
        fixed-content
        motion="bottom"
        :title="`${activeDutyTask?.name || '值日'} · 第 ${displayRound?.sequence || 1} 轮`"
        @closed="presentNewReminders"
      >
        <div
          v-if="displayRound"
          class="round-members"
          data-testid="round-members"
        >
          <RoundProgress
            :round="displayRound"
            :active="roundOpen"
            :celebrate="completionEpoch"
          />
        </div>
      </ElasticSheet>
      <ElasticSheet
        v-model="companionOpen"
        title="球球设置"
        motion="bottom"
        @closed="presentNewReminders"
      >
        <CompanionSettings :active="companionOpen" />
      </ElasticSheet>
      <ChoreMessages
        v-model="messagesOpen"
        :reminders="board.reminders"
        :unread-count="unread.length"
        :busy="!!busy"
        :format-time="clock"
        :error="messageError"
        :pending-id="
          busy.startsWith('read-') ? Number(busy.slice(5)) : undefined
        "
        @read="markRead"
        @closed="presentNewReminders"
      />
      <ChorePushSettings
        v-model="pushOpen"
        :token="token"
        :nickname="board.member.nickname"
        @closed="presentNewReminders"
      />
      <CreatorRecovery
        v-model="recoveryOpen"
        mode="manage"
        :token="token"
        @closed="presentNewReminders"
      />
      <ChoreSettings
        v-model="settingsOpen"
        :categories="board.categories"
        :members="board.members"
        :version="board.version"
        :token="token"
        :initial-category="
          settingsCategory ||
          (section === 'water' ? 'water' : activeDutyTask?.key || 'floor')
        "
        @saved="load"
        @closed="presentNewReminders"
      />
      <ChoreReminderSheet
        v-model="reminderOpen"
        :invite="invite"
        :token="token"
        :member-id="memberId"
        :members="board.members"
        :context="reminderContext"
        :month="month"
        :busy="!!busy"
        :date-text="dateText"
        @sent="load"
      />
      <ElasticSheet v-model="markerOpen" title="你的日历标记"
        ><MarkerPicker
          v-model="markerDraft"
          :occupied="occupied"
          :disabled="!!busy"
        />
        <p v-if="markerError" class="chore-inline-error" role="alert">
          {{ markerError }}
        </p>
        <button
          class="guest-primary"
          :disabled="!!busy || !markerDraft"
          data-testid="marker-save"
          @click="saveMarker"
        >
          {{ busy === "marker" ? "正在保存…" : "保存标记" }}
        </button></ElasticSheet
      >
    </template>
  </div>
</template>
<style scoped>
.current-identity {
  display: block;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--app-tone-h666, #666);
}
.demo-exit {
  background: transparent;
  border: 0;
  font-size: 13px;
  order: 3;
  white-space: nowrap;
}
.task-detail-card {
  position: relative;
  isolation: isolate;
  padding: 20px;
  margin: 2px 0;
  border: 1px solid var(--app-tone-he8e8e8, #e8e8e8);
  border-radius: 22px;
  background: var(--app-tone-hf8f8f8, #f8f8f8);
  transform: perspective(900px) rotateX(var(--tilt-x, 0deg))
    rotateY(var(--tilt-y, 0deg));
}
.task-detail-card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: var(--shine-opacity, 0);
  background: radial-gradient(
    circle at var(--shine-x, 50%) var(--shine-y, 50%),
    var(--app-tone-hfff, #fff) 0,
    transparent 65%
  );
  z-index: -1;
}
@media (prefers-reduced-motion: reduce) {
  .task-detail-card {
    transform: none;
  }
  .task-detail-card::after {
    display: none;
  }
}
.identity-actions {
  position: relative;
  display: flex;
  gap: 4px;
  align-items: center;
}
.order-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  border: 0;
  border-radius: 16px;
  padding: 8px 11px;
  background: var(--app-tone-hf5f5f5, #f5f5f5);
  color: var(--app-tone-h222, #222);
  font-size: 14px;
  cursor: pointer;
}
.order-trigger svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
}
.order-trigger:active {
  transform: scale(0.96);
}
.water-title-stage {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 84px;
}
.water-title-stage h2 {
  grid-area: 1 / 1;
}

.round-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: none;
  color: var(--app-tone-h555, #555);
  padding: 10px 4px;
  min-height: 44px;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}
/* One shared left edge and type scale across the three mobile pages. */
.chore-board {
  min-width: 0;
  color: var(--app-tone-h111, #111);
}
.chore-sync-status {
  position: fixed;
  z-index: 105;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(82px + env(safe-area-inset-bottom));
  width: min(calc(100% - 40px), 480px);
  border: 1px solid var(--app-tone-heee, #eee);
  border-radius: 16px;
  background: var(--app-tone-hfff, #fff);
  box-shadow: 0 4px 18px #0000000a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  color: var(--app-tone-h555, #555);
  font-size: 14px;
}
.chore-sync-status button {
  flex-shrink: 0;
  padding: 8px 0 8px 12px;
  min-height: 44px;
  border: 0;
  background: none;
  color: var(--app-tone-h111, #111);
  font: inherit;
}
.companion-identity {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.identity-actions {
  flex-shrink: 0;
}
.board-identity {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  margin-bottom: 8px;
}
.identity-name {
  font-size: 22px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tools-button {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  background: none;
  border: 0;
  font-size: 24px;
  color: var(--app-tone-h111, #111);
}
.tools-unread {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--app-tone-h111, #111);
  color: var(--app-tone-hfff, #fff);
  font-size: 11px;
  line-height: 18px;
  font-weight: 600;
}
.board-focus {
  position: relative;
}
.board-focus {
  touch-action: pan-y;
}
.board-focus :deep(button),
.board-focus :deep(a) {
  touch-action: pan-y;
}
.companion-identity {
  user-select: none;
  -webkit-user-select: none;
}
.board-focus :deep([data-section-swipe-handle]) {
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}
.board-focus > .focus-pane:not([inert]) {
  transition:
    opacity var(--ui-page-time) var(--ui-ease-out),
    transform var(--ui-page-time) var(--ui-ease-out);
}
.board-focus.section-swipe-dragging > .focus-pane:not([inert]) {
  opacity: var(--section-swipe-opacity);
  transition: none;
}
.focus-pane {
  width: 100%;
  min-width: 0;
}
.chore-personal,
.water-pane {
  min-height: calc(100dvh - 220px - env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  padding: 16px 0 36px;
}
.chore-personal h1.hero-caption,
.water-pane h1.hero-caption {
  font-size: clamp(19px, 5.8vw, 24px);
  line-height: 1.4;
  font-weight: 450;
  letter-spacing: 0;
  margin: 0;
  text-align: center;
}
.focus-hero {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30px;
}
.focus-hero h2,
.water-empty h2 {
  margin: 0;
  font-size: clamp(48px, 17vw, 72px);
  font-weight: 650;
  letter-spacing: -2px;
  line-height: 1.15;
  overflow-wrap: anywhere;
  text-align: center;
  max-width: 100%;
}
.task-title-stage {
  display: grid;
  place-items: center;
  width: 100%;
  height: clamp(55.2px, 19.55vw, 82.8px);
  touch-action: pan-y;
}
.task-title-stage h2 {
  grid-area: 1 / 1;
}
@media (prefers-reduced-motion: no-preference) {
  .task-title-stage {
    transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .task-title-stage.title-dragging {
    transition: none;
  }
}
.chore-water h2 {
  width: 100%;
}
.water-nudge-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: min(100%, 300px);
}
.water-nudge-actions .water-remind {
  background: transparent;
  color: var(--app-tone-h555, #555);
  border: 0;
  min-height: 44px;
  width: auto;
  font-size: 15px;
  padding: 6px 20px;
}
.task-title-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--app-tone-h111, #111);
  font: inherit;
  letter-spacing: inherit;
  text-align: center;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.chore-complete-button,
.water-remind {
  display: block;
  width: min(100%, 300px);
  min-height: 54px;
  background: var(--app-tone-h111, #111);
  color: var(--app-tone-hfff, #fff);
  border: 1px solid var(--app-tone-h111, #111);
  border-radius: 16px;
  font-size: 18px;
  font-weight: 550;
  padding: 12px 18px;
}
.chore-complete-button:disabled {
  opacity: 0.4;
}
.chore-completed {
  display: flex;
  gap: 10px;
  align-items: center;
  color: var(--app-tone-h111, #111);
  font-size: 20px;
  line-height: 1.5;
  margin: 0;
}
.chore-completed .van-icon {
  font-size: 24px;
}
.hero-date {
  font-size: 17px;
  color: var(--app-tone-h555, #555);
  margin: 0;
  text-align: center;
}
.task-selector {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.task-selector button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 10px;
  min-height: 44px;
  padding: 8px 18px;
  font-size: 16px;
  color: var(--app-tone-h666, #666);
  background: var(--app-tone-hfff, #fff);
  transition:
    background-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}
.task-selector button[aria-pressed="true"] {
  color: var(--app-tone-h111, #111);
  background: var(--app-tone-hf0f0f0, #f0f0f0);
}
.water-empty {
  text-align: center;
}
.water-empty h2 {
  margin-top: 28px;
}
.water-order {
  border-top: 1px solid var(--app-tone-he5e5e5, #e5e5e5);
  margin-top: 20px;
}
.water-order summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  font-size: 16px;
  cursor: pointer;
  list-style: none;
}
.water-order summary::-webkit-details-marker {
  display: none;
}
.water-order summary strong {
  margin-left: auto;
  font-size: 15px;
  font-weight: 500;
  text-align: right;
  overflow-wrap: anywhere;
  min-width: 0;
}
.water-order summary > span {
  flex-shrink: 0;
}
.water-order summary .van-icon {
  flex-shrink: 0;
  transition: transform 200ms ease;
}
.water-order[open] summary .van-icon {
  transform: rotate(180deg);
}
.water-order > div {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 10px;
  padding: 8px 0 16px;
}
.water-order > div > span {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--app-tone-h666, #666);
  font-size: 15px;
  min-width: 0;
}
.water-order > div > span.current {
  color: var(--app-tone-h111, #111);
  font-weight: 600;
}
.board-tools {
  display: grid;
}
.board-tools button {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 10px 0;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--app-tone-heee, #eee);
  color: var(--app-tone-h111, #111);
  font-size: 18px;
  text-align: left;
}
.message-count {
  display: grid;
  place-items: center;
  background: var(--app-tone-h111, #111);
  color: var(--app-tone-hfff, #fff);
  min-width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 13px;
}
.chore-inline-error {
  border-left: 2px solid var(--app-tone-h111, #111);
  padding: 10px 12px;
  color: var(--app-tone-h555, #555);
  font-size: 15px;
  line-height: 1.6;
  margin-bottom: 12px;
}
.chore-inline-error button {
  display: block;
  min-height: 44px;
  border: 0;
  background: none;
  color: var(--app-tone-h111, #111);
  font-size: 15px;
  padding: 8px 0;
}
.task-full-content {
  margin: 0;
  font-size: 18px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.task-detail-person {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--ui-card-radius);
  background: var(--ui-surface-muted);
}
.task-detail-assignee {
  min-width: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.task-detail-status {
  font-size: 14px;
  line-height: 1.5;
  color: var(--ui-text-muted);
  text-align: right;
}
.task-detail-timing {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}
.board-loading {
  padding-top: 16px;
}
.board-loading span:not(.galaxy-spinner) {
  display: block;
  border-radius: 8px;
  background: var(--app-tone-hf0f0f0, #f0f0f0);
  height: 92px;
  margin: 18px 0;
}
.board-loading span:first-child:not(.galaxy-spinner) {
  height: 28px;
  width: 55%;
}
@media (max-height: 650px) {
  .chore-personal,
  .water-pane {
    gap: 22px;
    padding-bottom: 24px;
    min-height: calc(100dvh - 220px - env(safe-area-inset-bottom));
  }
  .focus-hero {
    gap: 24px;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .focus-fade-enter-active {
    transition:
      opacity var(--ui-page-time) var(--ui-ease-out),
      transform var(--ui-page-time) var(--ui-ease-out);
  }
  .focus-fade-leave-active {
    position: absolute;
    top: 0;
    pointer-events: none;
    transition:
      opacity var(--ui-page-time) var(--ui-ease-out),
      transform var(--ui-page-time) var(--ui-ease-out);
  }
  .focus-fade-enter-from,
  .focus-fade-leave-to {
    opacity: 0;
  }
  .chore-complete-button,
  .water-remind {
    transition:
      transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 160ms ease;
  }
  .chore-complete-button:active:not(:disabled),
  .water-remind:active:not(:disabled) {
    transform: scale(0.96);
    box-shadow: inset 0 3px 9px #0006;
    transition-duration: 80ms;
  }
  .chore-completed {
    animation: task-arrive 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .board-loading {
    animation: skeleton-pulse 1.2s ease-in-out infinite alternate;
  }
  .refresh-spinning {
    animation: refresh-spin 0.7s linear infinite;
  }
  @keyframes task-arrive {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes skeleton-pulse {
    from {
      opacity: 0.45;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes refresh-spin {
    to {
      transform: rotate(360deg);
    }
  }
}
@media (prefers-reduced-motion: no-preference) {
  .chore-complete-button {
    transition:
      transform 150ms ease,
      box-shadow 150ms ease;
  }
  .chore-complete-button:active:not(:disabled) {
    transform: scale(0.97);
    box-shadow: inset 0 2px 5px #0005;
  }
}
</style>

<style scoped>
.water-title-stage {
  width: min(100%, 300px);
  min-height: clamp(55.2px, 19.55vw, 82.8px);
  display: grid;
  place-items: center;
}
.water-title-stage h2 {
  width: 100%;
}
.water-nudge-actions {
  gap: 8px;
}
.water-nudge-actions .hero-date {
  min-height: 24px;
  font-size: 16px;
  color: var(--app-tone-h777, #777);
}

.water-remind:active,
.round-progress:active {
  transform: scaleX(1.02) scaleY(0.94);
}
@media (prefers-reduced-motion: no-preference) {
  .water-remind,
  .round-progress {
    transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
}
@media (max-height: 730px) {
  .water-pane {
    gap: 18px;
    padding: 8px 0 24px;
  }
  .water-pane .focus-hero {
    gap: 18px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .water-remind:active,
  .round-progress:active {
    transform: none;
  }
}
</style>

<style scoped>
/* Keep the caption and name anchored when completing water reveals the next
   roommate and the previous turn's completed button. Only the action area grows. */
.water-pane {
  justify-content: flex-start;
  padding-top: clamp(72px, 15dvh, 130px);
}
@media (max-height: 730px) {
  .water-pane {
    padding-top: 48px;
  }
}
</style>

<style>
.chore-notice.van-toast {
  top: calc(env(safe-area-inset-top) + 78px);
  width: max-content;
  max-width: calc(100vw - 40px);
  min-height: 44px;
  padding: 12px 18px;
  border: 1px solid var(--app-tone-he8e8e8, #e8e8e8);
  border-radius: 18px;
  color: var(--app-tone-h222, #222);
  background: var(--app-tone-hfff, #fff);
  box-shadow: 0 8px 28px #0000000c;
  font-size: 14px;
  line-height: 1.5;
}
</style>
<style scoped>
.round-save {
  margin-top: 18px;
}
.round-save:active,
.task-selector button:active {
  transform: scaleX(1.02) scaleY(0.94);
}
@media (prefers-reduced-motion: no-preference) {
  .round-save {
    transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .round-save:active,
  .task-selector button:active {
    transform: none;
  }
}
</style>

<style scoped>
.round-members :deep(.sort-hint) {
  display: none;
}
</style>

<style scoped>
.round-summary-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 18px;
}
.round-summary-line .round-summary {
  margin: 0;
}
</style>

<style scoped>
.board-loading {
  min-height: 160px;
  display: grid;
  place-items: center;
}
.board-loading :deep(.board-spinner) {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border-width: 2px;
}
</style>
<style scoped>
.round-edit-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  border: 0;
  border-radius: 18px;
  background: var(--app-tone-hf6f6f6, #f6f6f6);
  font: inherit;
  font-size: 16px;
  margin-top: 18px;
  padding: 12px 16px;
  cursor: pointer;
  transition: transform 160ms ease;
}
.round-edit-entry .van-icon:last-child {
  margin-left: auto;
  color: var(--app-tone-h999, #999);
}
.round-edit-entry:active {
  transform: scale(0.98);
}
</style>
<style scoped>
.chore-personal {
  border-radius: 30px;
  transition: background-color 280ms ease;
}
.chore-personal.completion-linked {
  background-color: var(--app-tone-hf6f6f5, #f6f6f5);
}
@media (prefers-reduced-motion: reduce) {
  .chore-personal {
    transition: none;
  }
}
</style>

<style scoped>
.quiet-pages > .focus-pane {
  transition: none !important;
  opacity: 1 !important;
}
</style>

<style scoped>
.p0-task-page {
  display: grid;
  align-content: center;
  gap: var(--ui-space-md);
  min-height: min(54svh, 420px);
  padding: var(--ui-space-lg) 0;
}
.p0-page-title {
  margin: 0;
  font-size: var(--ui-title-size);
  line-height: var(--ui-title-leading);
  font-weight: 700;
  letter-spacing: -0.8px;
  text-align: left;
}
.p0-task-focus {
  display: grid;
  gap: var(--ui-space-sm);
  min-width: 0;
}
.p0-text-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-card-gap);
  min-height: 44px;
  padding: 0 var(--ui-space-sm);
  border: 0;
  background: transparent;
  font: inherit;
  font-size: var(--ui-small-size);
  color: var(--ui-text-muted);
  cursor: pointer;
}
.p0-primary {
  width: 100%;
  min-height: var(--ui-action-height);
  border: 0;
  border-radius: var(--ui-control-radius);
  background: var(--ui-ink);
  color: var(--ui-surface);
  font: inherit;
  font-size: var(--ui-body-size);
  font-weight: 600;
  cursor: pointer;
}
.p0-primary,
.p0-text-button {
  transition: transform var(--ui-release-time) var(--ui-ease-out);
}
.p0-primary:active,
.p0-text-button:active {
  transform: var(--ui-press-small);
}
.p0-status {
  font-size: var(--ui-small-size);
  color: var(--ui-text-muted);
  text-align: center;
  margin: 0;
}
.p0-empty {
  padding: var(--ui-space-lg) 0;
  display: grid;
  gap: var(--ui-space-sm);
}
.p0-empty h2 {
  font-size: var(--ui-card-title-size);
  line-height: var(--ui-title-leading);
  margin: 0;
}
.p0-completed {
  border-top: var(--ui-card-border);
  margin-top: var(--ui-space-sm);
  padding: var(--ui-space-sm) 0;
}
.p0-completed summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  list-style: none;
  font-size: var(--ui-body-size);
  cursor: pointer;
}
.p0-completed summary::-webkit-details-marker {
  display: none;
}
.p0-completed summary span {
  display: flex;
  align-items: center;
  gap: var(--ui-card-gap);
  color: var(--ui-text-muted);
}
.p0-completed-list {
  display: grid;
  gap: var(--ui-card-gap);
  padding-top: var(--ui-space-sm);
}
.p0-completed-list article {
  display: grid;
  justify-items: end;
}
.p0-task-page .task-selector {
  justify-content: flex-start;
  gap: var(--ui-card-gap);
  margin: 0;
}
.quiet-task-enter-active,
.quiet-task-leave-active {
  transition: opacity 200ms ease;
}
.quiet-task-enter-from,
.quiet-task-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .quiet-task-enter-active,
  .quiet-task-leave-active,
  .p0-primary,
  .p0-text-button {
    transition: none;
  }
  .p0-primary:active,
  .p0-text-button:active {
    transform: none;
  }
}
</style>
<style>
.completion-praise {
  position: fixed;
  z-index: 110;
  bottom: calc(120px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  color: var(--app-tone-h777, #777);
  font-size: 16px;
  line-height: 24px;
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
}
.completion-praise-bubble {
  display: block;
  padding: 10px 18px;
  border: 1px solid var(--app-tone-hededed, #ededed);
  border-radius: 999px;
  background: var(--app-tone-hfafafa, #fafafa);
  transform-origin: center bottom;
}
.quiet-toast-enter-active,
.quiet-toast-enter-active .completion-praise-bubble {
  transition:
    opacity 240ms var(--ui-ease-out),
    transform 320ms var(--ui-ease-overshoot);
}
.quiet-toast-leave-active,
.quiet-toast-leave-active .completion-praise-bubble {
  transition:
    opacity 180ms var(--ui-ease-out),
    transform 180ms var(--ui-ease-out);
}
.quiet-toast-enter-from .completion-praise-bubble {
  transform: translateY(8px) scale(0.9);
}
.quiet-toast-leave-to .completion-praise-bubble {
  transform: translateY(5px) scale(0.97);
}
.quiet-toast-enter-from,
.quiet-toast-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .quiet-toast-enter-active,
  .quiet-toast-leave-active {
    transition: none;
  }
}
</style>

<style scoped>
.focus-fade-enter-active,
.focus-fade-leave-active {
  transition:
    opacity var(--ui-page-time) var(--ui-ease-out),
    transform var(--ui-page-time) var(--ui-ease-out);
  animation: none !important;
}
.focus-fade-enter-from {
  opacity: 0;
  transform: translateX(8px);
  clip-path: none !important;
}
.focus-fade-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}
</style>

<style scoped>
.p0-task-swap {
  display: grid;
  min-width: 0;
}
.p0-task-swap > .p0-task-focus,
.p0-task-swap > .p0-empty {
  grid-area: 1/1;
}
</style>

<style scoped>
.task-detail-card {
  display: grid;
  gap: 20px;
  padding: 0;
  margin: 0;
  border: 0;
  background: transparent;
  transform: none;
}
.task-detail-card::after {
  display: none;
}
</style>

<style scoped>
.chore-personal,
.water-pane {
  min-height: calc(100svh - 170px - env(safe-area-inset-bottom));
  gap: var(--ui-space-md);
  padding: var(--ui-space-md) 0 var(--ui-space-lg);
  background: var(--ui-surface) !important;
  transition: none !important;
}
.chore-personal.completion-linked {
  background: var(--ui-surface) !important;
}
.focus-hero {
  gap: var(--ui-space-md);
}
.focus-hero > .completion-surface {
  width: min(100%, 300px);
  height: 56px;
}
.round-progress {
  min-height: 44px;
  gap: var(--ui-card-gap);
  margin: 0;
}
.calendar-pane {
  padding: var(--ui-card-gap) 0 0;
}
@media (max-height: 650px) {
  .chore-personal,
  .water-pane {
    min-height: calc(100svh - 155px);
    gap: 16px;
    padding: 12px 0 20px;
  }
  .focus-hero {
    gap: 16px;
  }
  .focus-hero h2 {
    font-size: clamp(44px, 14vw, 64px);
  }
}
</style>
<style scoped>
.hero-caption {
  width: 100%;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
</style>
<style scoped>
.water-pane {
  justify-content: center;
  padding-top: 0;
  padding-bottom: 24px;
}
.water-title-stage :deep(h2) {
  font-size: clamp(60px, 18vw, 84px);
  line-height: 1.15;
}
.water-title-stage {
  min-height: 96px;
}
</style>
<style>
/* Informational notices never block a page swipe or task control underneath. */
.chore-notice.van-toast {
  pointer-events: none;
}
</style>
<style scoped>
/* Anchor the name independently of receipt/reminder rows, so completion never
   recenters the whole stack when its action changes. */
.water-pane {
  position: relative;
}
.water-pane > .hero-caption {
  position: absolute;
  top: calc(50% - 136px);
  left: 0;
  margin: 0;
}
.water-pane > .chore-water {
  position: absolute;
  top: calc(50% - 90px);
  left: 0;
  width: 100%;
}
.water-title-stage {
  height: 104px;
  min-height: 104px;
  display: grid;
  align-items: center;
}
</style>

<style scoped>
/* Reserve each success icon before the first check-in. No task row rewrap. */
.task-selector {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: min(100%, 350px);
}
.task-selector button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16px;
  min-width: 0;
  gap: 4px;
  padding: 8px 7px;
}
.task-option-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-option-state {
  width: 16px;
  opacity: 0;
  transform: scale(0.7);
  transition:
    opacity 180ms var(--ui-ease-out),
    transform 220ms var(--ui-ease-overshoot);
}
.task-option-state.is-complete {
  opacity: 1;
  transform: scale(1);
}
</style>

<style scoped>
/* Status rows and a second eligible receipt must never recenter the title. */
.chore-personal {
  position: relative;
}
.chore-personal > .hero-caption {
  position: absolute;
  top: calc(50% - 178px);
  left: 0;
  margin: 0;
}
.chore-personal > .task-selector {
  position: absolute;
  top: calc(50% - 123px);
  left: 50%;
  transform: translateX(-50%);
}
.chore-personal > .chore-task {
  position: absolute;
  top: calc(50% - 39px);
  left: 0;
}
@media (max-height: 650px) {
  .chore-personal > .hero-caption {
    top: calc(50% - 150px);
  }
  .chore-personal > .task-selector {
    top: calc(50% - 102px);
  }
}
</style>

<style scoped>
.arrival-pending .identity-name,
.arrival-pending .identity-actions,
.arrival-pending .board-focus {
  opacity: 0;
  pointer-events: none;
}
.arrival-reveal:not(.arrival-pending) .identity-name {
  animation: companion-arrival-rise 440ms both;
}
.arrival-reveal:not(.arrival-pending) .identity-actions {
  animation: companion-arrival-rise 440ms 70ms both;
}
.arrival-reveal:not(.arrival-pending) .board-focus {
  animation: companion-arrival-rise 540ms 160ms both;
}
@keyframes companion-arrival-rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .arrival-reveal:not(.arrival-pending) .identity-name,
  .arrival-reveal:not(.arrival-pending) .identity-actions,
  .arrival-reveal:not(.arrival-pending) .board-focus {
    animation: none;
  }
}
</style>

<style scoped>
.focus-fade-enter-active {
  transition: none !important;
}
.focus-fade-enter-active.calendar-page {
  transition: none !important;
}
.focus-fade-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease !important;
}
.focus-fade-enter-from,
.focus-fade-enter-to {
  opacity: 1;
  transform: none;
}
.focus-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
@media (prefers-reduced-motion: reduce) {
  .focus-fade-enter-active,
  .focus-fade-leave-active {
    transition: none !important;
  }
  .focus-fade-leave-to {
    transform: none;
  }
}
</style>

<style scoped>
@media (max-width: 360px) {
  .identity-actions .order-trigger span {
    display: none;
  }
  .identity-actions .order-trigger {
    width: 40px;
    justify-content: center;
    padding: 8px;
  }
  .identity-actions .theme-toggle {
    width: 36px;
    height: 36px;
  }
}
</style>

<style scoped>
.water-task-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.water-exception-trigger {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--ui-border);
  border-radius: 50%;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 15px;
  transition: transform var(--ui-release-time) var(--ui-ease-out);
}
.water-exception-trigger:active {
  transform: scale(0.96);
}
</style>
