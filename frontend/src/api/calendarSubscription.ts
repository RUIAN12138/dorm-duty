import { choreRequest } from "./chores";
export interface CalendarSubscription {
  enabled: boolean;
  include_alarms: boolean;
  version: number;
  updated_at: string | null;
  path?: string;
}
export const getCalendarSubscription = (token: string, signal?: AbortSignal) =>
  choreRequest<CalendarSubscription>("/chores/calendar-subscription", token, {
    signal,
  });
export const createCalendarSubscription = (
  token: string,
  version: number,
  include_alarms: boolean,
  signal?: AbortSignal,
) =>
  choreRequest<CalendarSubscription>("/chores/calendar-subscription", token, {
    method: "POST",
    body: JSON.stringify({ version, include_alarms }),
    signal,
  });
export const updateCalendarSubscription = (
  token: string,
  version: number,
  include_alarms: boolean,
  signal?: AbortSignal,
) =>
  choreRequest<CalendarSubscription>("/chores/calendar-subscription", token, {
    method: "PATCH",
    body: JSON.stringify({ version, include_alarms }),
    signal,
  });
export const revokeCalendarSubscription = (
  token: string,
  version: number,
  signal?: AbortSignal,
) =>
  choreRequest<CalendarSubscription>("/chores/calendar-subscription", token, {
    method: "DELETE",
    body: JSON.stringify({ version }),
    signal,
  });
