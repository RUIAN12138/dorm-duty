import { networkState } from "./network";
import { appPath } from "./path";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = sessionStorage.getItem("dorm-token");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(appPath(path), {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    networkState.unreachable = false;
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && path !== "/auth/login") {
        sessionStorage.removeItem("dorm-token");
        try {
          localStorage.removeItem("dorm-owner-token");
        } catch {
          /* Optional persistence. */
        }
        window.dispatchEvent(new Event("auth-expired"));
      }
      throw new ApiError(
        response.status,
        data?.detail?.message || "请求失败，请稍后重试",
      );
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    networkState.unreachable = true;
    throw new Error(
      navigator.onLine ? "连接服务失败，请稍后重试" : "当前离线，请联网后重试",
    );
  } finally {
    clearTimeout(timer);
  }
}
export function post<T>(path: string, data: unknown = {}) {
  return api<T>(path, { method: "POST", body: JSON.stringify(data) });
}
export function patch<T>(path: string, data: unknown = {}) {
  return api<T>(path, { method: "PATCH", body: JSON.stringify(data) });
}
export function query(params: Record<string, string | number | undefined>) {
  return new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString();
}
