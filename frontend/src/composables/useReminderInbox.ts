import { onScopeDispose, ref, watch, type Ref } from "vue";
import { choreRequest, type ChoreReminder } from "../api/chores";

export function useReminderInbox(
  source: () => {
    open: boolean;
    token: string;
    invite: string;
    memberId: number;
  },
  busy: Ref<string>,
  events: { confirmed: (id: number, readAt: string) => void },
) {
  const error = ref("");
  const receipts = new Map<number, string>();
  let epoch = 0,
    disposed = false;
  const identity = () =>
    JSON.stringify([source().token, source().invite, source().memberId]);
  watch(
    identity,
    () => {
      epoch++;
      receipts.clear();
      error.value = "";
    },
    { flush: "sync" },
  );
  watch(
    () => source().open,
    (open) => {
      epoch++;
      if (open) error.value = "";
    },
    { flush: "sync" },
  );
  function reconcile(notes: ChoreReminder[]) {
    return notes.map((note) =>
      !note.read_at && receipts.has(note.id)
        ? { ...note, read_at: receipts.get(note.id)! }
        : note,
    );
  }
  async function read(id: number, fromBanner = false) {
    const s = source();
    if (disposed || (!s.open && !fromBanner) || busy.value || receipts.has(id))
      return;
    const generation = epoch,
      account = identity();
    busy.value = `read-${id}`;
    error.value = "";
    try {
      const response = await choreRequest<{ read_at?: string }>(
        `/chores/reminders/${id}/read`,
        s.token,
        { method: "PATCH", body: "{}" },
      );
      if (disposed || account !== identity()) return;
      const readAt = response?.read_at || new Date().toISOString();
      receipts.set(id, readAt);
      events.confirmed(id, readAt);
      return true;
    } catch (cause) {
      if (
        !disposed &&
        generation === epoch &&
        (fromBanner || (s.open && source().open))
      )
        error.value =
          cause instanceof Error ? cause.message : "记录失败，请重试";
      return false;
    } finally {
      if (!disposed) busy.value = "";
    }
  }
  onScopeDispose(() => {
    disposed = true;
    epoch++;
    receipts.clear();
  });
  return { error, read, reconcile };
}
