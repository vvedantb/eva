"use node";

/**
 * Asks TypeSafe Jev whether a finished turn's diff went beyond what the user
 * asked for: one requested/necessary pair per hunk, plus one whole-diff
 * headline question.
 *
 * Background work scheduled by `scheduleScopeCheck` once the reply is written.
 * Every failure path leaves `scopeCheck` absent rather than guessing — the chip
 * simply does not appear.
 *
 * Imports stay inside `_jev/*`, `_scopeCheck/*` and the generated modules, so
 * this node chunk cannot be dragged into an import cycle (see
 * `tests/convexModuleCycleContract.test.ts`).
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { readBoolean } from "./_jev/answers";
import { evaluateDecision } from "./_jev/client";
import type { EvaluateInputRaw } from "./_jev/schema";
import { splitDiffIntoHunks } from "./_scopeCheck/hunks";
import {
  clipDiffForOverall,
  clipPrompt,
  HUNK_QUESTIONS,
  MAX_JUDGED_HUNKS,
  OVERALL_QUESTION,
  SCOPE_BATCH_SIZE,
  summariseScopeCheck,
  type JudgedHunk,
} from "./_scopeCheck/verdict";

/** Gateway usage tag; attributes the spend to this feature. */
const JEV_TAG = "eva-scope-check";

/** Tries before giving up on GitHub catching up with the pushed sha. */
const MAX_ATTEMPTS = 3;
/** Long enough for a push to land, short enough that the chip still feels live. */
const RETRY_DELAY_MS = 30_000;

export const evaluateTurn = internalAction({
  args: { messageId: v.id("messages"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal._scopeCheck.queries.getTurnContext,
      { messageId: args.messageId },
    );
    if (context === null) return null;

    try {
      const diff = await ctx.runAction(
        internal._github.prDiff.fetchCompareDiff,
        {
          repoId: context.repoId,
          baseSha: context.beforeSha,
          headSha: context.afterSha,
        },
      );
      // GitHub may not have the turn's push yet; wait and ask again.
      if (diff.unavailable) {
        if (args.attempt < MAX_ATTEMPTS) {
          await ctx.scheduler.runAfter(
            RETRY_DELAY_MS,
            internal.scopeCheck.evaluateTurn,
            { messageId: args.messageId, attempt: args.attempt + 1 },
          );
        }
        return null;
      }

      const hunks = splitDiffIntoHunks(diff.diff);
      // Nothing judgeable: a lockfile-only or binary-only turn stays silent.
      if (hunks.length === 0) return null;

      const prompt = clipPrompt(context.prompt);
      const candidates = hunks.slice(0, MAX_JUDGED_HUNKS);
      const judged: JudgedHunk[] = [];

      for (
        let start = 0;
        start < candidates.length;
        start += SCOPE_BATCH_SIZE
      ) {
        const batch = candidates.slice(start, start + SCOPE_BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (hunk): Promise<JudgedHunk | null> => {
            const input: EvaluateInputRaw = {
              // JSON-compatible only: no `undefined` anywhere inside `state`.
              state: {
                prompt,
                file: hunk.file,
                hunk: `${hunk.header}\n${hunk.body}`,
              },
              questions: HUNK_QUESTIONS,
            };
            const outcome = await evaluateDecision(input, { tag: JEV_TAG });
            const requested = readBoolean(outcome, "requested");
            const necessary = readBoolean(outcome, "necessary");
            if (requested === null || necessary === null) {
              console.error(
                "[scopeCheck] hunk unjudged",
                args.messageId,
                hunk.file,
                hunk.header,
              );
              return null;
            }
            return {
              file: hunk.file,
              header: hunk.header,
              requested,
              necessary,
            };
          }),
        );
        for (const result of results) {
          if (result !== null) judged.push(result);
        }
      }

      const overallDiff = clipDiffForOverall(diff.diff);
      const overall = await evaluateDecision(
        {
          state: { prompt, diff: overallDiff.text },
          questions: OVERALL_QUESTION,
        },
        { tag: JEV_TAG },
      );

      const scopeCheck = summariseScopeCheck({
        unrequestedProbability: readBoolean(overall, "unrequested"),
        judged,
        totalHunks: hunks.length,
        diffTruncated: diff.truncated || overallDiff.clipped,
        evaluatedAt: Date.now(),
      });

      await ctx.runMutation(internal._scopeCheck.mutations.setScopeCheck, {
        messageId: args.messageId,
        scopeCheck,
      });
    } catch (error) {
      console.error("[scopeCheck]", args.messageId, error);
    }
    return null;
  },
});
