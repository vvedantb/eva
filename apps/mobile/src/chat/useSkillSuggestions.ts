import { api } from "@eva/backend";
import type { MentionItem } from "@eva/shared";
import {
  pickSkillSuggestions,
  shouldSuggestFor,
  SUGGEST_IDLE_MS,
  type SkillSuggestionResponse,
} from "@eva/shared/skillSuggestions";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";

/** A trailing-edge debounce: each call cancels the waiting one; `run` fires once the caller is quiet for `ms`. */
function idleTimer(ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = (run: () => void) => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      run();
    }, ms);
  };
  return { schedule, cancel };
}

/**
 * The web `useSkillSuggestions`: once the draft has sat still for
 * `SUGGEST_IDLE_MS`, Eva ranks the chat's `/` skills against it
 * (`skillSuggestions.suggest`) and the confident ones become chips. The
 * answer counts only for the exact text it was asked about, so the chips go
 * as soon as the draft moves on, as the web. Call `noteDraft` on each edit.
 */
export function useSkillSuggestions(skills: readonly MentionItem[], text: string) {
  // Behind the `skillSuggestions` experimental flag (web Settings → Experimental): off means no Jev call and no chips.
  const enabled = useQuery(api.auth.getExperimentalFlags, {})?.skillSuggestions === true;
  const suggest = useAction(api.skillSuggestions.suggest);
  const [{ schedule, cancel }] = useState(() => idleTimer(SUGGEST_IDLE_MS));
  const [evaluated, setEvaluated] = useState<{ forText: string; response: SkillSuggestionResponse } | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());

  const noteDraft = (next: string) => {
    // A draft that no longer asks (sent, cleared, too short) drops the waiting call: it would cost an evaluation for nothing.
    if (!enabled || skills.length === 0 || !shouldSuggestFor(next)) {
      cancel();
      return;
    }
    schedule(() => {
      suggest({
        text: next,
        candidates: skills.map((item) => ({ id: item.id, label: item.label, description: item.description ?? "" })),
      })
        .then((response) => setEvaluated({ forText: next, response }))
        // A background hint: a failed evaluation leaves the chips hidden.
        .catch(() => undefined);
    });
  };

  return {
    noteDraft,
    chips: enabled
      ? pickSkillSuggestions(evaluated?.forText === text ? evaluated.response : null, { text, skillItems: skills, dismissed })
      : [],
    dismiss: (id: string) => setDismissed((current) => new Set(current).add(id)),
  };
}
