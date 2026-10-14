import { reactive } from "vue";
export const networkState = reactive({
  offline: !navigator.onLine,
  unreachable: false,
});
