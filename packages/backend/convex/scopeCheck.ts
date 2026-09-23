"use node";

/**
 * Asks TypeSafe Jev whether a finished turn's diff went beyond what the user
 * asked for, and whether the reply owned up to it: one requested/necessary/kind
 * call per hunk, one whole-diff headline question, and one mention question per
 * flagged hunk.
 *
 * The mention pass is the point. An unrequested change the reply names is a
 * decision the reader can review; an unnamed one reaches production unseen,
 * which is how a trophy icon nobody asked for shipped inside a tabs feature.
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
import { readBoolean, readChoice } from "./_jev/answers";
import { evaluateDecision } from "./_jev/client";
import type { EvaluateInputRaw } from "./_jev/schema";
import {
  CHANGE_KIND_QUESTION,
  clipReply,
  describeChange,
  humaniseSurface,
  isChangeKind,
  MENTION_QUESTION,
  type ChangeKind,
} from "./_scopeCheck/describe";
import { splitDiffIntoHunks, type DiffHunk } from "./_scopeCheck/hunks";
import {
  buildOverallDiff,
  clipPrompt,
  hunkKey,
  HUNK_QUESTIONS,
  MAX_JUDGED_HUNKS,
  OVERALL_QUESTION,
  SCOPE_BATCH_SIZE,
  selectFlagged,
  summariseScopeCheck,
  type JudgedHunk,
} from "./_scopeCheck/verdict";

/** Gateway usage tag; attributes the spend to this feature. */
const JEV_TAG = "eva-scope-check";

/**
 * Runs `judge` over `items` `size` at a time. Both passes are one Jev call per
 * item, and the gateway 503s when a turn fires sixty at once.
 */
async function inBatches<Item, Result>(
  items: readonly Item[],
  size: number,
  judge: (item: Item) => Promise<Result | null>,
): Promise<Result[]> {
  const out: Result[] = [];
  for (let start = 0; start < items.length; start += size) {
    const results = await Promise.all(
      items.slice(start, start + size).map(judge),
    );
    for (const result of results) {
      if (result !== null) out.push(result);
    }
  }
  return out;
}

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
      const bodies = new Map<string, DiffHunk>(
        candidates.map((hunk) => [hunkKey(hunk), hunk]),
      );

      // Scope and kind ride in one call: Jev answers every question in a
      // request together, so the plain-English label costs nothing extra.
      const judged = await inBatches(
        candidates,
        SCOPE_BATCH_SIZE,
        async (hunk): Promise<JudgedHunk | null> => {
          const input: EvaluateInputRaw = {
            // JSON-compatible only: no `undefined` anywhere inside `state`.
            state: {
              prompt,
              file: hunk.file,
              hunk: `${hunk.header}\n${hunk.body}`,
            },
            questions: { ...HUNK_QUESTIONS, ...CHANGE_KIND_QUESTION },
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
          const answer = readChoice(outcome, "kind");
          const kind: ChangeKind | undefined =
            answer !== null && isChangeKind(answer.choice)
              ? answer.choice
              : undefined;
          return {
            file: hunk.file,
            header: hunk.header,
            requested,
            necessary,
            ...(kind === undefined ? {} : { kind }),
            summary: describeChange({ kind, file: hunk.file, body: hunk.body }),
            surface: humaniseSurface(hunk.file),
          };
        },
      );

      // Only the hunks the chip will actually show are worth a mention call:
      // the flagged set is single digits on a normal turn, and capped at 20.
      const reply = clipReply(context.reply);
      const mentioned = new Map<string, number>(
        await inBatches(
          selectFlagged(judged),
          SCOPE_BATCH_SIZE,
          async (hunk): Promise<[string, number] | null> => {
            const body = bodies.get(hunkKey(hunk));
            if (body === undefined) return null;
            const outcome = await evaluateDecision(
              {
                state: {
                  reply,
                  change: hunk.summary ?? hunk.header,
                  file: hunk.file,
                  hunk: `${hunk.header}\n${body.body}`,
                },
                questions: MENTION_QUESTION,
              },
              { tag: JEV_TAG },
            );
            const probability = readBoolean(outcome, "mentioned");
            return probability === null ? null : [hunkKey(hunk), probability];
          },
        ),
      );

      // The headline question reads the same filtered hunks the per-hunk
      // questions do — every judgeable hunk, not just the judged slice — so
      // lockfile and generated-bundle churn cannot drive the chip's number.
      const overallDiff = buildOverallDiff(hunks);
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
        mentioned,
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
