import { v } from "convex/values";
import { taskStatusValidator } from "./enums";
import { prStateValidator } from "./tableFields";

/**
 * `ProjectTaskFacts` (`@eva/shared/projectStatus`) as a return value: what
 * clients pass to the shared rules (`projectStatus`, `projectTaskNeedsYou`).
 */
export const projectTaskFactsValidator = v.object({
  id: v.string(),
  taskNumber: v.optional(v.number()),
  status: taskStatusValidator,
  prState: v.optional(prStateValidator),
  approved: v.boolean(),
  withCoordinator: v.optional(v.boolean()),
  halted: v.optional(v.union(v.literal("failed"), v.literal("cancelled"))),
  usageLimited: v.boolean(),
  runPending: v.boolean(),
  coordinatorRetries: v.optional(v.number()),
  openAsk: v.optional(v.union(v.literal("coordinator"), v.literal("person"))),
});

const needsYouValidator = v.union(
  v.literal("usage_limit"),
  v.literal("failed"),
  v.literal("stopped"),
  v.literal("pr_closed"),
  v.literal("approve"),
  v.literal("review"),
  v.literal("question"),
);

/**
 * One task row. A task in a repo the reader cannot open is `locked`: only
 * its id, so derived counts still include it.
 */
export const projectTaskRowValidator = v.union(
  v.object({ locked: v.literal(true), taskId: v.id("agentTasks") }),
  v.object({
    locked: v.literal(false),
    taskId: v.id("agentTasks"),
    taskNumber: v.optional(v.number()),
    title: v.string(),
    status: taskStatusValidator,
    stage: v.union(
      v.literal("launched"),
      v.literal("in_review"),
      v.literal("in_progress"),
      v.literal("todo"),
      v.literal("cancelled"),
    ),
    approved: v.boolean(),
    phaseLabel: v.optional(v.string()),
    repoId: v.optional(v.id("githubRepos")),
    repo: v.optional(v.string()),
    prState: v.optional(prStateValidator),
    prUrl: v.optional(v.string()),
    needsYou: v.optional(needsYouValidator),
    waitingForCoordinator: v.boolean(),
    openAsk: v.optional(v.string()),
    newReports: v.array(v.string()),
    coordinatorRetries: v.number(),
  }),
);

