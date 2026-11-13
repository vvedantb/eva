import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { z } from "zod";
import type { FatalReport } from "@/logging/unhandledRejections";
import { lastExit } from "../../modules/exit-info";

// The last error that closed the app. A release build closes with no message
// and no log a phone user can read, so the error handler saves it here and
// the next launch shows it (`LastCrashDialog`), ready to copy.

const KEY = "eva.lastCrash";
/** SecureStore values over 2 KB warn on iOS; a report is cut below that. */
const MAX_CHARS = 1_800;

const crashSchema = z.object({
  at: z.number(),
  version: z.string(),
  name: z.string(),
  message: z.string(),
  stack: z.string(),
});
export type LastCrash = z.infer<typeof crashSchema>;

/** Saves the report for the next launch. Never throws. */
export async function saveLastCrash(report: FatalReport): Promise<void> {
  try {
    const crash: LastCrash = { at: Date.now(), version: Constants.expoConfig?.version ?? "?", ...report };
    let text = JSON.stringify(crash);
    if (text.length > MAX_CHARS) text = JSON.stringify({ ...crash, stack: crash.stack.slice(0, MAX_CHARS - (text.length - crash.stack.length)) });
    await SecureStore.setItemAsync(KEY, text);
  } catch {
    // A crash logger must never throw.
  }
}

let last: LastCrash | null = null;
const listeners = new Set<() => void>();
const publish = (next: LastCrash | null) => {
  last = next;
  for (const listener of listeners) listener();
};

/** Android's exit records shown already: the last one's time. */
const SEEN_EXIT_KEY = "eva.lastExitSeen";
const EXIT_TITLES: Record<string, string> = {
  crash_native: "Native crash",
  crash: "Android crash",
  anr: "App not responding",
};

/**
 * A native crash closes the app before JavaScript runs, so nothing is saved.
 * Android keeps why the last process ended (`modules/exit-info`): a crash or
 * ANR newer than the last one shown becomes the report.
 */
async function nativeExitCrash(): Promise<LastCrash | null> {
  const exit = await lastExit();
  if (!exit) return null;
  const name = EXIT_TITLES[exit.reason];
  if (!name) return null;
  const seen = Number((await SecureStore.getItemAsync(SEEN_EXIT_KEY)) ?? 0);
  if (exit.timestamp <= seen) return null;
  await SecureStore.setItemAsync(SEEN_EXIT_KEY, String(exit.timestamp));
  return {
    at: exit.timestamp,
    version: Constants.expoConfig?.version ?? "?",
    name,
    message: (exit.description || exit.reason).slice(0, 500),
    stack: exit.trace,
  };
}

/** Reads the saved crash once at start (`app/_layout.tsx`): a JS fatal first, else Android's record. */
export async function loadLastCrash(): Promise<void> {
  try {
    const text = await SecureStore.getItemAsync(KEY);
    const parsed = text ? crashSchema.safeParse(JSON.parse(text)) : null;
    if (parsed?.success) {
      publish(parsed.data);
      return;
    }
    publish(await nativeExitCrash());
  } catch {
    // Nothing to show.
  }
}

/** Forgets the shown crash. */
export function dismissLastCrash() {
  publish(null);
  void SecureStore.deleteItemAsync(KEY).catch(() => {});
}

export function useLastCrash(): LastCrash | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => last,
  );
}

/** The text Copy puts on the clipboard. */
export function crashDetails(crash: LastCrash): string {
  return [`Eva ${crash.version}, ${new Date(crash.at).toISOString()}`, `${crash.name}: ${crash.message}`, crash.stack].join("\n");
}
