import { onScopeDispose, ref, watch, type Ref } from "vue";
import { choreRequest } from "../api/chores";

export function useMarkerEditor(
  source: () => {
    open: boolean;
    token: string;
    memberId: number;
    current: string;
  },
  busy: Ref<string>,
  events: { close: () => void; saved: (marker: string) => void },
) {
  const draft = ref(""),
    error = ref("");
  let epoch = 0,
    disposed = false;
  watch(
    [() => source().open, () => source().token, () => source().memberId],
    () => {
      epoch++;
      if (source().open) {
        draft.value = source().current;
        error.value = "";
      }
    },
    { immediate: true, flush: "sync" },
  );
  async function save() {
    const s = source();
    if (disposed || !s.open || busy.value || !draft.value) return;
    const generation = epoch,
      marker = draft.value;
    busy.value = "marker";
    error.value = "";
    try {
      await choreRequest("/chores/marker", s.token, {
        method: "PATCH",
        body: JSON.stringify({ marker_id: marker }),
      });
      if (
        disposed ||
        source().token !== s.token ||
        source().memberId !== s.memberId
      )
        return;
      events.saved(marker);
      if (generation === epoch && source().open) events.close();
    } catch (cause) {
      if (!disposed && generation === epoch && source().open)
        error.value =
          cause instanceof Error ? cause.message : "保存失败，请重试";
    } finally {
      if (!disposed) busy.value = "";
    }
  }
  onScopeDispose(() => {
    disposed = true;
    epoch++;
  });
  return { draft, error, save };
}
