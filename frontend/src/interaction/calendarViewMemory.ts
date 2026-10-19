// Board-owned UI memory survives section switches, and is discarded with identity.
export interface CalendarViewMemory {
  view: "calendar" | "list" | "stats";
  focusedDate: string;
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
    list: {
      month: "",
      page: 0,
      scrollTop: 0,
      expanded: [],
      collapsedToday: "",
    },
  };
}
