/** Local-only access to unfinished flows; never enabled on a deployed hostname. */
export function isLocalPreviewAvailable(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    window.location.hostname,
  );
}
