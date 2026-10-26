import {
  forgetSessionTokenIfCurrent,
  restoreSessionToken,
} from "../interaction/persistentSession";
import { ApiError, requestJson } from "./transport";
export { ApiError } from "./transport";
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = restoreSessionToken();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  try {
    return await requestJson<T>(
      path,
      { ...options, headers },
      "请求失败，请稍后重试",
    );
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      path !== "/auth/login" &&
      !!token &&
      headers.get("Authorization") === `Bearer ${token}` &&
      restoreSessionToken() === token
    ) {
      if (forgetSessionTokenIfCurrent(token))
        window.dispatchEvent(new Event("auth-expired"));
    }
    throw error;
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
