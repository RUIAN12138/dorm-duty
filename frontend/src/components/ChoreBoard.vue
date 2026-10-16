<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { showToast as showVantToast } from "vant";
function showToast(message: string) {
  showVantToast({
    message,
    position: "top",
    className: "chore-notice",
    duration: 1600,
  });
}
import { createVelocityTracker, rubberBand } from "../interaction/gestures";
import { useRouter } from "vue-router";
import { ApiError } from "../api";
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
import WaterOrderSheet from "./WaterOrderSheet.vue";
import TaskTitle from "./TaskTitle.vue";
import CompletionAction from "./CompletionAction.vue";
import GalaxySpinner from "./GalaxySpinner.vue";
import ActionItem from "./ActionItem.vue";
import { tilt as vTilt } from "../interactions/tilt";
import WaterNudge from "./WaterNudge.vue";
import WaterHandoffName from "./WaterHandoffName.vue";
import { baselineWaterHandoff } from "../interaction/waterHandoff";
import { lastWaterNudge, waterNudge, waterNudgeTime } from "../api/waterNudge";
import ChoreCalendar from "./ChoreCalendar.vue";
import ChoreSettings from "./ChoreSettings.vue";
import ChorePushSettings from "./ChorePushSettings.vue";
import CreatorRecovery from "./CreatorRecovery.vue";
import { syncMemberPush } from "../api/memberPush";
import { onNativePushReady } from "../api/nativePush";
import ElasticSheet from "./ElasticSheet.vue";
import MemberMark from "./MemberMark.vue";
import MarkerPicker from "./MarkerPicker.vue";
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
const emit = defineEmits<{
  expired: [];
  member: [value: ChoreMember];
  "switch-member": [];
  "join-dorm": [];
  "create-dorm": [];
  "recover-owner": [];
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
  reminderOpen = ref(false),
  markerOpen = ref(false),
  markerDraft = ref("");
const toolsOpen = ref(false),
  preferencesOpen = ref(false),
  orderOpen = ref(false);
let alive = true;
const roundOpen = ref(false);
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
function fromTools(action: () => void) {
  queuedTool = action;
  toolsOpen.value = false;
}
function fromPreferences(action: () => void) {
  queuedTool = action;
  preferencesOpen.value = false;
}
function runQueuedTool() {
  const action = queuedTool;
  queuedTool = null;
  action?.();
}
const selectedTaskId = ref<number | null>(null);
const titleAnimation = ref(true);
function chooseDutyTask(id: number, event: MouseEvent) {
  titleAnimation.value = event.detail !== 0;
  selectedTaskId.value = id;
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
      titleAnimation.value = true;
      selectedTaskId.value = next.id;
    } else if (personalTasks.value.length > 1)
      showToast(direction > 0 ? "已经是最后一项" : "已经是第一项");
  },
);
const detailTask = ref<ChoreTask | null>(null);
const detailOpen = ref(false);
const detailMotion = ref<"shared" | "bottom">("shared");
const detailOrigin = ref<DOMRect | null>(null);
const sectionOrder = ["duty", "water", "calendar"];
const sectionPaths = ["/", "/water", "/calendar"];
const sectionSwipeOffset = ref(0);
const sectionSwipeDragging = ref(false);
let sectionPointer: {
  id: number;
  x: number;
  y: number;
  horizontal: boolean;
  surface: HTMLElement;
  velocity: ReturnType<typeof createVelocityTracker>;
} | null = null;
function resetSectionSwipe() {
  const active = sectionPointer;
  sectionPointer = null;
  sectionSwipeDragging.value = false;
  sectionSwipeOffset.value = 0;
  if (active?.surface.hasPointerCapture(active.id))
    active.surface.releasePointerCapture(active.id);
}
function sectionSwipeDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || sectionPointer) return;
  if (
    !(event.target instanceof Element) ||
    event.target.closest(
      "button,a,input,textarea,select,[role=tablist],[contenteditable=true],.calendar-surface,.task-title-stage,[data-sheet-scroll]",
    )
  )
    return;
  sectionPointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    horizontal: false,
    surface: event.currentTarget as HTMLElement,
    velocity: createVelocityTracker(event.clientX, performance.now()),
  };
}
function sectionSwipeMove(event: PointerEvent) {
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
  sectionSwipeDragging.value = true;
  sectionSwipeOffset.value = rubberBand(x, 150);
}
function sectionSwipeUp(event: PointerEvent) {
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
  if (
    event.type === "lostpointercapture" &&
    sectionPointer?.surface.hasPointerCapture(event.pointerId)
  )
    return;
  if (sectionPointer?.id === event.pointerId) resetSectionSwipe();
}
function sectionHidden() {
  if (document.hidden) resetSectionSwipe();
}
onMounted(() => {
  window.addEventListener("blur", resetSectionSwipe);
  document.addEventListener("visibilitychange", sectionHidden);
});
onUnmounted(() => {
  resetSectionSwipe();
  window.removeEventListener("blur", resetSectionSwipe);
  document.removeEventListener("visibilitychange", sectionHidden);
});
watch(
  () => props.section,
  () => {
    taskSwipe.cancel();
    resetSectionSwipe();
    detailOpen.value = false;
  },
);
function openTask(task: ChoreTask, event: MouseEvent) {
  if (task.key !== "water" && taskSwipe.suppressesClick(event)) return;
  detailMotion.value = task.key === "water" ? "bottom" : "shared";
  detailOrigin.value =
    task.key === "water"
      ? null
      : (event.currentTarget as HTMLElement).getBoundingClientRect();
  detailTask.value = task;
  detailOpen.value = true;
}
function showEntered(element: Element) {
  element.removeAttribute("aria-hidden");
  element.removeAttribute("inert");
  navigationOrigin.value = null;
}
function hideLeaving(element: Element) {
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("inert", "");
}
const targetId = ref<number | null>(null),
  targetTaskId = ref<number | null>(null),
  targetTasks = ref<ChoreTask[]>([]),
  targetLoading = ref(false),
  targetError = ref("");
