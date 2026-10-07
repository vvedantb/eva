import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { SlashItem } from "@/lib/components/mentions";
import { useIdleCallback } from "@/lib/hooks/useIdleCallback";
import {
  pickSkillSuggestions,
  shouldSuggestFor,
  SUGGEST_IDLE_MS,
  type SkillSuggestionResponse,
} from "@/lib/components/chat/_components/skillSuggestionsPick";

/**
 * Ranks the composer's `/` skills against the draft as it is typed, and hands
 * back the chips to offer above the input.
 *
 * The evaluation is keyed by the exact text it was asked about: as soon as the
 * draft moves on, the chips disappear until the next idle evaluation answers.
 * That is deliberate — a chip suggested for a sentence the user has since
 * rewritten is worse than no chip.
 */
export function useSkillSuggestions(skillItems: ReadonlyArray<SlashItem>): {
  noteDraft: (text: string) => void;
  chips: SlashItem[];
  dismiss: (id: string) => void;
} {
  const suggest = useAction(api.skillSuggestions.suggest);
  const [evaluated, setEvaluated] = useState<{
    forText: string;
    response: SkillSuggestionResponse;
  } | null>(null);
  const [latestText, setLatestText] = useState("");
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const schedule = useIdleCallback(SUGGEST_IDLE_MS, (text: string) => {
    if (skillItems.length === 0) return;
    void suggest({
      text,
      candidates: skillItems.map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description ?? "",
      })),
    })
      .then((response) => setEvaluated({ forText: text, response }))
      // Background hint: a failed evaluation just leaves the chips hidden.
      .catch(() => {});
  });

  const noteDraft = (text: string) => {
    setLatestText(text);
    if (!shouldSuggestFor(text)) return;
    schedule(text);
  };

  const chips = pickSkillSuggestions(
    evaluated && evaluated.forText === latestText ? evaluated.response : null,
    { text: latestText, skillItems, dismissed },
  );

  const dismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  return { noteDraft, chips, dismiss };
}
