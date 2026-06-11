import { invoke } from "@tauri-apps/api/core";

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
  return invoke<CreateNoteResponse>("create_note", { payload });
}

export async function getNoteHistory(): Promise<NoteHistoryEntry[]> {
  return invoke<NoteHistoryEntry[]>("get_note_history");
}
