import { networkState } from "./network";
import { appPath } from "./path";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Identity-specific wrappers own authentication policy; transport only owns I/O.
export async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  fallback = "操作失败，请稍后重试",
): Promise<T> {
  const controller = new AbortController();
  const signal = options.signal;
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    cancel();
  }, 15000);
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  try {
    const response = await fetch(appPath(path), {
      ...options,
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
      headers,
    });
    // Cancellation is local navigation, not evidence of network failure/recovery.
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    networkState.unreachable = false;
    let validJson = true;
    const data = await response.json().catch(() => {
      validJson = false;
      return null;
    });
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (timedOut) throw new Error("Request timed out");
    if (!response.ok)
      throw new ApiError(response.status, data?.detail?.message || fallback);
    if (!validJson && response.status !== 204)
      throw new ApiError(response.status, "服务响应异常，请稍后重试");
    return data as T;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (error instanceof ApiError) throw error;
    networkState.unreachable = true;
    throw new Error(
      !navigator.onLine
        ? "当前离线，请联网后重试"
        : timedOut
          ? "请求超时，请检查网络后重试"
          : "连接服务失败，请稍后重试",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
