"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { readBoolean, readChoice } from "./_jev/answers";
import { evaluateDecision } from "./_jev/client";
import { loadImages } from "./_jev/images";
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
import { buildVisualQuestions, screenshotName } from "./_scopeCheck/visual";

const JEV_TAG = "eva-scope-check";

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

async function judgeScreenshots(
  ctx: ActionCtx,
  messageId: Id<"messages">,
  prompt: string,
  flagged: readonly JudgedHunk[],
): Promise<{
  visible: Map<string, number>;
  screenshots?: { checked: number; showsRequest?: number };
}> {
  const visible = new Map<string, number>();
  const storageIds = await ctx.runQuery(
    internal._scopeCheck.queries.getTurnScreenshots,
    { messageId },
  );
  if (storageIds.length === 0) return { visible };
  const { images } = await loadImages(
    ctx.storage,
    storageIds.map((storageId, index) => ({
      name: screenshotName(index),
      storageId,
    })),
  );
  if (images.length === 0) return { visible };

  const { questions, hunkByQuestion } = buildVisualQuestions(
    images.map((image) => image.name),
    flagged,
  );
  const outcome = await evaluateDecision(
    { state: { prompt }, questions },
    { tag: JEV_TAG, images },
  );
  if (!outcome.ok) return { visible };
  for (const [questionId, key] of hunkByQuestion) {
    const probability = readBoolean(outcome, questionId);
    if (probability !== null) visible.set(key, probability);
  }
  const showsRequest = readBoolean(outcome, "shows_request");
  return {
    visible,
    screenshots: {
      checked: images.length,
      ...(showsRequest === null ? {} : { showsRequest }),
    },
  };
}

const MAX_ATTEMPTS = 3;
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
      if (hunks.length === 0) return null;

      const prompt = clipPrompt(context.prompt);
      const candidates = hunks.slice(0, MAX_JUDGED_HUNKS);
      const bodies = new Map<string, DiffHunk>(
        candidates.map((hunk) => [hunkKey(hunk), hunk]),
      );

      const judged = await inBatches(
        candidates,
        SCOPE_BATCH_SIZE,
        async (hunk): Promise<JudgedHunk | null> => {
          const input: EvaluateInputRaw = {
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

      const overallDiff = buildOverallDiff(hunks);
      const overall = await evaluateDecision(
        {
          state: { prompt, diff: overallDiff.text },
          questions: OVERALL_QUESTION,
          longContext: overallDiff.longContext,
        },
        { tag: JEV_TAG },
      );

      const visual = await judgeScreenshots(
        ctx,
        args.messageId,
        prompt,
        selectFlagged(judged),
      );

      const scopeCheck = summariseScopeCheck({
        unrequestedProbability: readBoolean(overall, "unrequested"),
        judged,
        mentioned,
        visible: visual.visible,
        ...(visual.screenshots === undefined
          ? {}
          : { screenshots: visual.screenshots }),
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
