import type { ChoreActivity } from "../api/chores";
export interface ActivityMemory {
  identity: string;
  key: string;
  value: ChoreActivity | null;
}
// Board-owned UI memory survives section switches, and is discarded with identity.
export interface CalendarViewMemory {
  view: "calendar" | "list" | "stats";
  focusedDate: string;
  stats: { current: number; pausedUntil: number };
  activity: ActivityMemory;
  list: {
    month: string;
    page: number;
    scrollTop: number;
    expanded: string[];
    collapsedToday: string;
  };
}
export function createCalendarViewMemory(): CalendarViewMemory {
  return {
    view: "calendar",
    focusedDate: "",
    stats: { current: 0, pausedUntil: 0 },
    activity: { identity: "", key: "", value: null },
    list: {
      month: "",
      page: 0,
      scrollTop: 0,
      expanded: [],
      collapsedToday: "",
    },
  };
}
