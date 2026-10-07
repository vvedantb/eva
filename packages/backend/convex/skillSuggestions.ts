"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { readBoolean, readChoice } from "./_jev/answers";
import { evaluateDecision } from "./_jev/client";
import {
  dedupeCandidates,
  rankSuggestions,
  MAX_CANDIDATE_DESCRIPTION_CHARS,
  MAX_SUGGESTION_TEXT_CHARS,
  NONE_OPTION,
  type RankedSuggestion,
} from "./_skillSuggestions/rank";

const candidate = v.object({
  id: v.string(),
  label: v.string(),
  description: v.string(),
});

/**
 * Ranks the composer's `/` skills against the draft the user is typing.
 *
 * Called from the composer once typing goes idle, so a failure is never fatal:
 * an unusable answer comes back as "no skill needed" and the chips stay
 * hidden. No cache — two drafts are rarely the same string.
 */
export const suggest = action({
  args: { text: v.string(), candidates: v.array(candidate) },
  returns: v.object({
    needsSkill: v.number(),
    suggestions: v.array(v.object({ id: v.string(), probability: v.number() })),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ needsSkill: number; suggestions: RankedSuggestion[] }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const text = args.text.slice(0, MAX_SUGGESTION_TEXT_CHARS);
    const candidates = dedupeCandidates(args.candidates);
    if (candidates.length === 0) return { needsSkill: 0, suggestions: [] };

    const outcome = await evaluateDecision(
      {
        state: { request: text },
        questions: {
          needsSkill: {
            type: "boolean",
            instructions:
              "Would a specialised skill or slash command from the list help carry out this request better than a plain reply?",
          },
          skill: {
            type: "choice",
            instructions:
              "Which listed skill best fits this request? Pick 'none' when no listed skill applies.",
            criteria: {
              [NONE_OPTION]: "no listed skill applies",
              ...Object.fromEntries(
                candidates.map((item) => [
                  item.label,
                  item.description.slice(0, MAX_CANDIDATE_DESCRIPTION_CHARS) ||
                    null,
                ]),
              ),
            },
          },
        },
      },
      { tag: "eva-skill-suggestions" },
    );

    if (!outcome.ok) {
      console.error("[skillSuggestions]", outcome.errorCode, outcome.error);
      return { needsSkill: 0, suggestions: [] };
    }

    return {
      needsSkill: readBoolean(outcome, "needsSkill") ?? 0,
      suggestions: rankSuggestions(
        readChoice(outcome, "skill")?.probabilities ?? {},
        candidates,
      ),
    };
  },
});