let controller: AbortController | null = null,
  targetController: AbortController | null = null,
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
const activeDutyTask = computed(
  () =>
    personalTasks.value.find((task) => task.id === selectedTaskId.value) ||
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
  if (!open) completedRoundReceipt.value = null;
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
const reminderSeenKey = `dorm-reminder-presented-v1:${props.invite}:${props.memberId}`;
const presentedReminders = new Set<number>();
try {
  const saved = JSON.parse(sessionStorage.getItem(reminderSeenKey) || "[]");
  if (Array.isArray(saved))
    for (const id of saved)
      if (Number.isSafeInteger(id)) presentedReminders.add(id);
} catch {
  /* Presentation still works when browser storage is unavailable. */
}
function rememberPresentedReminders() {
  for (const note of unread.value) presentedReminders.add(note.id);
  try {
    sessionStorage.setItem(
      reminderSeenKey,
      JSON.stringify([...presentedReminders].slice(-200)),
    );
  } catch {
    /* Keep the in-memory deduplication for this visit. */
  }
}
function presentNewReminders() {
  if (
    props.demo ||
    document.visibilityState !== "visible" ||
    !unread.value.length
  )
    return;
  if (messagesOpen.value) {
    rememberPresentedReminders();
    return;
  }
  if (
    busy.value ||
    settingsOpen.value ||
    reminderOpen.value ||
    markerOpen.value ||
    toolsOpen.value ||
    preferencesOpen.value ||
    orderOpen.value ||
    roundOpen.value ||
    pushOpen.value ||
    recoveryOpen.value ||
    detailTask.value ||
    document.querySelector(".sheet-layer")
  )
    return;
  if (unread.value.some((note) => !presentedReminders.has(note.id))) {
    messagesOpen.value = true;
    rememberPresentedReminders();
  }
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
  controller?.abort();
  const requestController = new AbortController();
  controller = requestController;
  const id = ++requestId;
  loading.value = true;
  error.value = "";
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
    baselineWaterHandoff(
      `${props.invite}:${props.memberId}`,
      result.water_handoff,
    );
    board.value = result;
    if (
      waterReceipt.value &&
      !result.undo_tasks.some((t) => t.id === waterReceipt.value?.id)
    )
      waterReceipt.value = null;
    completionSyncPending.value = false;
    if (!props.demo) void syncMemberPush(props.token).catch(() => {});
    emit("member", result.member);
    scheduleMidnight(result.server_time);
    return true;
  } catch (e) {
    if (id !== requestId || requestController.signal.aborted) return false;
    if (e instanceof ApiError && e.status === 401) {
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
  completionReceipt.value = finished;
  completionEpoch.value++;
  if (motionAllowed()) {
    completionMorphId.value = finished.id;
    clearTimeout(completionMorphTimer);
    completionMorphTimer = setTimeout(
      () => settleCompletion(finished.id),
      1300,
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
    board.value.water_handoff = {
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
async function complete(task: ChoreTask) {
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
  if (task.key !== "water") selectedTaskId.value = task.id;
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
    if (receipt.task.key === "water") waterReceipt.value = null;
    board.value.today_tasks = board.value.today_tasks.map((t) =>
      t.id === id ? receipt.task : t,
    );
    board.value.undo_tasks = (board.value.undo_tasks || []).filter(
      (t) => t.id !== id,
    );
    board.value.calendar = board.value.calendar.filter((t) => t.id !== id);
    if (receipt.task.key === "water") board.value.water_task = receipt.task;
    else selectedTaskId.value = id;
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
function openReminder() {
  if (props.demo) {
    demoNotice();
    return;
  }
  targetId.value = null;
  targetTaskId.value = null;
  targetTasks.value = [];
  targetError.value = "";
  reminderOpen.value = true;
}
async function chooseTarget(person: ChoreMember) {
  targetController?.abort();
  targetController = new AbortController();
  const signal = targetController.signal;
  targetId.value = person.user_id;
  targetTaskId.value = null;
  targetTasks.value = [];
  targetLoading.value = true;
  targetError.value = "";
  try {
    const result = await getChoreBoard(
      props.invite,
      person.user_id,
      month.value,
      props.token,
      signal,
    );
    if (signal.aborted) return;
    const tasks = [
      ...result.today_tasks,
      ...result.next_tasks,
      ...(result.water_task?.assignee_id === person.user_id
        ? [result.water_task]
        : []),
    ].filter((task) => task.status === "pending");
    targetTasks.value = [
      ...new Map(tasks.map((task) => [task.id, task])).values(),
    ];
    targetTaskId.value = targetTasks.value[0]?.id || null;
  } catch (e) {
    if (!signal.aborted) targetError.value = (e as Error).message;
  } finally {
    if (!signal.aborted) targetLoading.value = false;
  }
}
async function sendReminder() {
  if (busy.value || !targetId.value || !targetTaskId.value) return;
  busy.value = "reminder";
  targetError.value = "";
  try {
    await choreRequest("/chores/remind", props.token, {
      method: "POST",
      body: JSON.stringify({
        target_member_id: targetId.value,
        task_id: targetTaskId.value,
      }),
    });
    reminderOpen.value = false;
    showToast("提醒已发送");
    await load();
  } catch (e) {
    targetError.value = (e as Error).message;
  } finally {
    busy.value = "";
  }
}
async function markRead(id: number) {
  if (busy.value) return;
  busy.value = `read-${id}`;
  try {
    await choreRequest(`/chores/reminders/${id}/read`, props.token, {
      method: "PATCH",
      body: "{}",
    });
    await load();
  } catch (e) {
    actionError.value = (e as Error).message;
  } finally {
    busy.value = "";
  }
}
function openMarker() {
  if (props.demo) {
    demoNotice();
    return;
  }
  markerDraft.value = board.value?.member.marker_id || "";
  actionError.value = "";
  markerOpen.value = true;
}
async function saveMarker() {
  if (busy.value || !markerDraft.value) return;
  busy.value = "marker";
  actionError.value = "";
  try {
    await choreRequest("/chores/marker", props.token, {
      method: "PATCH",
      body: JSON.stringify({ marker_id: markerDraft.value }),
    });
    markerOpen.value = false;
    await load();
  } catch (e) {
    actionError.value = (e as Error).message;
  } finally {
    busy.value = "";
  }
}
function visibleRefresh() {
  presentNewReminders();
  if (
    document.visibilityState === "visible" &&
    !loading.value &&
    !busy.value &&
    !settingsOpen.value &&
    !reminderOpen.value &&
    !markerOpen.value &&
    !toolsOpen.value &&
    !preferencesOpen.value &&
    !orderOpen.value &&
    !roundOpen.value &&
    !pushOpen.value &&
    !recoveryOpen.value &&
    !detailTask.value &&
    (!document.querySelector(".sheet-layer") || messagesOpen.value)
  )
    void load();
}
watch(month, () => void load());
const removeNativeReady = onNativePushReady(() => {
  if (!props.demo) void syncMemberPush(props.token).catch(() => {});
});
onMounted(() => {
  void load();
  poll = setInterval(visibleRefresh, 10000);
  document.addEventListener("visibilitychange", visibleRefresh);
  window.addEventListener("focus", visibleRefresh);
  window.addEventListener("online", visibleRefresh);
});
onUnmounted(() => {
  alive = false;
  removeNativeReady();
  resetSectionSwipe();
  ++requestId;
  controller?.abort();
  targetController?.abort();
  if (poll) clearInterval(poll);
  if (midnight) clearTimeout(midnight);
  document.removeEventListener("visibilitychange", visibleRefresh);
  window.removeEventListener("focus", visibleRefresh);
  window.removeEventListener("online", visibleRefresh);
});
</script>
<template>
  <div class="chore-board" data-testid="chore-board">
    <div
      v-if="loading && !board"
      class="board-loading"
      role="status"
      aria-label="正在加载任务"
    >
      <GalaxySpinner class="board-spinner" />
    </div>
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
    <div v-else-if="error" class="chore-inline-error" role="alert">
      {{ error }}<button :disabled="loading" @click="load">重新加载</button>
    </div>
    <template v-if="board">
      <div class="board-identity">
        <span class="identity-name">{{ dormName }}</span>
        <div class="identity-actions">
          <button
            class="order-trigger"
            aria-label="任务轮序"
            data-testid="open-water-order"
            @click="orderOpen = true"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 6h12M8 12h12M8 18h12M3 5v2M3 11v2M3 17v2" /></svg
            ><span>轮序</span>
          </button>
          <button
            class="tools-button"
            :aria-label="
              unread.length
                ? `更多操作，${unread.length} 条未读消息`
                : '更多操作'
            "
            data-testid="open-tools"
            @click="openTools"
          >
            <van-icon name="ellipsis" aria-hidden="true" />
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
        @pointerdown="sectionSwipeDown"
        @pointermove="sectionSwipeMove"
        @pointerup="sectionSwipeUp"
        @pointercancel="sectionSwipeCancel"
        @lostpointercapture="sectionSwipeCancel"
      >
        <Transition
          name="focus-fade"
          @before-leave="hideLeaving"
          @before-enter="showEntered"
        >
          <div :key="section" class="focus-pane">
            <section
              v-if="section === 'calendar'"
              class="calendar-pane"
              data-testid="pane-calendar"
            >
              <ChoreCalendar
                :month="month"
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
                  {{ task.name
                  }}<van-icon
                    v-if="task.status === 'completed'"
                    name="success"
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
                    :value="activeDutyTask.id"
                    :animated="titleAnimation"
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
                  :task="activeDutyTask"
                  :busy="!!busy"
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
                    :active="true"
                    :celebrate="completionEpoch"
                    compact
                  />
                  <span
                    >第 {{ displayRound?.sequence }} 轮 ·
                    {{ displayRound?.completed }}/{{
                      displayRound?.total
                    }}
                    人</span
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
                      :value="water.assignee_id"
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
                    :disabled="completionSyncPending"
                    :demo="demo"
                    @complete="complete"
                    @undo="undo($event.id)"
                  />
                  <div
                    v-if="water.assignee_id !== memberId"
                    class="water-nudge-actions"
                  >
                    <p class="hero-date" role="status">
                      {{ nudgeCaption }}
                    </p>
                    <button
                      class="water-remind"
                      @click="openTask(water, $event)"
                    >
                      查看任务
                    </button>
                  </div>
                  <p v-else-if="!waterActionTask" class="hero-date">
                    {{ dateText(water.duty_date) }} 开始
                  </p>
                  <CompletionAction
                    v-if="recentUndo && recentUndo.id !== waterActionTask?.id"
                    :task="recentUndo"
                    :busy="!!busy"
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
      <p
        v-if="actionError && !markerOpen"
        class="chore-inline-error"
        role="alert"
      >
        {{ actionError }}
      </p>
      <ElasticSheet
        v-model="toolsOpen"
        :title="dormName || '宿舍'"
        motion="bottom"
        @closed="runQueuedTool"
      >
        <div class="menu-profile">
          <MemberMark :id="board.member.marker_id" :size="34" />
          <div>
            <strong>{{ board.member.nickname }}</strong
            ><span>{{
              demo ? "游客体验" : board.is_creator ? "宿舍创建者" : "宿舍成员"
            }}</span>
          </div>
        </div>
        <div class="menu-quick">
          <ActionItem
            tile
            label="提醒室友"
            icon="chat-o"
            data-testid="open-reminder"
            @click="fromTools(openReminder)"
          />
          <ActionItem
            tile
            :delay="0.02"
            label="室友消息"
            icon="comment-o"
            :badge="unread.length"
            data-testid="open-messages"
            @click="fromTools(() => (messagesOpen = true))"
          />
          <ActionItem
            tile
            :delay="0.04"
            label="切换宿舍"
            icon="exchange"
            data-testid="guest-change-dorm"
            @click="fromTools(() => emit('join-dorm'))"
          />
          <ActionItem
            tile
            :delay="0.06"
            label="系统通知"
            icon="bell"
            data-testid="open-system-notifications"
            @click="fromTools(() => (pushOpen = true))"
          />
        </div>
        <div class="menu-section">
          <ActionItem
            v-if="board.is_creator && !demo"
            label="任务设置"
            icon="setting-o"
            data-testid="open-chore-settings"
            @click="fromTools(() => (settingsOpen = true))"
          />
          <ActionItem
            label="个人与更多"
            icon="contact-o"
            data-testid="open-preferences"
            @click="fromTools(() => (preferencesOpen = true))"
          />
        </div>
      </ElasticSheet>
      <ElasticSheet
        v-model="preferencesOpen"
        title="个人与更多"
        motion="bottom"
        @closed="runQueuedTool"
      >
        <div class="menu-section">
          <ActionItem
            label="切换我的身份"
            icon="friends-o"
            data-testid="guest-change-member"
            @click="fromPreferences(() => emit('switch-member'))"
          />
          <ActionItem
            label="更换标记"
            icon="smile-o"
            data-testid="open-marker"
            @click="fromPreferences(openMarker)"
          />
        </div>
        <div class="menu-section">
          <ActionItem
            label="创建宿舍"
            icon="plus"
            data-testid="guest-create-dorm"
            @click="fromPreferences(() => emit('create-dorm'))"
          />
          <ActionItem
            v-if="!demo"
            :label="board.is_creator ? '管理恢复码' : '恢复管理权限'"
            icon="shield-o"
            data-testid="open-creator-recovery"
            @click="
              fromPreferences(() =>
                board?.is_creator
                  ? (recoveryOpen = true)
                  : emit('recover-owner'),
              )
            "
          />
          <ActionItem
            label="刷新安排"
            icon="replay"
            :disabled="loading || !!busy"
            data-testid="chore-refresh"
            @click="fromPreferences(() => void refreshArrangements())"
          />
        </div>
      </ElasticSheet>
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
        <div v-if="detailTask" v-tilt class="task-detail-card">
          <p class="task-full-content">{{ detailTask.content }}</p>
          <div class="task-detail-meta">
            <span>{{ statusText(detailTask) }}</span>
            <span>{{ detailTask.assignee_name }}</span
            ><span v-if="detailTask.mode === 'scheduled'"
              >{{ dateText(detailTask.duty_date) }} ·
              {{ clock(detailTask.deadline_at) }} 前</span
            >
          </div>
          <p v-if="detailTask.completed_at" class="chore-completed">
            {{ clock(detailTask.completed_at) }} 已完成
          </p>
        </div>
      </ElasticSheet>
      <ElasticSheet
        v-model="roundOpen"
        :title="`${activeDutyTask?.name || '值日'} · 第 ${displayRound?.sequence || 1} 轮`"
        @closed="presentNewReminders"
      >
        <div
          v-if="displayRound"
          class="round-members"
          data-testid="round-members"
        >
          <RoundProgress :round="displayRound" :active="roundOpen" />
        </div>
      </ElasticSheet>
      <ElasticSheet
        v-model="messagesOpen"
        title="室友消息"
        @closed="presentNewReminders"
      >
        <div class="chore-reminders" data-testid="chore-reminders">
          <div class="messages-heading">
            <p>
              {{
                unread.length ? `还有 ${unread.length} 条未读提醒` : "全部已读"
              }}
            </p>
            <button data-testid="messages-close" @click="messagesOpen = false">
              收起消息
            </button>
          </div>
          <p v-if="!board.reminders.length" class="messages-empty">
            还没有室友提醒。
          </p>
          <article
            v-for="note in board.reminders"
            :key="note.id"
            :data-testid="`reminder-${note.id}`"
          >
            <p class="reminder-sender">
              {{ note.sender_name || "室友" }}提醒你
            </p>
            <h3 class="reminder-task-name">
              {{ note.task_name || "完成宿舍任务" }}
            </h3>
            <p
              class="reminder-content"
              v-if="note.body && note.body !== note.task_name"
            >
              {{ note.body }}
            </p>
            <div>
              <time :datetime="note.created_at">{{
                clock(note.created_at)
              }}</time
              ><button
                v-if="!note.read_at"
                :disabled="!!busy"
                :data-testid="`reminder-read-${note.id}`"
                @click="markRead(note.id)"
              >
                知道了</button
              ><span v-else class="message-read">已读</span>
            </div>
          </article>
        </div>
      </ElasticSheet>
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
          section === 'water' ? 'water' : activeDutyTask?.key || 'floor'
        "
        @saved="load"
        @closed="presentNewReminders"
      />
      <ElasticSheet v-model="reminderOpen" title="提醒一位室友"
        ><div class="reminder-form">
          <p class="guest-muted">
            选一位室友和一项任务。提醒会显示在对方的网页里。
          </p>
          <div class="reminder-people">
            <button
              v-for="person in board.members.filter(
                (person) => person.user_id !== memberId,
              )"
              :key="person.user_id"
              :class="{ selected: targetId === person.user_id }"
              :data-testid="`reminder-member-${person.user_id}`"
              @click="chooseTarget(person)"
            >
              <MemberMark :id="person.marker_id" :size="22" />{{
                person.nickname
              }}
            </button>
          </div>
          <div v-if="targetLoading" class="board-loading" role="status">
            正在查看这位室友的任务…
          </div>
          <div v-else-if="targetId" class="reminder-task-list">
            <p v-if="!targetTasks.length" class="guest-muted">
              这位室友当前没有待完成任务。
            </p>
            <button
              v-for="task in targetTasks"
              :key="task.id"
              :class="{ selected: targetTaskId === task.id }"
              :data-testid="`reminder-task-${task.id}`"
              @click="targetTaskId = task.id"
            >
              <span>{{ task.name }}</span
              ><small>{{
                task.key === "water"
                  ? "轮到抬水"
                  : task.mode === "self_round"
                    ? "本轮待完成"
                    : dateText(task.duty_date)
              }}</small>
            </button>
          </div>
          <p v-if="targetError" class="chore-inline-error" role="alert">
            {{ targetError }}
          </p>
          <button
            class="guest-primary"
            data-testid="reminder-submit"
            :disabled="!!busy || targetLoading || !targetTaskId"
            @click="sendReminder"
          >
            {{ busy === "reminder" ? "发送中…" : "发送提醒" }}
          </button>
        </div></ElasticSheet
      >
      <ElasticSheet v-model="markerOpen" title="你的日历标记"
        ><MarkerPicker
          v-model="markerDraft"
          :occupied="occupied"
          :disabled="!!busy"
        />
        <p v-if="actionError" class="chore-inline-error" role="alert">
          {{ actionError }}
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
.task-detail-card {
  position: relative;
  isolation: isolate;
  padding: 20px;
  margin: 2px 0;
  border: 1px solid #e8e8e8;
  border-radius: 22px;
  background: #f8f8f8;
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
    #fff 0,
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
  background: #f5f5f5;
  color: #222;
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
.menu-profile {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 4px 24px;
}
.menu-profile > div {
  display: grid;
  gap: 5px;
}
.menu-profile strong {
  font-size: 20px;
  font-weight: 600;
}
.menu-profile span {
  font-size: 14px;
  color: #777;
}
.menu-quick {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.menu-section {
  padding: 7px;
  margin-top: 16px;
  border-radius: 22px;
  background: #fafafa;
}
.menu-section + .menu-section {
  margin-top: 12px;
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
  color: #555;
  padding: 10px 4px;
  min-height: 44px;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}
/* One shared left edge and type scale across the three mobile pages. */
.chore-board {
  min-width: 0;
  color: #111;
}
.chore-sync-status {
  position: fixed;
  z-index: 105;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(82px + env(safe-area-inset-bottom));
  width: min(calc(100% - 40px), 480px);
  border: 1px solid #eee;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 4px 18px #0000000a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  color: #555;
  font-size: 14px;
}
.chore-sync-status button {
  flex-shrink: 0;
  padding: 8px 0 8px 12px;
  min-height: 44px;
  border: 0;
  background: none;
  color: #111;
  font: inherit;
}
.board-identity {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
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
  color: #111;
}
.tools-unread {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: #111;
  color: #fff;
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
.board-focus :deep([data-section-swipe-handle]) {
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}
.board-focus > .focus-pane:not([inert]) {
  transition: opacity 220ms cubic-bezier(0.22, 1, 0.36, 1);
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
  color: #555;
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
  color: #111;
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
  background: #111;
  color: #fff;
  border: 1px solid #111;
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
  color: #111;
  font-size: 20px;
  line-height: 1.5;
  margin: 0;
}
.chore-completed .van-icon {
  font-size: 24px;
}
.hero-date {
  font-size: 17px;
  color: #555;
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
  color: #666;
  background: #fff;
  transition:
    background-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}
.task-selector button[aria-pressed="true"] {
  color: #111;
  background: #f0f0f0;
}
.water-empty {
  text-align: center;
}
.water-empty h2 {
  margin-top: 28px;
}
.water-order {
  border-top: 1px solid #e5e5e5;
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
  color: #666;
  font-size: 15px;
  min-width: 0;
}
.water-order > div > span.current {
  color: #111;
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
  border-bottom: 1px solid #eee;
  color: #111;
  font-size: 18px;
  text-align: left;
}
.message-count {
  display: grid;
  place-items: center;
  background: #111;
  color: #fff;
  min-width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 13px;
}
.messages-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.messages-heading p,
.messages-empty {
  font-size: 16px;
  color: #555;
  line-height: 1.6;
}
.messages-heading button {
  border: 0;
  background: none;
  color: #555;
  min-height: 44px;
  font-size: 15px;
  padding: 8px 0;
}
.message-read {
  font-size: 14px;
  color: #666;
  padding: 12px 0;
}
.chore-inline-error {
  border-left: 2px solid #111;
  padding: 10px 12px;
  color: #555;
  font-size: 15px;
  line-height: 1.6;
  margin-bottom: 12px;
}
.chore-inline-error button {
  display: block;
  min-height: 44px;
  border: 0;
  background: none;
  color: #111;
  font-size: 15px;
  padding: 8px 0;
}
.task-full-content {
  font-size: 18px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.task-detail-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  margin-top: 24px;
  font-size: 15px;
  color: #555;
}
.board-loading {
  padding-top: 16px;
}
.board-loading span:not(.galaxy-spinner) {
  display: block;
  border-radius: 8px;
  background: #f0f0f0;
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
    transition: opacity 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .focus-fade-leave-active {
    position: absolute;
    top: 0;
    pointer-events: none;
    transition: opacity 160ms ease;
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
.chore-reminders {
  border-top: 1px solid #111;
  margin-top: 0;
  padding-top: 16px;
}
.chore-reminders header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.chore-reminders h2 {
  font-size: 14px;
  font-weight: 550;
  margin: 0;
}
.chore-reminders header span {
  font-size: 10px;
  color: #777;
}
.chore-reminders article {
  border-bottom: 1px solid #eee;
  padding: 12px 0;
}
.chore-reminders article p {
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.chore-reminders .reminder-sender {
  color: #555;
}
.chore-reminders .reminder-task-name {
  font-size: 32px;
  letter-spacing: -0.8px;
  line-height: 1.25;
  margin: 8px 0 12px;
  overflow-wrap: anywhere;
}
.chore-reminders .reminder-content {
  margin-bottom: 12px;
}
.chore-reminders article div {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.chore-reminders time {
  font-size: 10px;
  color: #777;
}
.chore-reminders article button {
  background: none;
  border: 0;
  min-height: 40px;
  color: #555;
  font-size: 11px;
  padding: 7px 0;
}
.reminder-form {
  color: #111;
}
.reminder-people {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 20px 0;
}
.reminder-people button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 10px;
  color: #111;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.reminder-people button.selected,
.reminder-task-list button.selected {
  border-color: #111;
  background: #f7f7f7;
}
.reminder-task-list button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 11px 12px;
  color: #111;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 7px;
  margin-top: 8px;
  font-size: 13px;
}
.reminder-task-list small {
  font-size: 10px;
  color: #777;
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
  color: #777;
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
  border: 1px solid #e8e8e8;
  border-radius: 18px;
  color: #222;
  background: #fff;
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
  background: #f6f6f6;
  font: inherit;
  font-size: 16px;
  margin-top: 18px;
  padding: 12px 16px;
  cursor: pointer;
  transition: transform 160ms ease;
}
.round-edit-entry .van-icon:last-child {
  margin-left: auto;
  color: #999;
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
  background-color: #f6f6f5;
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
