import { onScopeDispose, ref, watch } from "vue";
import { choreRequest } from "../api/chores";

interface HistoryDraft {
  open: boolean;
  token: string;
  memberId: number;
  blocked: boolean;
  version: number;
  recordId?: number;
  revision: number;
  member: number;
  key: string;
  reason: string;
  when: string;
  today: string;
}
export function useHistoryMutation(
  source: () => HistoryDraft,
  events: {
    confirm: () => Promise<unknown>;
    saved: () => void;
    close: () => void;
  },
) {
  const pending = ref(false),
    error = ref("");
  let epoch = 0,
    disposed = false;
  watch(
    [
      () => source().open,
      () => source().token,
      () => source().memberId,
      () => source().recordId,
    ],
    () => {
      epoch++;
      error.value = "";
    },
    { flush: "sync" },
  );
  async function save(remove = false) {
    const s = { ...source() };
    if (disposed || !s.open || s.blocked || pending.value) return;
    if (!s.reason.trim()) {
      error.value = "请填写补记或修正原因";
      return;
    }
    if (!remove) {
      const date = new Date(`${s.when}:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.when) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 16) !== s.when ||
        s.when < "2020-01-01T00:00" ||
        s.when > `${s.today}T23:59`
      ) {
        error.value = "请选择有效的完成时间，不能晚于今天";
        return;
      }
    }
    if (remove && !s.recordId) return;
    const generation = epoch;
    pending.value = true;
    error.value = "";
    try {
      if (remove) {
        try {
          await events.confirm();
        } catch {
          return;
        }
        if (disposed || generation !== epoch || !source().open) return;
      }
      await choreRequest("/chores/history", s.token, {
        method: remove ? "DELETE" : s.recordId ? "PATCH" : "POST",
        body: JSON.stringify({
          version: s.version,
          reason: s.reason.trim(),
          ...(s.recordId
            ? { id: s.recordId, revision: s.revision }
            : { member_id: s.member, key: s.key }),
          ...(!remove ? { completed_at: `${s.when}:00+08:00` } : {}),
        }),
      });
      if (
        disposed ||
        source().token !== s.token ||
        source().memberId !== s.memberId
      )
        return;
      events.saved();
      if (generation === epoch && source().open) events.close();
    } catch (cause) {
      if (!disposed && generation === epoch && source().open)
        error.value =
          cause instanceof Error ? cause.message : "保存失败，请重试";
    } finally {
      if (!disposed) pending.value = false;
    }
  }
  onScopeDispose(() => {
    disposed = true;
    epoch++;
  });
  return { pending, error, save };
}
