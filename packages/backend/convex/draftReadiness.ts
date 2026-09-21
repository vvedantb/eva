"use node";

import { ActionCache } from "@convex-dev/action-cache";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { readBoolean, readScore } from "./_jev/answers";
import { evaluateDecision } from "./_jev/client";
import {
  missingSignals,
  readinessScore,
  READINESS_LEVELS,
  READINESS_SIGNAL_QUESTIONS,
} from "./_agentTasks/readiness";

/** Titles are a line; descriptions are a paragraph. Judge the head of each. */
const MAX_TITLE_CHARS = 300;
const MAX_DESCRIPTION_CHARS = 4000;

/** The same draft is re-judged on every pause in typing; an hour of reuse is plenty. */
const READINESS_CACHE_TTL_MS = 60 * 60 * 1000;

const readinessResult = v.object({
  /** 0 (too vague to start) to 1 (fully specified). */
  score: v.number(),
  missing: v.array(
    v.union(v.literal("target"), v.literal("expected"), v.literal("current")),
  ),
});

/**
 * Uncached readiness judgement — wrapped by the ActionCache below. Auth is
 * enforced by the public `assess` wrapper before `fetch`.
 *
 * One score for the overall verdict plus one boolean per signal, rather than a
 * prose prompt: the boolean probabilities let the "what is missing" threshold
 * live in code instead of being trusted to the model.
 *
 * Any failure returns a perfect score, so the banner stays hidden. A nudge is
 * a nicety; a nudge that fires because the gateway is down is a bug.
 */
export const assessInternal = internalAction({
  args: { title: v.string(), description: v.string() },
  returns: readinessResult,
  handler: async (_ctx, args) => {
    const outcome = await evaluateDecision(
      {
        state: { title: args.title, description: args.description },
        questions: {
          target: {
            type: "boolean",
            instructions: READINESS_SIGNAL_QUESTIONS.target,
          },
          expected: {
            type: "boolean",
            instructions: READINESS_SIGNAL_QUESTIONS.expected,
          },
          current: {
            type: "boolean",
            instructions: READINESS_SIGNAL_QUESTIONS.current,
          },
          readiness: {
            type: "score",
            instructions:
              "How ready is this task description for a coding agent to start work on without asking questions?",
            criteria: [...READINESS_LEVELS],
          },
        },
      },
      { tag: "eva-draft-readiness" },
    );

    if (!outcome.ok) {
      console.error("[draftReadiness]", outcome.errorCode, outcome.error);
      return { score: 1, missing: [] };
    }

    return {
      score: readinessScore(
        readScore(outcome, "readiness")?.score ?? READINESS_LEVELS.length - 1,
      ),
      missing: missingSignals({
        target: readBoolean(outcome, "target"),
        expected: readBoolean(outcome, "expected"),
        current: readBoolean(outcome, "current"),
      }),
    };
  },
});

const readinessCache = new ActionCache(components.actionCache, {
  action: internal.draftReadiness.assessInternal,
  name: "draftReadinessV1",
  ttl: READINESS_CACHE_TTL_MS,
});

/**
 * Judges how ready a quick-task draft is for an agent to pick up. Called from
 * the modal once typing goes idle; throttling is that debounce plus this cache.
 */
export const assess = action({
  args: { title: v.string(), description: v.string() },
  returns: readinessResult,
  handler: async (
    ctx,
    args,
  ): Promise<{
    score: number;
    missing: Array<"target" | "expected" | "current">;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return await readinessCache.fetch(ctx, {
      title: args.title.slice(0, MAX_TITLE_CHARS),
      description: args.description.slice(0, MAX_DESCRIPTION_CHARS),
    });
  },
});
