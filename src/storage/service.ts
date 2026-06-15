import { timeAsync } from "../lib/perf";
import { timedInvoke } from "../lib/timedInvoke";

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
  return timedInvoke<string>("ensure_storage_ready_command", undefined, "storage.ensureReady");
}

/** Read and parse a JSON file from iCloud storage. */
export async function readJson<T>(fileName: string): Promise<T> {
  assertFileName(fileName);
  return timeAsync(`storage.read.${fileName}`, async () => {
    const contents = await timedInvoke<string>("read_json_command", { fileName });
    return JSON.parse(contents) as T;
  });
}

/** Serialize and write a JSON file to iCloud storage. */
export async function writeJson(fileName: string, data: unknown): Promise<void> {
  assertFileName(fileName);
  await timeAsync(`storage.write.${fileName}`, async () => {
    const contents = JSON.stringify(data, null, 2);
    await timedInvoke("write_json_command", { fileName, contents });
  });
}
