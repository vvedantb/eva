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

/** Installs once. `env` is the global object; tests pass a fake. Never throws. */
export function installUnhandledRejectionLogging(env: object = globalThis): boolean {
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
        previous(error, isFatal);
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
