"use node";

/**
 * Triages an automation run's findings with TypeSafe Jev: one severity score
 * and one duplicate check per finding, judged against the repo's open tasks.
 *
 * Background work scheduled by `updateRunStatus`. Every failure path leaves
 * the findings untriaged rather than failing the run — the UI falls back to
 * the agent's own severity and the raw order.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { readChoice, readScore } from "./_jev/answers";
import { evaluateDecision } from "./_jev/client";
import type { EvaluateInputRaw } from "./_jev/schema";
import {
  duplicateFromChoice,
  duplicateOptionKey,
  MAX_DUPLICATE_CANDIDATES,
  MAX_TRIAGED_FINDINGS,
  severityFromScore,
  SEVERITY_LEVELS,
  TRIAGE_BATCH_SIZE,
  type DuplicateCandidate,
} from "./_automations/triageMapping";
import type { Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { findingTriageValidator } from "./_validators/shapes";

/** Keeps the prompt small; a title past this is already unreadable in the UI. */
const MAX_TITLE_CHARS = 120;
/** Descriptions run long in audit findings; Jev needs the gist, not the essay. */
const MAX_DESCRIPTION_CHARS = 2000;

type Triage = Infer<typeof findingTriageValidator>;

const SEVERITY_INSTRUCTIONS =
  "How severe is this finding for people using the codebase? Judge impact, not confidence.";
const DUPLICATE_INSTRUCTIONS =
  "Is this finding already tracked by one of the listed open tasks? Pick the task only if it describes the same underlying problem.";

export const triageFindings = internalAction({
  args: { runId: v.id("automationRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.automations.getRunForTriage, {
      runId: args.runId,
    });
    if (!run) return null;

    const openTasks = await ctx.runQuery(
      internal.agentTasks.listOpenTaskTitles,
      { repoId: run.repoId },
    );
    const candidates: Array<DuplicateCandidate<Id<"agentTasks">>> = openTasks
      .filter((task) => task.numId !== undefined)
      .slice(0, MAX_DUPLICATE_CANDIDATES);

    const duplicateCriteria: Record<string, string> = {
      none: "not already tracked by any listed task",
    };
    for (const task of candidates) {
      if (task.numId === undefined) continue;
      duplicateCriteria[duplicateOptionKey(task.numId)] = task.title.slice(
        0,
        MAX_TITLE_CHARS,
      );
    }

    const findings = run.findings.slice(0, MAX_TRIAGED_FINDINGS);
    const verdicts: Array<{ id: string; triage: Triage }> = [];

    for (let start = 0; start < findings.length; start += TRIAGE_BATCH_SIZE) {
      const batch = findings.slice(start, start + TRIAGE_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (finding) => {
          const input: EvaluateInputRaw = {
            // JSON-compatible only: no `undefined` anywhere inside `state`.
            state: {
              title: finding.title.slice(0, MAX_TITLE_CHARS),
              description: finding.description.slice(0, MAX_DESCRIPTION_CHARS),
              filePaths: finding.filePaths ?? [],
              suggestedFix: finding.suggestedFix ?? "",
              agentSeverity: finding.severity,
            },
            questions: {
              severity: {
                type: "score",
                instructions: SEVERITY_INSTRUCTIONS,
                criteria: [...SEVERITY_LEVELS],
              },
              duplicate: {
                type: "choice",
                instructions: DUPLICATE_INSTRUCTIONS,
                criteria: duplicateCriteria,
              },
            },
          };
          const outcome = await evaluateDecision(input, {
            tag: "eva-findings-triage",
          });
          if (!outcome.ok) {
            console.error(
              "[automationTriage.triageFindings]",
              finding.id,
              outcome.errorCode,
              outcome.error,
            );
            return null;
          }
          const score = readScore(outcome, "severity");
          if (score === null) return null;
          const choice = readChoice(outcome, "duplicate");
          const duplicate = choice
            ? duplicateFromChoice(
                choice.choice,
                choice.probabilities,
                candidates,
              )
            : { duplicateProbability: 0 };
          const triage: Triage = {
            severity: severityFromScore(score.score),
            ...duplicate,
            evaluatedAt: Date.now(),
          };
          return { id: finding.id, triage };
        }),
      );
      for (const result of results) {
        if (result !== null) verdicts.push(result);
      }
    }

    if (verdicts.length > 0) {
      await ctx.runMutation(internal.automations.setFindingsTriage, {
        runId: args.runId,
        triage: verdicts,
      });
    }
    return null;
  },
});
