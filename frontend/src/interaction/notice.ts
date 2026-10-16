import { showToast as vantToast } from "vant";
export function showToast(message: string) {
  return vantToast({
    message,
    position: "top",
    duration: 1600,
    className: "chore-notice",
  });
}
