"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { readChoice } from "./_jev/answers";
import { evaluateDecision } from "./_jev/client";
import {
  EMOJI_CANDIDATES,
  MAX_EMOJI_QUERY_CHARS,
  rankEmoji,
} from "./_emojiSuggestions/rank";

/**
 * Asks Jev which reactions fit what the user typed into the emoji picker's
 * search. The picker's own search only matches emoji keywords, so "ship it" or
 * "nice work" find nothing; Jev reads the intent instead.
 *
 * Called once the search box goes idle, so a failure is never fatal: an
 * unusable answer comes back as no suggestions and the quick-react row stays.
 */
export const suggest = action({
  args: { query: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args): Promise<string[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const query = args.query.trim().slice(0, MAX_EMOJI_QUERY_CHARS);
    if (query.length === 0) return [];

    const outcome = await evaluateDecision(
      {
        state: { search: query },
        questions: {
          emoji: {
            type: "choice",
            instructions:
              "Someone typed this into an emoji picker's search box to react to a comment. Which emoji best matches what they are looking for?",
            criteria: Object.fromEntries(
              EMOJI_CANDIDATES.map((candidate) => [candidate.name, null]),
            ),
          },
        },
      },
      { tag: "eva-emoji-suggestions" },
    );

    if (!outcome.ok) {
      console.error("[emojiSuggestions]", outcome.errorCode, outcome.error);
      return [];
    }
    return rankEmoji(readChoice(outcome, "emoji")?.probabilities ?? {});
  },
});
