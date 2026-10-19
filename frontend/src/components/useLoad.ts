import { ref, onMounted, onScopeDispose } from "vue";
export function useLoad(load: (signal: AbortSignal) => Promise<void>) {
  const loading = ref(false),
    error = ref("");
  let controller: AbortController | undefined;
  let disposed = false;
  async function refresh() {
    if (disposed) return;
    controller?.abort();
    const current = new AbortController();
    controller = current;
    loading.value = true;
    error.value = "";
    try {
      await load(current.signal);
    } catch (e) {
      if (!disposed && controller === current && !current.signal.aborted)
        error.value = e instanceof Error ? e.message : "加载失败";
    } finally {
      if (!disposed && controller === current) loading.value = false;
    }
  }
  onMounted(refresh);
  onScopeDispose(() => {
    disposed = true;
    controller?.abort();
  });
  return { loading, error, refresh };
}
