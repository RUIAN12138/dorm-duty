import { hasNativePush, nativePush } from "./nativePush";
import { choreRequest } from "./chores";
import { ApiError } from "./index";
import { pushCapability } from "./push";
export interface MemberPushConfig {
  available: boolean;
  native?: boolean;
  public_key: string | null;
}
const flag = "dorm-system-notifications-v1";
let tail: Promise<unknown> = Promise.resolve(),
  identity = "",
  remembered: boolean | null = null;
function serial<T>(action: () => Promise<T>): Promise<T> {
  const result = tail.catch(() => {}).then(action);
  tail = result.catch(() => {});
  return result;
}
const optedIn = () => {
  if (remembered !== null) return remembered;
  try {
    return localStorage.getItem(flag) === "on";
  } catch {
    return false;
  }
};
function remember(on: boolean) {
  remembered = on;
  try {
    localStorage.setItem(flag, on ? "on" : "off");
  } catch {
    /* device works for this visit */
  }
}
export async function getMemberPushConfig(
  token: string,
): Promise<MemberPushConfig> {
  if (hasNativePush()) {
    const [config, device] = await Promise.all([
      choreRequest<{ android: boolean; harmony: boolean }>(
        "/chores/native/config",
        token,
      ),
      nativePush("status"),
    ]);
    return {
      available: device.configured && config[device.platform],
      public_key: null,
      native: true,
    };
  }
  return choreRequest<MemberPushConfig>("/chores/push/config", token);
}
function within<T>(
  operation: Promise<T>,
  timeout: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeout);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
async function registration() {
  const registered = await navigator.serviceWorker.getRegistration();
  if (registered?.active) return registered;
  return within(
    navigator.serviceWorker.ready,
    12000,
    "页面通知服务尚未就绪，请刷新后重试",
  );
}
async function saveDevice(token: string, sub: PushSubscription) {
  requireIdentity(token);
  const value = sub.toJSON();
  await choreRequest("/chores/push/subscribe", token, {
    method: "POST",
    body: JSON.stringify({ endpoint: value.endpoint, keys: value.keys }),
  });
}
function requireIdentity(token: string) {
  if (identity !== token)
    throw new Error("身份已切换，请在当前成员下重试通知操作");
}
export function syncMemberPush(token: string) {
  identity = token;
  return serial(async () => {
    if (hasNativePush())
      return identity === token
        ? (await nativePush("sync", token)).enabled
        : false;
    if (
      identity !== token ||
      !optedIn() ||
      !pushCapability().supported ||
      Notification.permission !== "granted"
    )
      return false;
    const reg = await registration(),
      sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    const config = await getMemberPushConfig(token);
    if (!config.available) return false;
    if (identity !== token) return false;
    try {
      await saveDevice(token, sub);
    } catch (error) {
      if (error instanceof ApiError && error.status === 410) {
        await sub.unsubscribe().catch(() => false);
        remember(false);
      }
      throw error;
    }
    return true;
  });
}
export async function enableMemberPush(
  token: string,
  config: MemberPushConfig,
) {
  if (hasNativePush()) {
    if (!config.available) throw new Error("安装版推送尚未配置");
    return serial(async () => {
      if (identity !== token) throw new Error("身份已切换，请重新开启通知");
      await nativePush("enable", token);
    });
  }
  const cap = pushCapability();
  if (cap.ios && !cap.standalone)
    throw new Error("先添加到主屏幕，再从桌面图标打开");
  if (!cap.supported || !window.isSecureContext)
    throw new Error("当前浏览器不支持系统通知");
  if (!config.available || !config.public_key)
    throw new Error("系统通知暂不可用，请稍后再试");
  // Must be invoked directly by the button, before any awaited network request.
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("请在系统设置中允许「轮到」的通知");
  return serial(async () => {
    if (identity !== token)
      throw new Error("身份已切换，请在当前成员下开启通知");
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    const key = config.public_key!.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(
      atob(key.padEnd(Math.ceil(key.length / 4) * 4, "=")),
      (c) => c.charCodeAt(0),
    );
    if (
      sub?.options.applicationServerKey &&
      (sub.options.applicationServerKey.byteLength !== bytes.length ||
        !new Uint8Array(sub.options.applicationServerKey).every(
          (v, i) => v === bytes[i],
        ))
    ) {
      await sub.unsubscribe();
      sub = null;
    }
    let created = false;
    if (!sub) {
      sub = await within(
        reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        }),
        25000,
        "浏览器无法连接推送服务，请检查网络或使用安装版",
      );
      created = true;
    }
    try {
      await saveDevice(token, sub);
      remember(true);
    } catch (error) {
      if (created || (error instanceof ApiError && error.status === 410)) {
        await sub.unsubscribe().catch(() => false);
        remember(false);
      }
      throw error;
    }
  });
}
export function disableMemberPush(token: string) {
  return serial(async () => {
    requireIdentity(token);
    if (hasNativePush()) {
      await nativePush("disable", token);
      return;
    }
    const reg = await registration(),
      sub = await reg.pushManager.getSubscription();
    requireIdentity(token);
    if (sub) {
      await choreRequest("/chores/push/unsubscribe", token, {
        method: "POST",
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      requireIdentity(token);
      if (!(await sub.unsubscribe()))
        throw new Error("设备关闭通知失败，请再试一次");
    }
    remember(false);
  });
}
export function testMemberPush(token: string) {
  return serial(async () => {
    requireIdentity(token);
    if (hasNativePush()) {
      await nativePush("test", token);
      return;
    }
    const sub = await (await registration()).pushManager.getSubscription();
    requireIdentity(token);
    if (!sub) throw new Error("请先开启系统通知");
    await choreRequest("/chores/push/test", token, {
      method: "POST",
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  });
}
