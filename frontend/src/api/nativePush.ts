interface NativePort {
  postMessage(value: string): void;
  onmessage: ((event: MessageEvent<string>) => void) | null;
}
declare global {
  interface Window {
    DormNativePush?: NativePort;
  }
}
export interface NativePushResult {
  ok: boolean;
  enabled: boolean;
  configured: boolean;
  platform: "android" | "harmony";
  message?: string;
}
let sequence = 0;
export const hasNativePush = () => Boolean(window.DormNativePush);
const waiting = new Map<
  string,
  {
    resolve: (result: NativePushResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
let bound: NativePort | undefined;
export function nativePush(
  command: "status" | "enable" | "sync" | "disable" | "test",
  token = "",
) {
  const port = window.DormNativePush;
  if (!port) return Promise.reject(new Error("安装版通知尚未就绪"));
  if (bound !== port) {
    for (const request of waiting.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("页面已切换，请重试"));
    }
    waiting.clear();
    bound = port;
    port.onmessage = (event) => {
      try {
        const result = JSON.parse(event.data) as NativePushResult & {
          id: string;
        };
        const pending = waiting.get(result.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        waiting.delete(result.id);
        if (result.ok) pending.resolve(result);
        else
          pending.reject(new Error(result.message || "通知操作失败，请重试"));
      } catch {
        /* Ignore unrelated native messages. */
      }
    };
  }
  const id = `push-${++sequence}`;
  return new Promise<NativePushResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error("推送连接超时，请检查网络后重试"));
    }, 45000);
    waiting.set(id, { resolve, reject, timer });
    try {
      port.postMessage(JSON.stringify({ id, command, token }));
    } catch {
      clearTimeout(timer);
      waiting.delete(id);
      reject(new Error("安装版通知连接失败"));
    }
  });
}
