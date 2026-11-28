import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import {
  automationRunStreamingEntityId,
  prRecapStreamingEntityId,
} from "../_chat/agentStreamIds";

/**
 * The rows a one-shot agent job works for. Each row holds the job's slot
 * (`activeWorkflowId`) and is the `entityId` of the job's durable turn.
 */
export const agentJobOwnerIdValidator = v.union(
  v.id("docs"),
  v.id("evaluationReports"),
  v.id("automationRuns"),
);

export type AgentJobOwnerId = Infer<typeof agentJobOwnerIdValidator>;

export type AgentJobOwner =
  | { kind: "doc"; id: Id<"docs"> }
  | { kind: "evaluation"; id: Id<"evaluationReports"> }
  | { kind: "automation"; id: Id<"automationRuns"> };

/** Tells which table a job owner id belongs to. Null for any other id. */
export function agentJobOwner(
  db: DatabaseReader,
  entityId: string,
): AgentJobOwner | null {
  const docId = db.normalizeId("docs", entityId);
  if (docId) return { kind: "doc", id: docId };
  const reportId = db.normalizeId("evaluationReports", entityId);
  if (reportId) return { kind: "evaluation", id: reportId };
  const runId = db.normalizeId("automationRuns", entityId);
  if (runId) return { kind: "automation", id: runId };
  return null;
}

/**
 * Every streaming row a job of this owner can write before its turn exists
 * (sandbox prepare progress). Teardown clears them all, so a job stopped
 * before launch leaves no progress row behind. A doc job streams under the
 * bare id, except the PR recap, which streams under its prefix.
 */
export function agentJobStreamingEntityIds(owner: AgentJobOwner): string[] {
  switch (owner.kind) {
    case "doc":
      return [String(owner.id), prRecapStreamingEntityId(owner.id)];
    case "evaluation":
      return [String(owner.id)];
    case "automation":
      return [automationRunStreamingEntityId(owner.id)];
  }
}
