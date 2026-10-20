import type { ChoreRecord, ChoreTask, ChoreBoardData } from "../api/chores";

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

// Only confirmed server receipts enter the visible calendar. Neighbor copies
// must change together, or undo can leave a stale mark in a preloaded month.
export function applyCalendarReceipt(board: ChoreBoardData, task: ChoreTask) {
  board.calendar = board.calendar.filter((record) => record.id !== task.id);
  for (const key of Object.keys(board.calendar_neighbors || {}))
    board.calendar_neighbors![key] = board.calendar_neighbors![key]!.filter(
      (record) => record.id !== task.id,
    );
  if (task.status !== "completed" || !task.completed_at) return;
  const time = Date.parse(task.completed_at);
  if (!Number.isFinite(time)) return;
  const date = new Date(time + 8 * 3600000).toISOString().slice(0, 10);
  const record: ChoreRecord = {
    id: task.id,
    key: task.key,
    name: task.name,
    assignee_id: task.assignee_id,
    assignee_name: task.assignee_name,
    marker_id: task.marker_id,
    completed_at: task.completed_at,
    completed_date: date,
  };
  // This snapshot can contain the receipt even when the user is browsing a
  // different month; each calendar view filters by its own visible dates.
  board.calendar = mergeCalendarRecords([...board.calendar, record]);
}
