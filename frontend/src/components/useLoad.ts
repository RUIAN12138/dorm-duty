import { ref, onMounted } from "vue";
export function useLoad(load: () => Promise<void>) {
  const loading = ref(false),
    error = ref("");
  async function refresh() {
    loading.value = true;
    error.value = "";
    try {
      await load();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "加载失败";
    } finally {
      loading.value = false;
    }
  }
  onMounted(refresh);
  return { loading, error, refresh };
}
