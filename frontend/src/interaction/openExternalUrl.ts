interface NativePort {
  postMessage(value: string): void;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  addEventListener?: (
    type: "message",
    listener: (event: MessageEvent<string>) => void,
  ) => void;
  removeEventListener?: (
    type: "message",
    listener: (event: MessageEvent<string>) => void,
  ) => void;
}
declare global {
  interface Window {
    // Android injects a listener dedicated to external navigation, so the push
    // reply proxy and its single onmessage handler stay untouched.
    DormExternalUrl?: NativePort;
  }
}
// Harmony transfers its shared private port to `DormNativePush` (declared by
// nativePush.ts). Read it through this local shape and only subscribe with
// addEventListener, so the push module keeps owning onmessage.
type SharedNativePort = NativePort;
const sharedNativePort = () =>
  (window as Window & { DormNativePush?: SharedNativePort }).DormNativePush;
export interface ExternalOpenResult {
  url: string;
  via: "native" | "web";
}
let sequence = 0;
const REQUEST_TIMEOUT = 5000;

export function normalizeExternalUrl(
  raw: string,
  base = window.location.href,
): string | null {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "https:") return null;
    if (!url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function hasNativeShell() {
  return Boolean(window.DormExternalUrl || sharedNativePort());
}

function requestNative(
  port: NativePort,
  url: string,
  useEventListener: boolean,
): Promise<ExternalOpenResult> {
  const id = `external-${++sequence}`;
  return new Promise<ExternalOpenResult>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (useEventListener) port.removeEventListener?.("message", receive);
      else if (port.onmessage === receive) port.onmessage = null;
      if (error) reject(error);
      else resolve({ url, via: "native" });
    };
    const receive = (event: MessageEvent<string>) => {
      let result: { id?: string; ok?: boolean; message?: string };
      try {
        result = JSON.parse(event.data) as typeof result;
      } catch {
        return;
      }
      if (result.id !== id) return;
      if (result.ok) finish();
      else
        finish(new Error(result.message || "无法打开链接，可复制后手动访问"));
    };
    const timer = setTimeout(
      () => finish(new Error("打开链接超时，可复制后手动访问")),
      REQUEST_TIMEOUT,
    );
    if (useEventListener) port.addEventListener?.("message", receive);
    else port.onmessage = receive;
    try {
      port.postMessage(JSON.stringify({ id, command: "openExternal", url }));
    } catch {
      finish(new Error("安装版外链通道不可用，可复制后手动访问"));
    }
  });
}

export function openExternalUrl(raw: string): Promise<ExternalOpenResult> {
  const url = normalizeExternalUrl(raw);
  if (!url)
    return Promise.reject(
      new Error("仅支持安全的 HTTPS 链接，可复制后手动访问"),
    );
  // A native shell must never fall back to window.open: that would load the
  // destination inside the WebView instead of the system browser.
  if (hasNativeShell()) {
    const dedicated = window.DormExternalUrl;
    if (dedicated) return requestNative(dedicated, url, false);
    const shared = sharedNativePort();
    if (shared?.addEventListener) return requestNative(shared, url, true);
    return Promise.reject(
      new Error("安装版需要更新后才能直接打开链接，可复制后手动访问"),
    );
  }
  // Open an empty same-origin tab synchronously, then detach its opener
  // before navigating. Unlike noopener's intentionally-null return value,
  // this lets us distinguish a genuinely blocked popup and offer copying.
  let opened: Window | null = null;
  try {
    opened = window.open("about:blank", "_blank");
    if (!opened) throw new Error("浏览器拦截了链接，可复制后手动访问");
    opened.opener = null;
    // The destination receives neither an opener nor the app's referrer.
    if (opened.document) {
      const policy = opened.document.createElement("meta");
      policy.name = "referrer";
      policy.content = "no-referrer";
      if (opened.document.head) opened.document.head.appendChild(policy);
      else {
        opened.document.write(
          '<!doctype html><html><head><meta name="referrer" content="no-referrer"></head><body></body></html>',
        );
        opened.document.close();
      }
    }
    opened.location.replace(url);
    return Promise.resolve({ url, via: "web" });
  } catch {
    opened?.close();
    return Promise.reject(new Error("浏览器未能打开链接，可复制后手动访问"));
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* Fall back to a temporary selection for older WebViews. */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
