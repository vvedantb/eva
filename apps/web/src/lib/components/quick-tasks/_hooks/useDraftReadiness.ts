import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import { useIdleCallback } from "@/lib/hooks/useIdleCallback";
import type { DraftReadiness } from "../_components/readinessHints";

/** Long enough that the judgement lands in a pause, not between two words. */
export const READINESS_IDLE_MS = 800;
/** Below this there is nothing to judge — every short draft is "too vague". */
export const READINESS_MIN_CHARS = 40;

interface DraftReadinessState {
  /** The description the result was judged against; stale results are dropped. */
  forText: string;
  result: DraftReadiness;
}

/**
 * Judges the open quick-task draft once typing goes idle, and remembers which
 * exact text the verdict belongs to. Editing past a judged draft hides the
 * banner until the next verdict arrives, so the nudge never describes text
 * that is no longer on screen.
 */
export function useDraftReadiness(): {
  resultFor: (description: string) => DraftReadiness | null;
  noteChange: (title: string, description: string) => void;
  dismiss: () => void;
  reset: () => void;
} {
  const assess = useAction(api.draftReadiness.assess);
  const [state, setState] = useState<DraftReadinessState | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const schedule = useIdleCallback(
    READINESS_IDLE_MS,
    (title: string, description: string) => {
      // The pending timer cannot be cancelled when the modal unmounts; a
      // setState on an unmounted component is a no-op in React 19.
      void assess({ title, description })
        .then((result) => setState({ forText: description, result }))
        .catch(() => {});
    },
  );

  return {
    resultFor: (description) => {
      if (state === null || state.forText !== description) return null;
      if (dismissedFor === description) return null;
      return state.result;
    },
    noteChange: (title, description) => {
      const trimmed = description.trim();
      if (trimmed.length < READINESS_MIN_CHARS) return;
      // Mid-mention or mid-skill: the editor is about to rewrite the text.
      const lastWord = trimmed.split(/\s+/).at(-1) ?? "";
      if (lastWord.startsWith("@") || lastWord.startsWith("/")) return;
      schedule(title, description);
    },
    dismiss: () => setDismissedFor(state?.forText ?? null),
    reset: () => {
      setState(null);
      setDismissedFor(null);
    },
  };
}
