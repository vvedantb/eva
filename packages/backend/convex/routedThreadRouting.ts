"use node";

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

const PICKING_TAG = "eva-routed-participants";

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
