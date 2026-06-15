import type { Command } from "../types";

type CommandLoader = () => Promise<Command>;

const commandLoaders = new Map<string, CommandLoader>([
  ["open", () => import("./open").then((module) => module.openCommand)],
  ["calc", () => import("./calc").then((module) => module.calcCommand)],
  ["clear", () => import("./clear").then((module) => module.clearCommand)],
  ["brain", () => import("./brainCommands").then((module) => module.brainCommand)],
  ["class", () => import("./class").then((module) => module.classCommand)],
  ["assignment", () => import("./assignment").then((module) => module.assignmentCommand)],
  ["exam", () => import("./exam").then((module) => module.examCommand)],
  ["note", () => import("./note").then((module) => module.noteCommand)],
  ["task", () => import("./task").then((module) => module.taskCommand)],
  ["reminder", () => import("./reminder").then((module) => module.reminderCommand)],
  ["alert", () => import("./alert").then((module) => module.alertCommand)],
  ["notify", () => import("./notify").then((module) => module.notifyCommand)],
  ["event", () => import("./event").then((module) => module.eventCommand)],
  ["project", () => import("./brainCommands").then((module) => module.projectCommand)],
  ["life", () => import("./brainCommands").then((module) => module.lifeCommand)],
  ["book", () => import("./book").then((module) => module.bookCommand)],
  ["progress", () => import("./progress").then((module) => module.progressCommand)],
  ["dashboard", () => import("./dashboard").then((module) => module.dashboardCommand)],
  ["export", () => import("./export").then((module) => module.exportCommand)],
  ["web", () => import("./web").then((module) => module.webCommand)],
  ["file", () => import("./file").then((module) => module.fileCommand)],
  ["spotify", () => import("./spotify").then((module) => module.spotifyCommand)],
  ["timer", () => import("./timer").then((module) => module.timerCommand)],
  ["clipboard", () => import("./clipboard").then((module) => module.clipboardCommand)],
  ["settings", () => import("./settings").then((module) => module.settingsCommand)],
  ["help", () => import("./help").then((module) => module.helpCommand)],
]);

const loadedCommands = new Map<string, Promise<Command>>();

export function loadCommand(name: string): Promise<Command> | undefined {
  const loader = commandLoaders.get(name);
  if (!loader) {
    return undefined;
  }

  const cached = loadedCommands.get(name);
  if (cached) {
    return cached;
  }

  const command = loader();
  loadedCommands.set(name, command);
  return command;
}
