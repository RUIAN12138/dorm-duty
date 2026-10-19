import type { ChoreRecord } from "../api/chores";

// The centre response wins over overlapping neighbor snapshots. One index feeds
// the grid, list and day drawer, including while a month request is in flight.
export function mergeCalendarRecords(
  records: ChoreRecord[],
  neighbors: Record<string, ChoreRecord[]> = {},
): ChoreRecord[] {
  const merged = new Map<number, ChoreRecord>();
  for (const record of [...Object.values(neighbors).flat(), ...records])
    merged.set(record.id, record);
  return [...merged.values()].sort(
    (a, b) => b.completed_at.localeCompare(a.completed_at) || b.id - a.id,
  );
}
export function indexCalendarRecords(records: ChoreRecord[]) {
  const dates = new Map<string, ChoreRecord[]>();
  for (const record of records) {
    const rows = dates.get(record.completed_date) || [];
    rows.push(record);
    dates.set(record.completed_date, rows);
  }
  return dates;
}
