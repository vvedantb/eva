import { v, type Infer } from "convex/values";
import {
  accentColorValidator,
  auditSeverityValidator,
  findingSeverityValidator,
  fontFamilyValidator,
  interactionModeValidator,
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
 * the turn hangs on "Working…". Session, quick-task and project chat persist
 * them (`messageFields.beforeSha`); other surfaces accept and ignore them, and
 * the callback's own allow-list stops it stamping those in the first place.
 */
export const turnCheckpointArgs = {
  beforeSha: v.optional(v.string()),
  afterSha: v.optional(v.string()),
  beforeShas: v.optional(v.array(repoShaValidator)),
  afterShas: v.optional(v.array(repoShaValidator)),
};

/**
 * The durable-turn lease a daemon presents with every completion it posts
 * while it holds one. Every chat completion receiver accepts these, or a
 * fenced completion fails validation and the reply is lost.
 */
export const turnLeaseFenceArgs = {
  turnId: v.optional(v.string()),
  leaseGeneration: v.optional(v.number()),
};

/** Args every sandbox completion callback posts to a `handleCompletion` receiver. */
export const completionCallbackArgs = {
  success: v.boolean(),
  result: v.union(v.string(), v.null()),
  error: v.union(v.string(), v.null()),
  activityLog: v.union(v.string(), v.null()),
  rawResultEvent: v.optional(v.string()),
  ...turnCheckpointArgs,
};

const daemonClaimDrainFields = {
  attachmentUrls: v.array(v.string()),
  stopTaskToolUseIds: v.array(v.string()),
  cancelRequested: v.boolean(),
  usageRefreshRequested: v.boolean(),
  interactionMode: v.optional(interactionModeValidator),
  steers: v.optional(v.array(v.object({ id: v.string(), text: v.string() }))),
};

/**
 * What a chat daemon's `claimPendingTurn` returns on every surface: an empty
 * claim (drains only, no prompt) or a durable claim that carries the lease.
 * The empty claim keeps the `legacy` tag so every daemon bundle parses it.
 */
export const daemonClaimResultValidator = v.union(
  v.object({
    prompt: v.null(),
    turnLifecycle: v.literal("legacy"),
    ...daemonClaimDrainFields,
  }),
  v.object({
    prompt: v.string(),
    turnLifecycle: v.literal("durable"),
    turnId: v.id("turns"),
    leaseGeneration: v.number(),
    ...daemonClaimDrainFields,
  }),
);

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

/**
 * One browser scenario's outcome in a testing-arena browser run. Title is
 * copied in so the run stays readable after the scenario is edited or deleted.
 */
export const arenaScenarioResultValidator = v.object({
  scenarioId: v.id("arenaScenarios"),
  title: v.string(),
  passed: v.boolean(),
  notes: v.string(),
  screenshotStorageId: v.optional(v.id("_storage")),
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

/**
 * Sticky Preview path of one extra (non-main) preview pane. The main pane
 * keeps the owner's `previewPath`, which the agent's set_preview_path writes.
 */
export const previewPanePathValidator = v.object({
  paneId: v.string(),
  path: v.string(),
});

export const conversationMessageValidator = v.object({
  role: roleValidator,
  content: v.string(),
  activityLog: v.optional(v.string()),
  userId: v.optional(v.id("users")),
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

/** What a reader sees change; mirrors `_scopeCheck/describe.ts`. */
export const changeKindValidator = v.union(
  v.literal("icon"),
  v.literal("colour"),
  v.literal("wording"),
  v.literal("layout"),
  v.literal("motion"),
  v.literal("new_element"),
  v.literal("behaviour"),
  v.literal("content"),
  v.literal("internal"),
);

/**
 * One diff hunk Jev judged the prompt did not ask for.
 *
 * Everything past `necessary` is optional: rows written before the plain-English
 * pass, and hunks whose extra Jev calls failed, still render from the file and
 * header alone.
 */
export const scopeCheckHunkValidator = v.object({
  file: v.string(),
  header: v.string(),
  requested: v.number(),
  necessary: v.number(),
  kind: v.optional(changeKindValidator),
  summary: v.optional(v.string()),
  surface: v.optional(v.string()),
  mentioned: v.optional(v.number()),
  visible: v.optional(v.number()),
});

/**
 * Jev's scope verdict on one assistant turn: did the diff between the turn's
 * `beforeSha` and `afterSha` contain changes the user's prompt did not ask for?
 * Written out of band after the turn completes (`scopeCheck.ts`); absent when
 * the turn changed no code, the diff never became fetchable, or Jev failed.
 */
export const scopeCheckValidator = v.object({
  unrequestedProbability: v.number(),
  totalHunks: v.number(),
  judgedHunks: v.number(),
  flagged: v.array(scopeCheckHunkValidator),
  partial: v.boolean(),
  evaluatedAt: v.number(),
  screenshots: v.optional(
    v.object({
      checked: v.number(),
      showsRequest: v.optional(v.number()),
    }),
  ),
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
  v.literal("composerPredictions"),
  v.literal("simpleView"),
  v.literal("replyChime"),
  v.literal("notificationBell"),
  v.literal("disablePageMotion"),
  v.literal("viewVercelDeployment"),
  v.literal("disableAutoArchive"),
  v.literal("askTeammates"),
  v.literal("claudeStyleActivity"),
  v.literal("openPrsOnGithub"),
  v.literal("scopeCheck"),
  v.literal("manualSideBranchPublish"),
  v.literal("prWatch"),
  v.literal("draftReadiness"),
  v.literal("skillSuggestions"),
  v.literal("workspaceTabs"),
  v.literal("viewPrsChip"),
);

/**
 * Work in the sandbox checkout that is not on GitHub yet, reported live with
 * `sandboxBranch` (see callback-src/runtime/branchWatcher.ts). Counts use the
 * same media exclusions as the turn-end commit, so they match what a
 * "Commit & push" would publish.
 */
export const sandboxGitSyncValidator = v.object({
  uncommittedFiles: v.number(),
  unpushedCommits: v.number(),
});

/** Stored shape on `users.experimentalFlags` — missing key means off. */
export const experimentalFlagsFields = {
  sessionTabs: v.optional(v.boolean()),
  blurPid: v.optional(v.boolean()),
  voiceDictation: v.optional(v.boolean()),
  composerAutocomplete: v.optional(v.boolean()),
  composerPredictions: v.optional(v.boolean()),
  simpleView: v.optional(v.boolean()),
  replyChime: v.optional(v.boolean()),
  notificationBell: v.optional(v.boolean()),
  disablePageMotion: v.optional(v.boolean()),
  viewVercelDeployment: v.optional(v.boolean()),
  disableAutoArchive: v.optional(v.boolean()),
  askTeammates: v.optional(v.boolean()),
  claudeStyleActivity: v.optional(v.boolean()),
  openPrsOnGithub: v.optional(v.boolean()),
  scopeCheck: v.optional(v.boolean()),
  manualSideBranchPublish: v.optional(v.boolean()),
  prWatch: v.optional(v.boolean()),
  draftReadiness: v.optional(v.boolean()),
  skillSuggestions: v.optional(v.boolean()),
  workspaceTabs: v.optional(v.boolean()),
  viewPrsChip: v.optional(v.boolean()),
};

export const experimentalFlagsValidator = v.object(experimentalFlagsFields);

/** Fully resolved flags for clients (every key present, default false). */
export const resolvedExperimentalFlagsValidator = v.object({
  sessionTabs: v.boolean(),
  blurPid: v.boolean(),
  voiceDictation: v.boolean(),
  composerAutocomplete: v.boolean(),
  composerPredictions: v.boolean(),
  simpleView: v.boolean(),
  replyChime: v.boolean(),
  notificationBell: v.boolean(),
  disablePageMotion: v.boolean(),
  viewVercelDeployment: v.boolean(),
  disableAutoArchive: v.boolean(),
  askTeammates: v.boolean(),
  claudeStyleActivity: v.boolean(),
  openPrsOnGithub: v.boolean(),
  scopeCheck: v.boolean(),
  manualSideBranchPublish: v.boolean(),
  prWatch: v.boolean(),
  draftReadiness: v.boolean(),
  skillSuggestions: v.boolean(),
  workspaceTabs: v.boolean(),
  viewPrsChip: v.boolean(),
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

/** One stored env var on a repo or team env var document. */
export const envVarEntryValidator = v.object({
  key: v.string(),
  value: v.string(),
  sandboxExclude: v.optional(v.boolean()),
  seedOnly: v.optional(v.boolean()),
});

/** An env var entry as listed to the client: value masked, flag resolved. */
export const maskedEnvVarEntryValidator = v.object({
  key: v.string(),
  value: v.string(),
  sandboxExclude: v.boolean(),
  seedOnly: v.boolean(),
});

/** One chat surface, keyed by its kind and the id of its owning row. */
export const chatRefValidator = v.union(
  v.object({ kind: v.literal("session"), sessionId: v.id("sessions") }),
  v.object({ kind: v.literal("task"), taskId: v.id("agentTasks") }),
  v.object({ kind: v.literal("project"), projectId: v.id("projects") }),
);
export type ChatRef = Infer<typeof chatRefValidator>;
