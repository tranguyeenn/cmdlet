/**
 * UI entry point: input handling, command history, and window lifecycle hooks.
 */
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ensureStorageReady } from "./storage/service";
import { loadSettings } from "./storage/settingsStore";
import { getReminderLists } from "./storage/reminderStore";
import {
  checkDueNotifications,
  startNativeNotificationScheduler,
} from "./services/nativeNotifications";
import { syncDueRemindersQuiet } from "./services/dueReminders";
import {
  applyCompletion,
  currentToken,
  getCompletions,
  longestCommonPrefix,
} from "./autocomplete";
import { clearFollowUp, executeCommand, getFollowUpHint, isFollowUpActive, parseInput } from "./executor";
import type { HistoryEntry } from "./types";
import "./styles.css";

const WINDOW_WIDTH = 920;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 520;

const input = document.getElementById("command-input") as HTMLInputElement;
const historyEl = document.getElementById("history") as HTMLDivElement;
const suggestionsEl = document.getElementById("suggestions") as HTMLDivElement;
const paletteEl = document.getElementById("palette") as HTMLDivElement;

const history: HistoryEntry[] = [];
const inputHistory: string[] = [];
let inputHistoryIndex = -1;
let draftInput = "";
let ignoreBlur = false;

function renderHistory(scrollToLatest = false): void {
  historyEl.innerHTML = history
    .map(
      (entry) => `
        <div class="history-entry">
          <div class="history-input">&gt; ${escapeHtml(entry.input)}</div>
          <div class="history-output">${escapeHtml(entry.output)}</div>
        </div>
      `,
    )
    .join("");

  if (scrollToLatest) {
    scrollHistoryToBottom();
  }
}

function scrollHistoryToBottom(): void {
  requestAnimationFrame(() => {
    historyEl.scrollTop = historyEl.scrollHeight;
  });
}

function renderSuggestions(items: string[]): void {
  if (items.length === 0) {
    suggestionsEl.textContent = "";
    suggestionsEl.hidden = true;
    return;
  }

  suggestionsEl.textContent = items.join("  ");
  suggestionsEl.hidden = false;
}

function clearSuggestions(): void {
  suggestionsEl.textContent = "";
  suggestionsEl.hidden = true;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function focusInput(): void {
  input.focus();
}

function rememberInput(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  if (inputHistory[inputHistory.length - 1] !== trimmed) {
    inputHistory.push(trimmed);
  }

  inputHistoryIndex = -1;
  draftInput = "";
}

function navigateInputHistory(direction: "up" | "down"): void {
  if (inputHistory.length === 0) {
    return;
  }

  if (direction === "up") {
    if (inputHistoryIndex === -1) {
      draftInput = input.value;
      inputHistoryIndex = 0;
    } else if (inputHistoryIndex < inputHistory.length - 1) {
      inputHistoryIndex += 1;
    }
  } else if (inputHistoryIndex === -1) {
    return;
  } else if (inputHistoryIndex > 0) {
    inputHistoryIndex -= 1;
  } else {
    inputHistoryIndex = -1;
    input.value = draftInput;
    clearSuggestions();
    return;
  }

  input.value = inputHistory[inputHistory.length - 1 - inputHistoryIndex] ?? "";
  clearSuggestions();
}

function handleTabCompletion(): void {
  const completions = getCompletions(input.value);
  if (completions.length === 0) {
    clearSuggestions();
    return;
  }

  if (completions.length === 1) {
    input.value = applyCompletion(input.value, completions[0]);
    clearSuggestions();
    return;
  }

  const shared = longestCommonPrefix(completions);
  const token = currentToken(input.value);
  if (shared.length > token.length) {
    input.value = applyCompletion(input.value, shared);
    renderSuggestions(completions.filter((item) => item.startsWith(shared)));
    return;
  }

  renderSuggestions(completions);
}

async function syncWindowSize(center = false): Promise<void> {
  historyEl.style.maxHeight = "";

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

  let height = Math.max(paletteEl.scrollHeight, MIN_HEIGHT);

  if (height > MAX_HEIGHT) {
    const inputRow = paletteEl.querySelector(".input-row");
    const inputHeight = inputRow?.getBoundingClientRect().height ?? 32;
    const chrome = 22 + 14 + 22 + 36;
    historyEl.style.maxHeight = `${MAX_HEIGHT - inputHeight - chrome}px`;
    height = MAX_HEIGHT;
  }

  await getCurrentWindow().setSize(new LogicalSize(WINDOW_WIDTH, height));
  if (center) {
    await getCurrentWindow().center();
  }
}

async function hidePalette(): Promise<void> {
  if (!(await getCurrentWindow().isVisible())) {
    return;
  }

  history.length = 0;
  renderHistory();
  input.value = "";
  inputHistoryIndex = -1;
  draftInput = "";
  clearFollowUp();
  clearSuggestions();
  await syncWindowSize();
  await getCurrentWindow().hide();
}

async function handleSubmit(): Promise<void> {
  const value = input.value.trim();
  const followUpActive = isFollowUpActive();
  if (!value && !followUpActive) {
    return;
  }

  if (value) {
    rememberInput(value);
  }
  clearSuggestions();

  const { commandName } = parseInput(value);
  if (commandName === "clear") {
    history.length = 0;
    renderHistory();
    input.value = "";
    await syncWindowSize();
    focusInput();
    return;
  }

  const output = await executeCommand(value);
  history.push({ input: value || "(blank)", output });
  renderHistory(true);
  input.value = "";
  if (isFollowUpActive()) {
    renderSuggestions([getFollowUpHint() ?? "Answer the prompt above"]);
  } else {
    clearSuggestions();
  }
  await syncWindowSize();
  scrollHistoryToBottom();
  focusInput();
}

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void handleSubmit();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    void hidePalette();
    return;
  }

  if (event.metaKey && event.key.toLowerCase() === "q") {
    event.preventDefault();
    ignoreBlur = true;
    void getCurrentWindow().hide();
    void invoke("quit_app");
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    navigateInputHistory("up");
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    navigateInputHistory("down");
    return;
  }

  if (event.key === "Tab") {
    event.preventDefault();
    handleTabCompletion();
  }
});

input.addEventListener("input", () => {
  if (suggestionsEl.hidden) {
    return;
  }
  clearSuggestions();
});

void listen("palette-shown", () => {
  ignoreBlur = true;
  checkDueNotifications();
  void syncWindowSize(true).then(() => {
    focusInput();
    window.setTimeout(() => {
      ignoreBlur = false;
    }, 150);
  });
});

void listen("cmdlet-calendar-missing", () => {
  history.push({
    input: "> setup",
    output:
      'No "Cmdlet" calendar found. Events will use your default calendar until you create one in Apple Calendar.',
  });
  renderHistory(true);
  void syncWindowSize();
});

void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
  if (focused || ignoreBlur) {
    return;
  }

  void hidePalette();
});

async function warmUpRemindersPermission(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.remindersEnabled) {
    return;
  }

  try {
    await getReminderLists();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Cmdlet Reminders unavailable: ${message}`);
  }
}

async function bootstrapApp(): Promise<void> {
  try {
    await ensureStorageReady();
    await warmUpRemindersPermission();
    await syncDueRemindersQuiet();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Cmdlet startup unavailable: ${message}`);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  void bootstrapApp();
  startNativeNotificationScheduler();
  void syncWindowSize(true).then(() => focusInput());
});
