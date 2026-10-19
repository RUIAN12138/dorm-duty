import type { WaterHandoff } from "../api/chores";

interface SeenHandoff {
  sequence: number;
  id: number;
  completedAt: number;
}
// Remember actual successful receipts, not board loads. The timestamp distinguishes
// completing the same turn again after undo; the sequence rejects rollback data.
const fallback = new Map<string, SeenHandoff>();
const key = (scope: string) => `dorm-water-handoff-v2:${scope}`;
function read(scope: string): SeenHandoff | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key(scope)) || "null");
    if (
      value &&
      Number.isSafeInteger(value.sequence) &&
      Number.isSafeInteger(value.id) &&
      Number.isFinite(value.completedAt)
    )
      return value;
  } catch {
    /* This visit still remembers when storage is unavailable. */
  }
  return fallback.get(scope);
}
function write(scope: string, receipt: SeenHandoff) {
  fallback.set(scope, receipt);
  try {
    localStorage.setItem(key(scope), JSON.stringify(receipt));
  } catch {
    /* In-memory fallback. */
  }
}
export function consumeWaterHandoff(
  scope: string,
  event?: WaterHandoff | null,
) {
  if (!event) return false;
  const completedAt = Date.parse(event.completed_at);
  if (
    !Number.isSafeInteger(event.sequence) ||
    !Number.isSafeInteger(event.id) ||
    !Number.isFinite(completedAt)
  )
    return false;
  const seen = read(scope);
  if (
    seen &&
    (event.sequence < seen.sequence ||
      (event.sequence === seen.sequence &&
        (completedAt < seen.completedAt ||
          (completedAt === seen.completedAt && event.id <= seen.id))))
  )
    return false;
  write(scope, { sequence: event.sequence, id: event.id, completedAt });
  return true;
}
