import { invoke } from "@tauri-apps/api/core";

const ALLOWED_FILES = new Set([
  "tasks.json",
  "quicklinks.json",
  "books.json",
  "planner.json",
  "settings.json",
  "planner-export.json",
]);

function assertFileName(fileName: string): void {
  if (!ALLOWED_FILES.has(fileName)) {
    throw new Error(`Unsupported storage file: ${fileName}`);
  }
}

/** Ensure the iCloud Cmdlet folder exists with default JSON files. */
export async function ensureStorageReady(): Promise<string> {
  return invoke<string>("ensure_storage_ready_command");
}

/** Read and parse a JSON file from iCloud storage. */
export async function readJson<T>(fileName: string): Promise<T> {
  assertFileName(fileName);
  const contents = await invoke<string>("read_json_command", { fileName });
  return JSON.parse(contents) as T;
}

/** Serialize and write a JSON file to iCloud storage. */
export async function writeJson(fileName: string, data: unknown): Promise<void> {
  assertFileName(fileName);
  const contents = JSON.stringify(data, null, 2);
  await invoke("write_json_command", { fileName, contents });
}
