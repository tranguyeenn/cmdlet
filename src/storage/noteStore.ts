import { timedInvoke } from "../lib/timedInvoke";

export interface CreateNotePayload {
  title: string;
  content: string;
  appendToExisting?: boolean;
}

export interface CreateNoteResponse {
  id: string;
  message: string;
}

export interface NoteHistoryEntry {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export async function createAppleNote(
  payload: CreateNotePayload,
): Promise<CreateNoteResponse> {
  return timedInvoke<CreateNoteResponse>("create_note", { payload }, "notes.create");
}

export async function getNoteHistory(): Promise<NoteHistoryEntry[]> {
  return timedInvoke<NoteHistoryEntry[]>("get_note_history", undefined, "storage.read.noteHistory");
}
