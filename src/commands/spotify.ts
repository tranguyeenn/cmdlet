/**
 * Control Spotify playback via AppleScript and search via the Spotify Web API.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Command, CommandResult } from "../types";

const ACTIONS = ["now", "pause", "play", "next", "prev"];

interface SpotifyTrack {
  name: string;
  artist: string;
  uri: string;
}

function formatTrackList(tracks: SpotifyTrack[]): string {
  const lines = tracks.map(
    (track, index) => `${index + 1}. ${track.artist} — ${track.name}`,
  );
  lines.push("", "Type a number to play:");
  return lines.join("\n");
}

function buildPickHandler(tracks: SpotifyTrack[]): (input: string) => Promise<CommandResult> {
  return async (input: string): Promise<CommandResult> => {
    const choice = Number.parseInt(input.trim(), 10);
    if (!Number.isInteger(choice) || choice < 1 || choice > tracks.length) {
      return {
        output: `Pick a number between 1 and ${tracks.length}.`,
        followUp: buildPickHandler(tracks),
      };
    }

    const track = tracks[choice - 1];
    try {
      await invoke<string>("spotify_play_track", { uri: track.uri });
      return `Playing ${track.artist} — ${track.name}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Spotify error: ${message}`;
    }
  };
}

export const spotifyCommand: Command = {
  name: "spotify",
  category: "Media",
  description: "Spotify: now, pause, play, next, prev, or play a song",
  examples: [
    "spotify now",
    "spotify pause",
    "spotify play",
    "spotify play bohemian rhapsody",
    "spotify next",
  ],
  complete(prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return ACTIONS.filter((action) => action.startsWith(lower));
  },
  async execute(args: string): Promise<CommandResult> {
    const trimmed = args.trim();
    if (!trimmed) {
      return `Actions: ${ACTIONS.join(", ")}`;
    }

    const lower = trimmed.toLowerCase();
    if (lower.startsWith("play ")) {
      const query = trimmed.slice(5).trim();
      if (!query) {
        return invokeSimple("play");
      }

      try {
        const tracks = await invoke<SpotifyTrack[]>("spotify_search", { query });
        if (tracks.length === 0) {
          return `No tracks found for "${query}".`;
        }

        return {
          output: formatTrackList(tracks),
          followUp: buildPickHandler(tracks),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Spotify error: ${message}`;
      }
    }

    return invokeSimple(lower);
  },
};

async function invokeSimple(action: string): Promise<CommandResult> {
  try {
    return await invoke<string>("spotify_control", { action });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Spotify error: ${message}`;
  }
}
