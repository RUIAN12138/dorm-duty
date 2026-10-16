import type { WaterHandoff } from "../api/chores";

// A high-water mark survives tab changes and reloads. Undoing an older turn
// must never replay a handoff that this device has already seen.
const fallback = new Map<string, number>();
function key(scope: string) {
  return `dorm-water-handoff-v1:${scope}`;
}
function read(scope: string) {
  try {
    const value = localStorage.getItem(key(scope));
    if (value !== null && /^\d+$/.test(value)) return Number(value);
  } catch {
    /* This visit still remembers when storage is unavailable. */
  }
  return fallback.get(scope);
}
function write(scope: string, sequence: number) {
  fallback.set(scope, sequence);
  try {
    localStorage.setItem(key(scope), String(sequence));
  } catch {
    /* In-memory fallback. */
  }
}
export function baselineWaterHandoff(
  scope: string,
  event?: WaterHandoff | null,
) {
  if (read(scope) === undefined) write(scope, event?.sequence || 0);
}
export function consumeWaterHandoff(
  scope: string,
  event?: WaterHandoff | null,
) {
  if (!event) return false;
  const seen = read(scope);
  if (seen === undefined) {
    baselineWaterHandoff(scope, event);
    return false;
  }
  if (event.sequence <= seen) return false;
  write(scope, event.sequence);
  return true;
}
