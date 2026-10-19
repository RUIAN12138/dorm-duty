import { onScopeDispose, ref, watch } from "vue";
import type { ChoreReminder } from "../api/chores";

// Presentation receipts are separate from server read receipts.
const memory = new Map<string, Set<number>>();
export function useReminderBanner(
  source: () => {
    identity: string;
    notes: ChoreReminder[];
    blocked: boolean;
    visible: boolean;
    inboxOpen: boolean;
  },
) {
  const active = ref<ChoreReminder | null>(null);
  let leaving = false,
    disposed = false,
    account = source().identity;
  let leavingId: number | null = null;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  function seen() {
    const key = `dorm-reminder-banner-v1:${account}`;
    const ids = memory.get(key) || new Set<number>();
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(saved))
        for (const id of saved) if (Number.isSafeInteger(id)) ids.add(id);
    } catch {
      /* Optional storage; memory still deduplicates remounts. */
    }
    memory.set(key, ids);
    return { key, ids };
  }
  function record(notes: ChoreReminder[]) {
    const { key, ids } = seen();
    for (const note of notes) ids.add(note.id);
    try {
      localStorage.setItem(key, JSON.stringify([...ids].slice(-200)));
    } catch {
      /* This visit remains usable. */
    }
  }
  function dismiss() {
    if (!active.value) return;
    leaving = true;
    leavingId = active.value.id;
    clearTimeout(leaveTimer);
    // A notice superseded before its DOM mounts has no Transition leave event.
    const id = leavingId;
    leaveTimer = setTimeout(() => settled(id), 350);
    active.value = null;
  }
  function refresh() {
    if (disposed) return;
    const s = source();
    if (account !== s.identity) {
      account = s.identity;
      clearTimeout(leaveTimer);
      leavingId = null;
      active.value = null;
      leaving = false;
    }
    if (!s.visible) return;
    if (s.inboxOpen) {
      record(s.notes);
      dismiss();
      return;
    }
    if (s.blocked) {
      dismiss();
      return;
    }
    if (active.value && !s.notes.some((note) => note.id === active.value?.id))
      dismiss();
    if (active.value || leaving) return;
    const { ids } = seen();
    const next = [...s.notes]
      .filter((note) => !note.read_at && !ids.has(note.id))
      .sort(
        (a, b) =>
          Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id,
      )[0];
    if (next) {
      active.value = next;
      record([next]);
    }
  }
  function settled(id?: number) {
    if (id !== undefined && id !== leavingId) return;
    clearTimeout(leaveTimer);
    leavingId = null;
    leaving = false;
    refresh();
  }
  watch(
    () => [
      source().identity,
      source().notes,
      source().blocked,
      source().visible,
      source().inboxOpen,
    ],
    refresh,
    { immediate: true, flush: "post" },
  );
  onScopeDispose(() => {
    disposed = true;
    clearTimeout(leaveTimer);
    active.value = null;
  });
  return { active, dismiss, settled, refresh };
}
