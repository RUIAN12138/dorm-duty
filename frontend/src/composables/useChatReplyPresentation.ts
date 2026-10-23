import { computed, onScopeDispose, ref, watch } from "vue";
import { motionAllowed } from "../interaction/motion";
import {
  projectChatItems,
  replyReadingDelay,
  type ChatSourceItem,
} from "../interaction/chatReplyText";

// Presentation is the only owner of reveal timing. It never dispatches business
// actions or edits raw messages, and source order remains authoritative.
export function useChatReplyPresentation(
  source: () => readonly ChatSourceItem[],
) {
  const projection = computed(() => projectChatItems(source()));
  const displayedItems = ref<ReturnType<typeof projectChatItems>>([]);
  const seen = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const publish = () => {
    displayedItems.value = projection.value.filter((item) => seen.has(item.id));
  };
  function flush() {
    clearTimeout(timer);
    timer = undefined;
    for (const item of projection.value) seen.add(item.id);
    publish();
  }
  function reset() {
    clearTimeout(timer);
    timer = undefined;
    seen.clear();
    displayedItems.value = [];
  }
  function advance() {
    timer = undefined;
    if (disposed) return;
    if (!motionAllowed()) return flush();
    const item = projection.value.find((entry) => !seen.has(entry.id));
    if (!item) return;
    seen.add(item.id);
    publish();
    timer = setTimeout(advance, replyReadingDelay(item.text));
  }
  watch(
    projection,
    (next) => {
      if (!next.length) return reset();
      const live = new Set(next.map((item) => item.id));
      for (const id of seen) if (!live.has(id)) seen.delete(id);
      for (const item of next)
        if (item.role === "user" || !item.fresh) seen.add(item.id);
      if (!motionAllowed()) return flush();
      publish();
      if (!timer) advance();
    },
    { immediate: true, flush: "sync" },
  );
  onScopeDispose(() => {
    disposed = true;
    reset();
  });
  return { displayedItems, flush, reset };
}
