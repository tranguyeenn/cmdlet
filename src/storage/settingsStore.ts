import { timedInvoke } from "../lib/timedInvoke";

export interface AppSettings {
  browser: string;
  calendarEnabled: boolean;
  remindersEnabled: boolean;
  notesEnabled: boolean;
  dueRemindersEnabled: boolean;
  dueReminderDaysBefore: number;
  dueReminderHour: number;
  cmdletReminderList: string;
  waterReminderEnabled: boolean;
}

export async function loadSettings(): Promise<AppSettings> {
  return timedInvoke<AppSettings>("load_settings", undefined, "storage.read.settings");
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  return timedInvoke<AppSettings>("save_settings", { settings }, "storage.write.settings");
}

export async function updateSetting(key: string, value: string): Promise<AppSettings> {
  return timedInvoke<AppSettings>("update_setting", { key, value }, "storage.write.settings");
}
