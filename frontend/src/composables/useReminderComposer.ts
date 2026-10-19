import { computed, onScopeDispose, ref, watch } from "vue";
import { choreRequest, getChoreBoard, type ChoreTask } from "../api/chores";
interface ReminderSource {
  open: boolean;
  invite: string;
  memberId: number;
  token: string;
  month: string;
  busy: boolean;
  context?: { memberId: number; taskId: number } | null;
}
export function useReminderComposer(
  source: () => ReminderSource,
  events: {
    sent: () => void;
    close: () => void;
    notify: (message: string) => void;
  },
) {
  const targetId = ref<number | null>(null),
    taskId = ref<number | null>(null),
    tasks = ref<ChoreTask[]>([]);
  const loading = ref(false),
    sending = ref(false),
    loaded = ref(false),
    loadError = ref(""),
    sendError = ref(""),
    contextNotice = ref("");
  let epoch = 0,
    disposed = false,
    controller: AbortController | undefined;
  watch(
    [
      () => source().open,
      () => source().invite,
      () => source().token,
      () => source().memberId,
      () => source().month,
      () => source().context,
    ],
    () => {
      epoch++;
      controller?.abort();
      loading.value = false;
      if (source().open) {
        targetId.value = null;
        taskId.value = null;
        tasks.value = [];
        loaded.value = false;
        loadError.value = "";
        sendError.value = "";
        contextNotice.value = "";
      }
    },
    { immediate: true, flush: "sync" },
  );
  watch(
    () => [source().open, source().context, source().busy, sending.value],
    () => {
      const s = source();
      if (
        s.open &&
        s.context &&
        !s.busy &&
        !sending.value &&
        targetId.value === null &&
        s.context.memberId !== s.memberId
      )
        void choose(s.context.memberId, s.context.taskId);
    },
    { immediate: true, flush: "post" },
  );
  async function choose(id: number, preferredTaskId?: number) {
    const s = source();
    if (disposed || !s.open || sending.value || s.busy || id === s.memberId)
      return;
    if (targetId.value === id && loading.value) return;
    controller?.abort();
    const current = new AbortController();
    controller = current;
    const generation = epoch;
    targetId.value = id;
    taskId.value = null;
    tasks.value = [];
    loaded.value = false;
    loadError.value = "";
    sendError.value = "";
    contextNotice.value = "";
    loading.value = true;
    try {
      const board = await getChoreBoard(
        s.invite,
        id,
        s.month,
        s.token,
        current.signal,
      );
      if (disposed || current.signal.aborted || generation !== epoch) return;
      const pending = [
        ...board.today_tasks,
        ...board.next_tasks,
        ...(board.water_task?.assignee_id === id ? [board.water_task] : []),
      ].filter((t) => t.status === "pending" && t.assignee_id === id);
      tasks.value = [...new Map(pending.map((t) => [t.id, t])).values()];
      taskId.value =
        preferredTaskId !== undefined
          ? tasks.value.find((task) => task.id === preferredTaskId)?.id || null
          : tasks.value[0]?.id || null;
      if (preferredTaskId !== undefined && taskId.value === null)
        contextNotice.value = "这项任务已完成或更新，请重新选择待办。";
      loaded.value = true;
    } catch (error) {
      if (!disposed && !current.signal.aborted && generation === epoch)
        loadError.value =
          error instanceof Error ? error.message : "读取任务失败";
    } finally {
      if (!disposed && controller === current) {
        loading.value = false;
      }
    }
  }
  function select(id: number) {
    if (
      !disposed &&
      source().open &&
      !sending.value &&
      !source().busy &&
      tasks.value.some((t) => t.id === id)
    ) {
      taskId.value = id;
      contextNotice.value = "";
    }
  }
  const canSend = computed(
    () =>
      source().open &&
      !source().busy &&
      !loading.value &&
      !sending.value &&
      loaded.value &&
      !!targetId.value &&
      tasks.value.some((t) => t.id === taskId.value),
  );
  async function send() {
    const s = source();
    if (disposed || !s.open || !canSend.value) return;
    const generation = epoch;
    const person = targetId.value,
      task = taskId.value;
    sending.value = true;
    sendError.value = "";
    try {
      await choreRequest("/chores/remind", s.token, {
        method: "POST",
        body: JSON.stringify({ target_member_id: person, task_id: task }),
      });
      const current = source();
      if (
        disposed ||
        current.token !== s.token ||
        current.memberId !== s.memberId ||
        current.invite !== s.invite
      )
        return;
      events.sent();
      events.notify("提醒已发送");
      if (generation === epoch && source().open) events.close();
    } catch (error) {
      if (!disposed && generation === epoch && source().open)
        sendError.value =
          error instanceof Error ? error.message : "发送失败，请重试";
    } finally {
      if (!disposed) sending.value = false;
    }
  }
  function retry() {
    if (targetId.value)
      void choose(targetId.value, taskId.value || source().context?.taskId);
  }
  onScopeDispose(() => {
    disposed = true;
    epoch++;
    controller?.abort();
  });
  return {
    targetId,
    taskId,
    tasks,
    loading,
    sending,
    loaded,
    loadError,
    sendError,
    contextNotice,
    canSend,
    choose,
    select,
    send,
    retry,
  };
}
