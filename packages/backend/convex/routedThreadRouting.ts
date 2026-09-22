"use node";

/**
 * Picks who a routed question goes to, then hands it to `askFromAgent`.
 *
 * A routed thread is a group thread, so the interesting decision is no longer
 * "which one person" but "which few people" — and the agent asking usually
 * does not know the team well enough to say. This action asks Jev one yes/no
 * question per teammate and keeps the ones above the bar.
 *
 * Failure is not fatal and never silent: if the gateway is down, or Jev picks
 * nobody, the deterministic keyword overlap that routing used before Jev
 * chooses instead, and only if that finds nothing does the agent get the
 * candidate list back to choose from itself.
 *
 * Its own top-level module because `"use node"` cannot be mixed into the
 * isolate bundle `routedThreads.ts` and `_routedThreads/*` are part of.
 * Imports stay confined to the SDK, `_generated`, and the pure leaf below;
 * reaching into `routedThreads.ts`, `functions.ts` or `mcp/*` would put a
 * `"use node"` chunk in an import cycle, which breaks the Convex prod push.
 */

import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { readBoolean } from "./_jev/answers";
import { evaluateDecision } from "./_jev/client";
import {
  candidateInstructions,
  candidateQuestionId,
  MAX_JUDGED_CANDIDATES,
  selectByOverlap,
  selectByProbability,
  type CandidateProfile,
} from "./_routedThreads/participantPicking";
import { roleUserValidator, routedSourceKindValidator } from "./validators";

/** Gateway usage tag, so the spend is attributable to this feature. */
const PICKING_TAG = "eva-routed-participants";

/** Mirrors `routedThreads.askFromAgent`; this action returns its result as-is. */
const askRoutedResult = v.union(
  v.object({
    ok: v.literal(true),
    threadId: v.id("routedThreads"),
    created: v.boolean(),
    participants: v.array(
      v.object({ userId: v.id("users"), name: v.string() }),
    ),
  }),
  v.object({
    ok: v.literal(false),
    error: v.string(),
    candidates: v.optional(
      v.array(
        v.object({
          userId: v.id("users"),
          name: v.string(),
          role: v.union(v.string(), v.null()),
        }),
      ),
    ),
  }),
);

type AskRoutedResult = Infer<typeof askRoutedResult>;

export const askRouted = internalAction({
  args: {
    userId: v.string(),
    sourceKind: routedSourceKindValidator,
    sourceId: v.string(),
    question: v.string(),
    context: v.string(),
    topicKey: v.string(),
    role: v.optional(roleUserValidator),
    assigneeUserIds: v.optional(v.array(v.string())),
  },
  returns: askRoutedResult,
  handler: async (ctx, args): Promise<AskRoutedResult> => {
    const ask = (assigneeUserIds: string[]): Promise<AskRoutedResult> =>
      ctx.runMutation(internal.routedThreads.askFromAgent, {
        userId: args.userId,
        sourceKind: args.sourceKind,
        sourceId: args.sourceId,
        question: args.question,
        context: args.context,
        topicKey: args.topicKey,
        role: args.role,
        assigneeUserIds,
      });

    // The agent already named people — it knows something we do not, so no
    // judgement is worth spending here.
    const named = args.assigneeUserIds ?? [];
    if (named.length > 0) return await ask(named);

    const directory = await ctx.runQuery(
      internal.routedThreads.candidatesFor,
      {
        userId: args.userId,
        sourceKind: args.sourceKind,
        sourceId: args.sourceId,
        role: args.role,
      },
    );
    if (!directory.ok) return directory;

    const candidates = directory.candidates;
    if (candidates.length === 0) {
      return {
        ok: false,
        error: "No teammates to ask on this team. Ask in the session chat instead.",
      };
    }
    // Nothing to decide, so do not pay Jev to decide it.
    if (candidates.length === 1) return await ask([candidates[0].userId]);

    const judged = candidates.slice(0, MAX_JUDGED_CANDIDATES);
    const questions: Record<
      string,
      { type: "boolean"; instructions: string }
    > = {};
    judged.forEach((candidate, index) => {
      const profile: CandidateProfile = {
        name: candidate.name,
        role: candidate.role,
        headline: candidate.headline,
        owns: candidate.owns,
        askMeAbout: candidate.askMeAbout,
      };
      questions[candidateQuestionId(index)] = {
        type: "boolean",
        instructions: candidateInstructions(profile),
      };
    });

    // One call for the whole shortlist: the questions share the same state, and
    // a per-person call would multiply latency on the agent's critical path.
    const outcome = await evaluateDecision(
      {
        state: { question: args.question, context: args.context },
        questions,
      },
      { tag: PICKING_TAG },
    );

    let picked = selectByProbability(
      judged.map((_, index) => readBoolean(outcome, candidateQuestionId(index))),
    );
    if (picked.length === 0) {
      console.error(
        "[routedThreadRouting.askRouted] participants unavailable",
        outcome.ok ? "no candidate above threshold" : outcome.errorCode,
        outcome.ok ? "" : outcome.error,
      );
      // Same shortlist, so an index still names the same person.
      picked = selectByOverlap(args.question, judged);
    }
    if (picked.length === 0) {
      return {
        ok: false,
        error:
          "Could not work out who should answer this. Pass userIds to choose.",
        candidates: candidates.map((candidate) => ({
          userId: candidate.userId,
          name: candidate.name,
          role: candidate.role,
        })),
      };
    }

    return await ask(picked.map((index) => judged[index].userId));
  },
});
