import { invoke } from "@tauri-apps/api/core";
import type {
  CalendarInfo,
  CreateEventPayload,
  CreateEventResponse,
  EventHistoryEntry,
} from "../types/event";

export async function getCalendars(): Promise<CalendarInfo[]> {
  return invoke<CalendarInfo[]>("get_calendars");
}

export async function checkCmdletCalendarExists(): Promise<boolean> {
  return invoke<boolean>("check_cmdlet_calendar_exists");
}

export async function createCmdletCalendar(): Promise<string> {
  return invoke<string>("create_cmdlet_calendar");
}

export async function createEvent(
  payload: CreateEventPayload,
): Promise<CreateEventResponse> {
  return invoke<CreateEventResponse>("create_event", { payload });
}

export async function getEventHistory(): Promise<EventHistoryEntry[]> {
  return invoke<EventHistoryEntry[]>("get_event_history");
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
  return invoke<DeleteEventResponse>("delete_event", { payload });
}
