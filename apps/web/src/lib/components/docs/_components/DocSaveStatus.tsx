"use client";

import { Button } from "@eva/ui";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";

/**
 * Where the doc's *version snapshot* has got to. Deliberately not "saving the
 * document": the text itself is CRDT-synced keystroke by keystroke and was
 * never at risk. What this reports is the periodic snapshot that history and
 * restore read from, which until now failed in complete silence.
 */
export type DocSaveState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "saving" }
  | { status: "saved"; at: number }
  | { status: "error" };

export function DocSaveStatus({
  state,
  onRetry,
}: {
  state: DocSaveState;
  onRetry: () => void;
}) {
  if (state.status === "idle") return null;

  return (
    <div
      aria-live="polite"
      className="flex shrink-0 items-center justify-end gap-1.5 px-4 pt-2 text-xs text-muted-foreground"
    >
      {state.status === "pending" ? <span>Unsaved version</span> : null}
      {state.status === "saving" ? <span>Saving version…</span> : null}
      {state.status === "saved" ? (
        <>
          <span>Version saved</span>
          <RelativeDateTime at={state.at} className="text-xs" />
        </>
      ) : null}
      {state.status === "error" ? (
        <>
          <span className="text-destructive">Couldn't save a version</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={onRetry}
          >
            Retry
          </Button>
        </>
      ) : null}
    </div>
  );
}
