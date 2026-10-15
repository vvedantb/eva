"use node";

import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { readChoice } from "./_jev/answers";
import { evaluateDecision } from "./_jev/client";
import {
  EMOJI_CANDIDATES,
  MAX_EMOJI_COMMENT_CHARS,
  MAX_EMOJI_QUERY_CHARS,
  MIN_COMMENT_EMOJI_PROBABILITY,
  rankEmoji,
} from "./_emojiSuggestions/rank";

/**
 * Asks Jev which of the candidate reactions fit `state`. Never fatal: callers
 * are background hints, so an unusable answer comes back as no suggestions.
 */
async function pickEmoji(
  ctx: ActionCtx,
  state: Record<string, string>,
  instructions: string,
  minProbability?: number,
): Promise<string[]> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const outcome = await evaluateDecision(
    {
      state,
      questions: {
        emoji: {
          type: "choice",
          instructions,
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
  return rankEmoji(
    readChoice(outcome, "emoji")?.probabilities ?? {},
    minProbability,
  );
}

/**
 * What the user typed into the emoji picker's search. The picker's own search
 * only matches emoji keywords, so "ship it" or "nice work" find nothing; Jev
 * reads the intent instead.
 */
export const suggest = action({
  args: { query: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args): Promise<string[]> => {
    const query = args.query.trim().slice(0, MAX_EMOJI_QUERY_CHARS);
    if (query.length === 0) return [];
    return pickEmoji(
      ctx,
      { search: query },
      "Someone typed this into an emoji picker's search box to react to a comment. Which emoji best matches what they are looking for?",
    );
  },
});

/** Reactions that fit a comment, for the hover quick-react strip. */
export const forComment = action({
  args: { text: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args): Promise<string[]> => {
    const text = args.text.trim().slice(0, MAX_EMOJI_COMMENT_CHARS);
    if (text.length === 0) return [];
    return pickEmoji(
      ctx,
      { comment: text },
      // Without the second sentence Jev illustrates the words ("add" → ➕)
      // instead of reacting to them.
      "A teammate is about to react to this comment in a work thread. Which emoji would they most likely react with to show how they feel about it (agree, thanks, celebrate, on it, funny, concerned)? Pick a reaction, not an emoji that depicts words in the comment.",
      MIN_COMMENT_EMOJI_PROBABILITY,
    );
  },
});
