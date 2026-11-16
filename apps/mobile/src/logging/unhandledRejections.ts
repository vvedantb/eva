import { z } from "zod";

// React Native release builds swallow unhandled promise rejections: no JS
// error reaches logcat. This installs Hermes' rejection tracker (and logs
// uncaught sync errors) so each one reaches `console.error`.

type GlobalHandler = (error: Error, isFatal?: boolean) => void;

type Tracker = (options: { allRejections: boolean; onUnhandled: (id: number, error: Error) => void }) => void;
const envSchema = z.object({
  HermesInternal: z.object({ enablePromiseRejectionTracker: z.custom<Tracker>((value) => typeof value === "function").optional() }).optional(),
  ErrorUtils: z
    .object({
      getGlobalHandler: z.custom<() => GlobalHandler>((value) => typeof value === "function"),
      setGlobalHandler: z.custom<(handler: GlobalHandler) => void>((value) => typeof value === "function"),
    })
    .optional(),
});

const errorShape = z.object({ name: z.string().optional(), message: z.string().optional(), stack: z.string().optional() });

/** Logs name, message and a short stack. Never the rejected value itself. Never throws. */
function logUncaught(kind: "unhandled-rejection" | "uncaught-error", caught: Error | object | string | number | boolean | null | undefined, extra?: { isFatal?: boolean }) {
  try {
    const parsed = errorShape.safeParse(caught);
    console.error("[uncaught]", {
      kind,
      ...extra,
      errorName: parsed.success ? parsed.data.name : typeof caught,
      errorMessage: parsed.success ? parsed.data.message?.slice(0, 200) : undefined,
      stack: parsed.success ? parsed.data.stack?.split("\n").slice(0, 6).join("\n") : undefined,
    });
  } catch {
    // A logger must never throw.
  }
}

let installed = false;

/** What a fatal error leaves behind for the next launch (`lastCrash.ts`). */
export type FatalReport = { name: string; message: string; stack: string };

/** How long a fatal error waits for `onFatal` before the app closes anyway. */
const FATAL_SAVE_MS = 1_000;

function fatalReport(caught: Error | object | string | number | boolean | null | undefined): FatalReport {
  const parsed = errorShape.safeParse(caught);
  return {
    name: (parsed.success && parsed.data.name) || "Error",
    message: ((parsed.success && parsed.data.message) || String(caught)).slice(0, 500),
    stack: ((parsed.success && parsed.data.stack) || "").split("\n").slice(0, 15).join("\n"),
  };
}

/**
 * Installs once. `env` is the global object; tests pass a fake. Never throws.
 * `onFatal` runs before a fatal error closes the app (at most `FATAL_SAVE_MS`):
 * a release build closes with no message, so this is how the error survives.
 */
export function installUnhandledRejectionLogging(
  env: object = globalThis,
  options: { onFatal?: (report: FatalReport) => Promise<void> } = {},
): boolean {
  if (installed) return false;
  try {
    const parsed = envSchema.safeParse(env);
    if (!parsed.success) return false;
    installed = true;
    const { HermesInternal, ErrorUtils } = parsed.data;
    HermesInternal?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, error) => logUncaught("unhandled-rejection", error),
    });
    if (ErrorUtils) {
      const previous = ErrorUtils.getGlobalHandler();
      ErrorUtils.setGlobalHandler((error, isFatal) => {
        logUncaught("uncaught-error", error, { isFatal });
        const { onFatal } = options;
        if (!isFatal || !onFatal) {
          previous(error, isFatal);
          return;
        }
        // Save first, then let the app close as before.
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, FATAL_SAVE_MS));
        void Promise.race([onFatal(fatalReport(error)).catch(() => {}), timeout]).finally(() => previous(error, isFatal));
      });
    }
    return true;
  } catch {
    return false;
  }
}

/** For tests only. */
export function resetUnhandledRejectionLoggingForTests() {
  installed = false;
}
