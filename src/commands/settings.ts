/**
 * View and update app settings from the terminal.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command } from "../types";
import { loadSettings, type AppSettings } from "../storage/settingsStore";

const SETTING_KEYS = [
  "browser",
  "calendarEnabled",
  "remindersEnabled",
  "notesEnabled",
  "dueRemindersEnabled",
  "dueReminderDaysBefore",
  "dueReminderHour",
  "cmdletReminderList",
  "waterReminderEnabled",
];

function formatSettings(settings: AppSettings): string {
  return [
    "Settings:",
    `  browser                 ${settings.browser}`,
    `  calendarEnabled         ${settings.calendarEnabled}`,
    `  remindersEnabled        ${settings.remindersEnabled}`,
    `  notesEnabled            ${settings.notesEnabled}`,
    `  dueRemindersEnabled     ${settings.dueRemindersEnabled}`,
    `  dueReminderDaysBefore   ${settings.dueReminderDaysBefore}`,
    `  dueReminderHour         ${settings.dueReminderHour}`,
    `  cmdletReminderList      ${settings.cmdletReminderList}`,
    `  waterReminderEnabled    ${settings.waterReminderEnabled}`,
    "",
    "Examples:",
    "  settings dueRemindersEnabled true",
  ].join("\n");
}

function formatIntegrationSettings(settings: AppSettings): string {
  return [
    "Integration settings:",
    `  calendarEnabled   ${settings.calendarEnabled}`,
    `  remindersEnabled  ${settings.remindersEnabled}`,
    `  notesEnabled      ${settings.notesEnabled}`,
    "",
    "Alert settings:",
    `  dueRemindersEnabled     ${settings.dueRemindersEnabled}`,
    `  dueReminderDaysBefore   ${settings.dueReminderDaysBefore}`,
    `  cmdletReminderList      ${settings.cmdletReminderList}`,
    `  waterReminderEnabled    ${settings.waterReminderEnabled}`,
  ].join("\n");
}

export const settingsCommand: Command = {
  name: "settings",
  category: "Utilities",
  description: "View or change app settings",
  examples: [
    "settings",
    "settings integrations",
    "settings dueRemindersEnabled true",
  ],
  complete(prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return [...SETTING_KEYS, "integrations"].filter((key) =>
      key.toLowerCase().startsWith(lower),
    );
  },
  async execute(args: string): Promise<string> {
    const trimmed = args.trim();
    const parts = trimmed.split(/\s+/);
    const key = parts[0]?.toLowerCase();
    const value = parts.slice(1).join(" ");

    if (key === "integrations" || key === "integration") {
      try {
        const settings = await loadSettings();
        return formatIntegrationSettings(settings);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Settings error: ${message}`;
      }
    }

    try {
      if (!key) {
        const settings = await loadSettings();
        return formatSettings(settings);
      }

      if (!value) {
        const settings = await loadSettings();
        const normalized = key.replaceAll("_", "").toLowerCase();
        const match = SETTING_KEYS.find(
          (settingKey) => settingKey.replaceAll("_", "").toLowerCase() === normalized,
        );
        if (match) {
          return `${match}: ${String(settings[match as keyof AppSettings])}`;
        }
        return `Unknown setting: ${key}. Available: ${SETTING_KEYS.join(", ")}, integrations`;
      }

      const updated = await invoke<AppSettings>("update_setting", { key, value });
      return `Updated ${key}: ${String(updated[key as keyof AppSettings] ?? value)}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Settings error: ${message}`;
    }
  },
};
