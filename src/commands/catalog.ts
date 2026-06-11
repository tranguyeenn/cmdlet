/**
 * Shared command catalog (everything except help, which references this list).
 */
import type { Command } from "../types";
import { alertCommand } from "./alert";
import { assignmentCommand } from "./assignment";
import { bookCommand } from "./book";
import { brainCommand, lifeCommand, projectCommand } from "./brainCommands";
import { calcCommand } from "./calc";
import { classCommand } from "./class";
import { clearCommand } from "./clear";
import { clipboardCommand } from "./clipboard";
import { dashboardCommand } from "./dashboard";
import { eventCommand } from "./event";
import { examCommand } from "./exam";
import { exportCommand } from "./export";
import { fileCommand } from "./file";
import { noteCommand } from "./note";
import { notifyCommand } from "./notify";
import { openCommand } from "./open";
import { progressCommand } from "./progress";
import { reminderCommand } from "./reminder";
import { settingsCommand } from "./settings";
import { spotifyCommand } from "./spotify";
import { taskCommand } from "./task";
import { timerCommand } from "./timer";
import { webCommand } from "./web";

export const catalogCommands: Command[] = [
  openCommand,
  calcCommand,
  clearCommand,
  brainCommand,
  classCommand,
  assignmentCommand,
  examCommand,
  noteCommand,
  taskCommand,
  reminderCommand,
  alertCommand,
  notifyCommand,
  eventCommand,
  projectCommand,
  lifeCommand,
  bookCommand,
  progressCommand,
  dashboardCommand,
  exportCommand,
  webCommand,
  fileCommand,
  spotifyCommand,
  timerCommand,
  clipboardCommand,
  settingsCommand,
];

export {
  alertCommand,
  assignmentCommand,
  bookCommand,
  brainCommand,
  calcCommand,
  classCommand,
  clearCommand,
  clipboardCommand,
  dashboardCommand,
  eventCommand,
  examCommand,
  exportCommand,
  fileCommand,
  lifeCommand,
  noteCommand,
  notifyCommand,
  openCommand,
  progressCommand,
  projectCommand,
  reminderCommand,
  settingsCommand,
  spotifyCommand,
  taskCommand,
  timerCommand,
  webCommand,
};
