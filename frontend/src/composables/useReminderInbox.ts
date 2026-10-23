import { onScopeDispose, ref, watch, type Ref } from "vue";
import { ApiError } from "../api/transport";
import { choreRequest, type ChoreReminder } from "../api/chores";

const PENDING_PREFIX = "dorm-reminder-read-pending-v1";
const RETRY_BASE_MS = 3000;
const RETRY_MAX_MS = 60000;

interface PendingRead {
  attempts: number;
  nextAt: number;
}

// Only note ids are persisted, and only under the invite/member identity key.
// Tokens and message contents never enter storage.
function loadStored(key: string): Map<number, PendingRead> {
  const pending = new Map<number, PendingRead>();
  try {
    const saved = JSON.parse(
      localStorage.getItem(`${PENDING_PREFIX}:${key}`) || "[]",
    );
    if (Array.isArray(saved))
      for (const id of saved)
        if (Number.isSafeInteger(id) && id > 0)
          pending.set(id, { attempts: 0, nextAt: 0 });
  } catch {
    /* Optional storage; this visit still retries in memory. */
  }
  return pending;
}

function serverReadAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function retryable(cause: unknown) {
  if (!(cause instanceof ApiError)) return true;
  return (
    cause.status === 401 ||
    cause.status === 408 ||
    cause.status === 425 ||
    cause.status === 429 ||
    cause.status >= 500
  );
}

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
  const queues = new Map<string, Map<number, PendingRead>>();
  const inFlight = new Map<string, Promise<boolean>>();
  let epoch = 0,
    disposed = false,
    retrying = false;
  let controller = new AbortController();
  const identity = () =>
    JSON.stringify([source().token, source().invite, source().memberId]);
  const queueKey = () => `${source().invite}:${source().memberId}`;
  let currentKey = queueKey();
  const queueFor = (key: string) => {
    let pending = queues.get(key);
    if (!pending) {
      pending = loadStored(key);
      queues.set(key, pending);
    }
    return pending;
  };
  let pending = queueFor(currentKey);

  function persist(key = currentKey) {
    const ids = [...queueFor(key).keys()];
    try {
      if (ids.length)
        localStorage.setItem(`${PENDING_PREFIX}:${key}`, JSON.stringify(ids));
      else localStorage.removeItem(`${PENDING_PREFIX}:${key}`);
    } catch {
      /* The in-memory queue remains retryable. */
    }
  }

  function remember(id: number) {
    const entry = pending.get(id) || { attempts: 0, nextAt: 0 };
    entry.attempts++;
    entry.nextAt =
      Date.now() +
      Math.min(
        RETRY_MAX_MS,
        RETRY_BASE_MS * 2 ** Math.min(entry.attempts - 1, 4),
      );
    pending.set(id, entry);
    persist();
  }

  function forget(id: number) {
    if (!pending.delete(id)) return;
    persist();
  }

  watch(
    () => queueKey(),
    () => {
      currentKey = queueKey();
      pending = queueFor(currentKey);
    },
    { flush: "sync" },
  );
  watch(
    identity,
    () => {
      epoch++;
      controller.abort();
      controller = new AbortController();
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
    // A server read timestamp means another device (or an earlier retry)
    // already confirmed it; drop the local intent instead of re-reading.
    for (const note of notes)
      if (note.read_at && pending.has(note.id)) forget(note.id);
    return notes.map((note) =>
      !note.read_at && receipts.has(note.id)
        ? { ...note, read_at: receipts.get(note.id)! }
        : note,
    );
  }

  function read(id: number, fromBanner = false): Promise<boolean> {
    const s = source();
    if (disposed || (!s.open && !fromBanner)) return Promise.resolve(false);
    if (receipts.has(id)) return Promise.resolve(true);
    const account = identity();
    const key = `${account}:${id}`;
    const existing = inFlight.get(key);
    if (existing) return existing;
    // The inbox's global busy lock protects the message sheet. A banner read
    // is an explicit user outcome and must not be swallowed by another action.
    if (!fromBanner && busy.value) return Promise.resolve(false);

    // Persist the explicit intent before I/O. Session expiry can unmount the
    // surface before the failure callback; the same member must still be able
    // to finish the receipt with a renewed credential after signing in again.
    if (fromBanner && !pending.has(id)) {
      pending.set(id, { attempts: 0, nextAt: 0 });
      persist();
    }
    const generation = epoch;
    const ownBusy = fromBanner ? "" : `read-${id}`;
    if (ownBusy) busy.value = ownBusy;
    error.value = "";
    const task = (async () => {
      try {
        const response = await choreRequest<{ read_at?: string }>(
          `/chores/reminders/${id}/read`,
          s.token,
          { method: "PATCH", body: "{}", signal: controller.signal },
        );
        if (disposed || account !== identity()) return false;
        const readAt = serverReadAt(response?.read_at);
        if (!readAt) {
          // A missing timestamp is not a confirmed read; keep the intent.
          remember(id);
          if (fromBanner || generation === epoch)
            error.value = "已读状态稍后同步";
          return false;
        }
        receipts.set(id, readAt);
        forget(id);
        events.confirmed(id, readAt);
        return true;
      } catch (cause) {
        if (disposed || account !== identity()) return false;
        if (fromBanner) {
          if (retryable(cause)) remember(id);
          else forget(id);
          error.value =
            retryable(cause) || !(cause instanceof Error)
              ? "已读状态稍后同步"
              : cause.message;
        } else if (generation === epoch && s.open && source().open) {
          error.value =
            cause instanceof Error && cause.message
              ? cause.message
              : "记录失败，请重试";
        }
        return false;
      } finally {
        inFlight.delete(key);
        if (ownBusy && busy.value === ownBusy) busy.value = "";
      }
    })();
    inFlight.set(key, task);
    return task;
  }

  // Called after a confirmed board poll, online/focus/visibility changes and
  // the online event. Per-note backoff prevents a failure loop; one failed
  // probe stops the batch so an offline device issues at most one request.
  async function retryPending() {
    if (disposed || retrying || !source().token) return;
    const due = [...pending.entries()]
      .filter(([, entry]) => entry.nextAt <= Date.now())
      .map(([id]) => id);
    if (!due.length) return;
    const account = identity(),
      generation = epoch;
    retrying = true;
    try {
      for (const id of due) {
        if (disposed || generation !== epoch || account !== identity()) break;
        if (!pending.has(id)) continue;
        const confirmed = await read(id, true);
        if (!confirmed) break;
      }
    } finally {
      retrying = false;
    }
  }

  onScopeDispose(() => {
    disposed = true;
    epoch++;
    controller.abort();
    receipts.clear();
    inFlight.clear();
  });
  return {
    error,
    read,
    reconcile,
    retryPending,
    pendingIds: () => [...pending.keys()],
  };
}
