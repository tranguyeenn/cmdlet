import { readJson } from "./service";

export { ensureStorageReady, readJson, writeJson } from "./service";

/** Read planner.json from iCloud storage. */
export async function loadPlanner<T>(): Promise<T> {
  return readJson<T>("planner.json");
}
