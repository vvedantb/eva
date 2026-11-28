import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@eva/backend";
import type { DraftReadiness } from "./readinessHints";
import { useIdleCallback } from "@vvedantb/ui";

const READINESS_IDLE_MS = 800;
const READINESS_MIN_CHARS = 40;

interface DraftReadinessState {
  forText: string;
  result: DraftReadiness;
}

/**
 * Judges a draft prompt once typing goes idle, and remembers which exact text
 * the verdict belongs to. Editing past a judged draft hides the banner until
 * the next verdict arrives, so the nudge never describes text that is no
 * longer on screen.
 *
 * Shared by the quick-task modal (title plus description) and the chat
 * composer (the message on its own, hence the optional title).
 */
export function useDraftReadiness(): {
  resultFor: (description: string) => DraftReadiness | null;
  noteChange: (description: string, title?: string) => void;
  dismiss: () => void;
  reset: () => void;
} {
  const enabled =
    useQuery(api.auth.getExperimentalFlags)?.draftReadiness ?? false;
  const assess = useAction(api.draftReadiness.assess);
  const [state, setState] = useState<DraftReadinessState | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const schedule = useIdleCallback(
    READINESS_IDLE_MS,
    (title: string, description: string) => {
      void assess({ title, description })
        .then((result) => setState({ forText: description, result }))
        .catch(() => {});
    },
  );

  return {
    resultFor: (description) => {
      if (!enabled || state === null || state.forText !== description)
        return null;
      if (dismissedFor === description) return null;
      return state.result;
    },
    noteChange: (description, title = "") => {
      if (!enabled) return;
      const trimmed = description.trim();
      if (trimmed.length < READINESS_MIN_CHARS) return;
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
