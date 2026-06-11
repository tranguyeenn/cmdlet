/** Repeat options supported by Apple Calendar integration. */
export type RepeatRule = "none" | "daily" | "weekly" | "monthly";

/** Local history entry for recently created Apple Calendar events. */
export interface EventHistoryEntry {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  calendarName: string;
  location?: string;
  repeatRule: string;
  createdAt: string;
  appleEventId?: string;
}

export interface CalendarInfo {
  name: string;
}

/** Payload sent to the Tauri create_event command. */
export interface CreateEventPayload {
  title: string;
  startAt: string;
  endAt: string;
  calendarName: string;
  location?: string;
  notes?: string;
  repeatRule?: RepeatRule;
}

/** Response from create_event. */
export interface CreateEventResponse {
  id: string;
  appleEventId?: string;
  message: string;
}

export const CMDLET_CALENDAR_NAME = "Cmdlet";
