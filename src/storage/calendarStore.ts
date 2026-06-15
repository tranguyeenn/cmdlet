import { timedInvoke } from "../lib/timedInvoke";
import type {
  CalendarInfo,
  CreateEventPayload,
  CreateEventResponse,
  EventHistoryEntry,
} from "../types/event";

export async function getCalendars(): Promise<CalendarInfo[]> {
  return timedInvoke<CalendarInfo[]>("get_calendars", undefined, "calendar.list");
}

export async function checkCmdletCalendarExists(): Promise<boolean> {
  return timedInvoke<boolean>("check_cmdlet_calendar_exists", undefined, "calendar.checkCmdlet");
}

export async function createCmdletCalendar(): Promise<string> {
  return timedInvoke<string>("create_cmdlet_calendar", undefined, "calendar.createCmdlet");
}

export async function createEvent(
  payload: CreateEventPayload,
): Promise<CreateEventResponse> {
  return timedInvoke<CreateEventResponse>("create_event", { payload }, "calendar.createEvent");
}

export async function getEventHistory(): Promise<EventHistoryEntry[]> {
  return timedInvoke<EventHistoryEntry[]>("get_event_history", undefined, "storage.read.eventHistory");
}

export interface DeleteEventPayload {
  title: string;
  calendarName?: string;
}

export interface DeleteEventResponse {
  message: string;
}

export async function deleteEvent(
  payload: DeleteEventPayload,
): Promise<DeleteEventResponse> {
  return timedInvoke<DeleteEventResponse>("delete_event", { payload }, "calendar.deleteEvent");
}
