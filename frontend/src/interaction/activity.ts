export function shiftDay(day: string, delta: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
/** Consecutive recorded days within the displayed window, never a task quota. */
export function activityStreak(dates: string[], today: string) {
  const set = new Set(dates.filter((day) => day <= today));
  const sorted = [...set].sort();
  let longest = 0,
    run = 0,
    previous = "";
  for (const day of sorted) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  let current = 0,
    day = set.has(today) ? today : shiftDay(today, -1);
  while (set.has(day)) {
    current++;
    day = shiftDay(day, -1);
  }
  return { current, longest };
}
