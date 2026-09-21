import { v } from "convex/values";
import {
  accentColorValidator,
  auditSeverityValidator,
  findingSeverityValidator,
  fontFamilyValidator,
  letterSpacingValidator,
  logLevelValidator,
  radiusValidator,
  roleValidator,
} from "./enums";

/** Git HEAD of one checked-out repo, keyed by its sandbox path. */
export const repoShaValidator = v.object({
  path: v.string(),
  sha: v.string(),
});

/**
 * Turn checkpoint shas the sandbox callback stamps on every completion it posts
 * (`callback-src/runtime/turnCheckpoint.ts`), whatever the surface. Every
 * completion receiver must spread these into its args: a closed validator
 * rejects the whole call with ArgumentValidationError, the reply is lost and
 * the turn hangs on "Working…". Only sessions persist them
 * (`messageFields.beforeSha`); other surfaces accept and ignore them.
 */
export const turnCheckpointArgs = {
  beforeSha: v.optional(v.string()),
  afterSha: v.optional(v.string()),
  /**
   * Multi-repo turn checkpoints (see `messageFields.beforeShas`): one entry
   * per checked-out repo. Every completion receiver accepts these so the
   * sandbox callback's argument shape stays uniform across surfaces; only
   * sessions persist them.
   */
  beforeShas: v.optional(v.array(repoShaValidator)),
  afterShas: v.optional(v.array(repoShaValidator)),
};

export const workflowCompleteValidator = v.object({
  success: v.boolean(),
  result: v.union(v.string(), v.null()),
  error: v.union(v.string(), v.null()),
  activityLog: v.union(v.string(), v.null()),
  pendingQuestion: v.optional(v.string()),
  ...turnCheckpointArgs,
});

export const evalResultValidator = v.object({
  requirement: v.string(),
  passed: v.boolean(),
  detail: v.string(),
  severity: v.optional(auditSeverityValidator),
});

/**
 * A single issue flagged by a testing-arena run. Unlike evalResultValidator this
 * is not tied to a fixed requirement list: the agent returns however many issues
 * it finds, ranked by severity. `taskId` marks an issue already converted to a task.
 */
export const evalIssueValidator = v.object({
  id: v.string(),
  title: v.string(),
  description: v.string(),
  severity: auditSeverityValidator,
  filePaths: v.optional(v.array(v.string())),
  suggestedFix: v.optional(v.string()),
  taskId: v.optional(v.id("agentTasks")),
});

export const userFlowValidator = v.object({
  name: v.string(),
  steps: v.array(v.string()),
});

export const variationValidator = v.object({
  label: v.string(),
  route: v.optional(v.string()),
  filePath: v.optional(v.string()),
});

export const customThemeValidator = v.object({
  accentColor: v.optional(accentColorValidator),
  radius: v.optional(radiusValidator),
  fontFamily: v.optional(fontFamilyValidator),
  letterSpacing: v.optional(letterSpacingValidator),
});

export const logEntryValidator = v.object({
  timestamp: v.number(),
  level: logLevelValidator,
  message: v.string(),
});

export const terminalPaneValidator = v.object({
  id: v.string(),
  title: v.string(),
  createdAt: v.number(),
});

export const conversationMessageValidator = v.object({
  role: roleValidator,
  content: v.string(),
  activityLog: v.optional(v.string()),
  userId: v.optional(v.id("users")),
  // Set when the assistant placeholder is inserted; cleared at completion.
  // Used by the project interview UI to show a live timer on the activity
  // accordion (matching tasks/sessions chat behaviour).
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
});

/**
 * Jev's verdict on one automation finding: the severity it judged (which may
 * disagree with the agent's own `severity`) and the open task it looks like a
 * duplicate of, if any. `duplicateProbability` is 0 when Jev picked "none", so
 * the UI thresholds one number instead of branching on absence.
 */
export const findingTriageValidator = v.object({
  severity: findingSeverityValidator,
  duplicateOfTaskId: v.optional(v.id("agentTasks")),
  duplicateOfNumId: v.optional(v.number()),
  duplicateProbability: v.number(),
  evaluatedAt: v.number(),
});

export const automationFindingValidator = v.object({
  id: v.string(),
  title: v.string(),
  description: v.string(),
  severity: findingSeverityValidator,
  filePaths: v.optional(v.array(v.string())),
  suggestedFix: v.optional(v.string()),
  taskId: v.optional(v.id("agentTasks")),
  triage: v.optional(findingTriageValidator),
});

// Task-count breakdown for a project, used by both the single-project
// (getTaskProgress) and batched (listTaskProgress) queries. Defined once so the
// two return shapes never drift apart.
export const taskProgressFields = {
  total: v.number(),
  todo: v.number(),
  in_progress: v.number(),
  code_review: v.number(),
  business_review: v.number(),
  done: v.number(),
  cancelled: v.number(),
};

export const taskProgressValidator = v.object(taskProgressFields);

/** Known per-user experimental opt-in keys (settings → Experimental). */
export const experimentalFlagKeyValidator = v.union(
  v.literal("sessionTabs"),
  v.literal("blurPid"),
  v.literal("voiceDictation"),
  v.literal("composerAutocomplete"),
  v.literal("simpleView"),
  v.literal("replyChime"),
  v.literal("disablePageMotion"),
);

/** Stored shape on `users.experimentalFlags` — missing key means off. */
export const experimentalFlagsFields = {
  sessionTabs: v.optional(v.boolean()),
  blurPid: v.optional(v.boolean()),
  voiceDictation: v.optional(v.boolean()),
  composerAutocomplete: v.optional(v.boolean()),
  simpleView: v.optional(v.boolean()),
  replyChime: v.optional(v.boolean()),
  disablePageMotion: v.optional(v.boolean()),
};

export const experimentalFlagsValidator = v.object(experimentalFlagsFields);

/** Fully resolved flags for clients (every key present, default false). */
export const resolvedExperimentalFlagsValidator = v.object({
  sessionTabs: v.boolean(),
  blurPid: v.boolean(),
  voiceDictation: v.boolean(),
  composerAutocomplete: v.boolean(),
  simpleView: v.boolean(),
  replyChime: v.boolean(),
  disablePageMotion: v.boolean(),
});

/**
 * One plan usage window (Claude: 5-hour, weekly, per-model). `key` is the SDK's
 * rate-limit type, or `model_scoped:<display name>` for a per-model bucket.
 * `utilization` is a percentage 0-100 and `resetsAt` is epoch ms; either can be
 * absent when the provider reported only the other.
 */
export const usageLimitWindowValidator = v.object({
  key: v.string(),
  label: v.string(),
  utilization: v.optional(v.number()),
  resetsAt: v.optional(v.number()),
});
