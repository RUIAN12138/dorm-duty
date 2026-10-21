import { onScopeDispose, ref, watch } from "vue";
import { choreRequest, type ChoreActivity } from "../api/chores";

interface ActivitySource {
  invite: string;
  token: string;
  version: number;
  today: string;
  active: boolean;
}
import type { ActivityMemory } from "../interaction/calendarViewMemory";
// Board-owned cache survives tab unmounts, never an identity change.
export function useChoreActivity(
  source: () => ActivitySource,
  memory?: ActivityMemory,
) {
  const activity = ref<ChoreActivity | null>(null);
  const error = ref("");
  const loading = ref(false);
  let identity = "",
    loadedKey = "",
    disposed = false;
  let pending:
    | { key: string; controller: AbortController; promise: Promise<boolean> }
    | undefined;
  function cancel() {
    pending?.controller.abort();
    pending = undefined;
    loading.value = false;
  }
  function refresh(): Promise<boolean> {
    const current = source();
    if (disposed || !current.active) return Promise.resolve(false);
    const key = JSON.stringify([
      current.invite,
      current.token,
      current.version,
      current.today,
    ]);
    if (pending?.key === key) return pending.promise;
    cancel();
    const controller = new AbortController();
    loading.value = true;
    error.value = "";
    const promise = Promise.resolve().then(async () => {
      if (controller.signal.aborted) return false;
      try {
        const result = await choreRequest<ChoreActivity>(
          `/chores/activity?invite_code=${encodeURIComponent(current.invite)}`,
          current.token,
          { signal: controller.signal },
        );
        if (
          disposed ||
          controller.signal.aborted ||
          pending?.controller !== controller
        )
          return false;
        activity.value = result;
        loadedKey = key;
        if (memory) {
          memory.identity = identity;
          memory.key = key;
          memory.value = result;
        }
        return true;
      } catch (e) {
        if (
          !disposed &&
          !controller.signal.aborted &&
          pending?.controller === controller
        )
          error.value = e instanceof Error ? e.message : "读取统计失败";
        return false;
      } finally {
        if (pending?.controller === controller) {
          pending = undefined;
          loading.value = false;
        }
      }
    });
    pending = { key, controller, promise };
    return promise;
  }
  watch(
    source,
    (current) => {
      const nextIdentity = JSON.stringify([current.invite, current.token]);
      if (nextIdentity !== identity) {
        cancel();
        identity = nextIdentity;
        loadedKey = memory?.identity === identity ? memory.key : "";
        activity.value = memory?.identity === identity ? memory.value : null;
        if (memory && memory.identity !== identity) {
          memory.identity = identity;
          memory.key = "";
          memory.value = null;
        }
        error.value = "";
      }
      if (!current.active) {
        cancel();
        return;
      }
      const key = JSON.stringify([
        current.invite,
        current.token,
        current.version,
        current.today,
      ]);
      if (pending && pending.key !== key) cancel();
      if (key !== loadedKey) void refresh();
    },
    { immediate: true, flush: "sync" },
  );
  onScopeDispose(() => {
    disposed = true;
    cancel();
  });
  return { activity, error, loading, refresh };
}
