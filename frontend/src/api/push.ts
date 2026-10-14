import { hasNativePush } from "./nativePush";
import { api, post } from ".";
export function pushCapability() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return {
    native: hasNativePush(),
    supported:
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window,
    standalone,
    ios,
  };
}
export async function enablePush() {
  const cap = pushCapability();
  if (cap.ios && !cap.standalone)
    throw new Error("请先通过 Safari 分享菜单添加到主屏幕，再从图标打开");
  if (!cap.supported)
    throw new Error("当前环境不支持系统通知，站内消息仍可使用");
  // Request immediately from the button gesture, before awaiting network access (Safari requirement).
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("未获得通知权限，请在系统设置中允许通知");
  const config = await api<{ available: boolean; public_key: string | null }>(
    "/push/public-key",
  );
  if (!config.available || !config.public_key)
    throw new Error("服务尚未配置系统推送，站内消息仍可使用");
  const registration = await navigator.serviceWorker.ready;
  let sub = await registration.pushManager.getSubscription();
  if (sub) {
    await sub.unsubscribe();
    sub = null;
  }
  const key = config.public_key.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(
    atob(key.padEnd(Math.ceil(key.length / 4) * 4, "=")),
    (c) => c.charCodeAt(0),
  );
  sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: bytes,
  });
  try {
    const serialized = sub.toJSON();
    await post("/push/subscribe", {
      endpoint: serialized.endpoint,
      keys: serialized.keys,
    });
  } catch (error) {
    await sub.unsubscribe().catch(() => false);
    throw error;
  }
}
export async function disableDevice() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const sub = await registration?.pushManager?.getSubscription();
  if (sub) {
    await post("/push/unsubscribe", { endpoint: sub.endpoint });
    if (!(await sub.unsubscribe())) throw new Error("设备取消订阅失败，请重试");
  }
}
