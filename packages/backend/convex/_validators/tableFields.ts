import { v } from "convex/values";
import {
  aiModelValidator,
  aiProviderValidator,
  modelTraitsExecutionFields,
  reasoningLevelValidator,
} from "./aiModels";
import {
  backgroundProcessStatusValidator,
  deploymentStatusValidator,
  docKindValidator,
  chatLogEntryKindValidator,
  chatLogAuthorValidator,
  feedbackAuthorValidator,
  feedbackSentimentValidator,
  docVersionSourceValidator,
  errorTypeValidator,
  evaluationStatusValidator,
  evalFixStatusValidator,
  notificationTypeValidator,
  notificationUrgencyValidator,
  evaluationKindValidator,
  evaluationTriggerValidator,
  prRecapOriginValidator,
  prRecapStatusValidator,
  priorityValidator,
  reactionTargetValidator,
  roleUserValidator,
  roleValidator,
  routedAuthorKindValidator,
  routedSourceKindValidator,
  routedThreadStatusValidator,
  runModeValidator,
  runStatusValidator,
  sessionStatusValidator,
  interactionModeValidator,
  snapshotBuildKindValidator,
  snapshotBuildStatusValidator,
  snapshotBuildTriggerValidator,
  snapshotScheduleValidator,
  taskActivityFieldValidator,
  taskOriginValidator,
  taskSandboxEventValidator,
  taskStatusValidator,
  teamMemberRoleValidator,
  themeValidator,
  usageLimitCompletenessValidator,
  usageLimitProviderValidator,
  usageLimitStatusValidator,
  chatEntityKindValidator,
} from "./enums";
import {
  automationFindingValidator,
  customThemeValidator,
  envVarEntryValidator,
  evalIssueValidator,
  arenaScenarioResultValidator,
  experimentalFlagsValidator,
  logEntryValidator,
  repoShaValidator,
  sandboxGitSyncValidator,
  scopeCheckValidator,
  terminalPaneValidator,
  previewPanePathValidator,
  usageLimitWindowValidator,
  userFlowValidator,
  variationValidator,
} from "./shapes";
import { shortcutOverridesValidator } from "./shortcuts";
import { recapWalkthroughStepValidator } from "../_prRecapWorkflow/walkthrough";
import { sessionOwnerValidator } from "../_sessions/owner";

export const userFields = {
  clerkId: v.optional(v.string()),
  email: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  fullName: v.optional(v.string()),
  isAdmin: v.optional(v.boolean()),
  role: v.optional(roleUserValidator),
  theme: v.optional(themeValidator),
  customTheme: v.optional(customThemeValidator),
  toolbarVisible: v.optional(v.boolean()),
  customInstructions: v.optional(v.string()),
  lastSeenAt: v.optional(v.number()),
  lastSeenPath: v.optional(v.string()),
  lastChangelogDismissedAt: v.optional(v.number()),
  onboardingCompletedAt: v.optional(v.number()),
  emailNotificationsEnabled: v.optional(v.boolean()),
  experimentalFlags: v.optional(experimentalFlagsValidator),
  shortcutOverrides: v.optional(shortcutOverridesValidator),
  orchestratorSessionId: v.optional(v.id("sessions")),
  grokBotWebhookUrl: v.optional(v.string()),
  grokBotWebhookKey: v.optional(v.string()),
};

/** Heartbeat/path writes. Isolated so they do not invalidate `users` subscribers. */
export const userPresenceFields = {
  userId: v.id("users"),
  lastSeenAt: v.optional(v.number()),
  lastSeenPath: v.optional(v.string()),
};

export const userProviderAccountFields = {
  userId: v.id("users"),
  provider: aiProviderValidator,
  label: v.string(),
  credentials: v.array(v.object({ key: v.string(), value: v.string() })),
  shared: v.optional(v.boolean()),
  lastUsedAt: v.optional(v.number()),
  lastUsedByUserId: v.optional(v.id("users")),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const githubUserTokenFields = {
  userId: v.id("users"),
  accessToken: v.string(),
  accessTokenExpiresAt: v.number(),
  refreshToken: v.optional(v.string()),
  refreshTokenExpiresAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const githubOauthStateFields = {
  nonce: v.string(),
  userId: v.id("users"),
  installationId: v.optional(v.number()),
  expiresAt: v.number(),
};

export const connectorProviderValidator = v.union(
  v.literal("linear"),
  v.literal("figma"),
);

export const connectorActorValidator = v.union(
  v.literal("user"),
  v.literal("app"),
);

/**
 * A user's (or team-shared) OAuth connection to Linear or Figma. Tokens are
 * ciphertext (`encryption.ts`); plaintext exists only inside a node action.
 * Env-var API keys are not stored here — those stay on team/repo env vars and
 * are the fallback when no row exists.
 */
export const connectedAccountFields = {
  userId: v.id("users"),
  provider: connectorProviderValidator,
  actor: connectorActorValidator,
  workspaceId: v.optional(v.string()),
  workspaceName: v.optional(v.string()),
  accountLabel: v.optional(v.string()),
  accessToken: v.string(),
  accessTokenExpiresAt: v.number(),
  refreshToken: v.optional(v.string()),
  refreshTokenExpiresAt: v.optional(v.number()),
  scopes: v.optional(v.string()),
  shared: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

/** CSRF nonce for Linear/Figma OAuth. Consumed on first use, like GitHub. */
export const connectorOauthStateFields = {
  nonce: v.string(),
  userId: v.id("users"),
  provider: connectorProviderValidator,
  actor: connectorActorValidator,
  returnPath: v.optional(v.string()),
  codeVerifier: v.optional(v.string()),
  expiresAt: v.number(),
};

export const repoEntityTypeValidator = v.union(
  v.literal("sessions"),
  v.literal("docs"),
  v.literal("projects"),
  v.literal("agentTasks"),
  v.literal("automations"),
);

export const repoEntityCounterFields = {
  repoId: v.id("githubRepos"),
  entityType: repoEntityTypeValidator,
  nextNumId: v.number(),
};

/** Per-repo sequential id for readable URLs. Optional until backfill completes. */
export const entityNumIdFields = {
  numId: v.optional(v.number()),
};

/** Soft delete, for the tables that still delete (tasks and projects archive: `archivedAt`). */
export const softDeleteFields = {
  deletedAt: v.optional(v.number()),
};

import type { Infer } from "convex/values";

export const backgroundAgentEntryFields = {
  toolUseId: v.string(),
  taskId: v.optional(v.string()),
  description: v.optional(v.string()),
  status: v.string(),
  backgrounded: v.optional(v.boolean()),
  startedAt: v.number(),
  settledAt: v.optional(v.number()),
};

export const backgroundAgentEntryValidator = v.object(
  backgroundAgentEntryFields,
);

export type BackgroundAgentEntry = Infer<typeof backgroundAgentEntryValidator>;

/**
 * Claude's native `/goal` for a chat, mirrored by the warm daemon (parsed in
 * `callback-src/parse/claudeGoal.ts`). Absent = no goal.
 */
export const agentGoalValidator = v.object({
  objective: v.string(),
  status: v.union(v.literal("active"), v.literal("complete")),
  checks: v.number(),
  lastCheck: v.optional(v.string()),
});

export type AgentGoal = Infer<typeof agentGoalValidator>;

export const turnStateValidator = v.union(
  v.literal("staged"),
  v.literal("launching"),
  v.literal("running"),
  v.literal("finalizing"),
  v.literal("done"),
  v.literal("error"),
  v.literal("cancelled"),
);

export type TurnState = Infer<typeof turnStateValidator>;

/**
 * What chat rows hang off: a session chat, or a session that predates chats.
 * Task and project parents were removed once their transcripts moved to
 * session chats (1b/2). schema-narrowing-ok: clearLegacyOwnerChatFields
 */
export const chatParentIdValidator = v.union(
  v.id("sessionChats"),
  v.id("sessions"),
);

export type ChatParentId = Infer<typeof chatParentIdValidator>;

/** Chat entities that own durable turns; the id's table picks the surface. */
export const chatTurnEntityIdValidator = chatParentIdValidator;

/**
 * A read marker's parent: a chat, or the task or project whose card shows
 * unread (`chatReads.markRead` stamps the owner too).
 */
export const chatReadParentIdValidator = v.union(
  v.id("sessionChats"),
  v.id("sessions"),
  v.id("agentTasks"),
  v.id("projects"),
);

// schema-narrowing-ok: clearLegacyOwnerChatFields
export const turnEntityIdValidator = v.union(
  v.id("sessionChats"),
  v.id("sessions"),
  // schema-narrowing-ok: migrateProjectInterviewState
  v.id("agentRuns"),
  v.id("automationRuns"),
  v.id("docs"),
  v.id("evaluationReports"),
);

// schema-narrowing-ok: retireSessionSummaries
export const turnLaneValidator = v.literal("interview");

export type TurnLane = Infer<typeof turnLaneValidator>;

/** Durable ownership record for one agent turn: a chat turn, a quick-task run or a one-shot agent. */
export const turnFields = {
  // schema-narrowing-ok: clearTurnSurface
  entityId: turnEntityIdValidator,
  lane: v.optional(turnLaneValidator),
  sessionId: v.optional(v.id("sessions")),
  streamingEntityId: v.string(),
  state: turnStateValidator,
  open: v.boolean(),
  turnStartedAt: v.number(),
  leaseExpiresAt: v.number(),
  leaseGeneration: v.number(),
  finishedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  workflowId: v.optional(v.string()),
  placeholderMessageId: v.optional(v.id("messages")),
  replyTo: v.optional(v.id("messages")),
  prompt: v.optional(v.string()),
  attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  model: aiModelValidator,
  sandboxId: v.optional(v.string()),
  repoId: v.id("githubRepos"),
  silentSince: v.optional(v.number()),
};

export const pendingTurnFields = {
  prompt: v.string(),
  requestedAt: v.number(),
  turnId: v.optional(v.id("turns")),
  attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  model: v.optional(aiModelValidator),
  interactionMode: v.optional(interactionModeValidator),
};

export const pendingTurnValidator = v.optional(v.object(pendingTurnFields));

/** Small daemon-poll row kept separate from heavyweight session documents. */
export const sessionDaemonStateFields = {
  sessionId: v.id("sessions"),
  repoId: v.id("githubRepos"),
  userId: v.id("users"),
  pendingTurn: pendingTurnValidator,
  pendingTaskStops: v.optional(v.array(v.string())),
  cancelRequestedAt: v.optional(v.number()),
  sandboxSetupPending: v.optional(v.boolean()),
  usageRefreshRequestedAt: v.optional(v.number()),
  claimPausedUntil: v.optional(v.number()),
};

// schema-narrowing-ok: clearLegacyOwnerChatFields

export const chatDaemonEntityFields = {
  pendingTurn: pendingTurnValidator,
  syntheticTurnMessageId: v.optional(v.id("messages")),
  backgroundAgents: v.optional(v.array(backgroundAgentEntryValidator)),
  goal: v.optional(agentGoalValidator),
  pendingTaskStops: v.optional(v.array(v.string())),
  cancelRequestedAt: v.optional(v.number()),
  steerRequestedAt: v.optional(v.number()),
  queueHeldAt: v.optional(v.number()),
  usageRefreshRequestedAt: v.optional(v.number()),
  claimPausedUntil: v.optional(v.number()),
  // schema-narrowing-ok: clearSessionPendingTurnClaimedAt
  // schema-narrowing-ok: clearTaskPendingTurnClaimedAt
  // schema-narrowing-ok: clearProjectPendingTurnClaimedAt
};

/** Lifecycle of a pull request Eva tracks, shared by every surface that owns one. */
export const prStateValidator = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("merged"),
  v.literal("closed"),
);

/**
 * Who a `pullRequests` row belongs to. A session's linked-repo PR carries the
 * `sessionRepos` row it came from; a task or project PR carries the run (and,
 * for a project, the task) that opened it. Several rows may share one owner.
 */
export const prOwnerValidator = v.union(
  v.object({
    kind: v.literal("session"),
    sessionId: v.id("sessions"),
    sessionRepoId: v.optional(v.id("sessionRepos")),
  }),
  v.object({
    kind: v.literal("task"),
    taskId: v.id("agentTasks"),
    runId: v.optional(v.id("agentRuns")),
  }),
  v.object({
    kind: v.literal("project"),
    projectId: v.id("projects"),
    taskId: v.optional(v.id("agentTasks")),
    runId: v.optional(v.id("agentRuns")),
  }),
);

/** A PR owner's identity alone, without the run / linked-repo detail. */
export const prOwnerRefValidator = v.union(
  v.object({ kind: v.literal("session"), sessionId: v.id("sessions") }),
  v.object({ kind: v.literal("task"), taskId: v.id("agentTasks") }),
  v.object({ kind: v.literal("project"), projectId: v.id("projects") }),
);

/** How a tracked PR came to be linked to its owner. */
export const prOriginValidator = v.union(
  v.literal("eva"),
  v.literal("agent"),
);

/**
 * The agent's watch on one PR (`watch_pull_request`). Woken from GitHub
 * webhooks, never polled; see `_pullRequests/watch.ts`. Only what the agent was
 * last told is kept, so the next check reports just what changed.
 */
export const prWatchValidator = v.object({
  startedAt: v.number(),
  sessionChatId: v.optional(v.id("sessionChats")),
  headSha: v.optional(v.string()),
  failedChecks: v.array(v.string()),
  passed: v.boolean(),
  conflicting: v.boolean(),
  remarksThrough: v.number(),
  commentWakes: v.number(),
  checkAt: v.optional(v.number()),
  unreadableSince: v.optional(v.number()),
});

/**
 * One pull request linked to a session, quick task or project. The single
 * source of truth for every PR Eva tracks: an owner may hold many. All writes
 * go through `_github/pullRequests.ts`, which also refreshes the owner's
 * `prUrl` / `prState` / `prCount` summary.
 */
export const pullRequestFields = {
  repoId: v.id("githubRepos"),
  prUrl: v.string(),
  prNumber: v.number(),
  headBranch: v.optional(v.string()),
  baseBranch: v.optional(v.string()),
  title: v.optional(v.string()),
  state: prStateValidator,
  stateOnArchive: v.optional(v.union(v.literal("draft"), v.literal("open"))),
  primary: v.boolean(),
  origin: prOriginValidator,
  owner: prOwnerValidator,
  watch: v.optional(prWatchValidator),
  createdAt: v.number(),
  updatedAt: v.number(),
};

const prSummaryFields = {
  prUrl: v.optional(v.string()),
  prState: v.optional(prStateValidator),
  prCount: v.optional(v.number()),
};

/**
 * One chat thread inside a session. The session owns the sandbox, branch,
 * PR and preview; the chat owns the transcript, the warm daemon, the open
 * turn and the model settings. Every session has a Main chat (number 1);
 * further chats run in parallel on the same checkout, each with its own
 * daemon and provider transcript (`sessionClaudeUuid(chat._id)`).
 */
export const sessionChatFields = {
  sessionId: v.id("sessions"),
  repoId: v.id("githubRepos"),
  userId: v.id("users"),
  title: v.string(),
  number: v.number(),
  isMain: v.boolean(),
  archived: v.optional(v.boolean()),
  createdBy: v.optional(v.id("users")),
  updatedAt: v.optional(v.number()),
  // schema-narrowing-ok: clearSessionWorkflowSlots
  lastTurnFinishedAt: v.optional(v.number()),
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  provider: v.optional(aiProviderValidator),
  lastModel: v.optional(aiModelValidator),
  lastReasoningLevel: v.optional(reasoningLevelValidator),
  lastThinkingEnabled: v.optional(v.boolean()),
  lastUse1mContext: v.optional(v.boolean()),
  lastFastMode: v.optional(v.boolean()),
  claudePersistenceSeed: v.optional(
    v.union(v.id("sessions"), v.id("agentTasks"), v.id("projects")),
  ),
  // schema-narrowing-ok: clearSessionChatTaskIds
  ...chatDaemonEntityFields,
};

/**
 * A task's own run: waiting on a scheduled job, or running a workflow.
 * Transitions live in `_agentTasks/runState.ts`.
 */
export const taskRunValidator = v.union(
  v.object({
    state: v.literal("scheduled"),
    at: v.number(),
    jobId: v.id("_scheduled_functions"),
  }),
  v.object({
    state: v.literal("retry_pending"),
    at: v.number(),
    jobId: v.id("_scheduled_functions"),
  }),
  v.object({
    state: v.literal("running"),
    workflowId: v.string(),
    runId: v.optional(v.id("agentRuns")),
  }),
);

export const agentTaskFields = {
  ...entityNumIdFields,
  // schema-narrowing-ok: archiveDeletedEntities
  archivedAt: v.optional(v.number()),
  title: v.string(),
  description: v.optional(v.string()),
  attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  repoId: v.optional(v.id("githubRepos")),
  linkedRepoIds: v.optional(v.array(v.id("githubRepos"))),
  projectId: v.optional(v.id("projects")),
  origin: v.optional(taskOriginValidator),
  tags: v.optional(v.array(v.string())),
  taskNumber: v.optional(v.number()),
  status: taskStatusValidator,
  priority: v.optional(priorityValidator),
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.id("users"),
  assignedTo: v.optional(v.id("users")),
  model: v.optional(aiModelValidator),
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  reasoningLevel: v.optional(reasoningLevelValidator),
  thinkingEnabled: v.optional(v.boolean()),
  use1mContext: v.optional(v.boolean()),
  fastMode: v.optional(v.boolean()),
  baseBranch: v.optional(v.string()),
  branchName: v.optional(v.string()),
  run: v.optional(taskRunValidator),
  // schema-narrowing-ok: migrateTaskRunState
  pendingChangeRequestCommentId: v.optional(v.id("taskComments")),
  lastTurnFinishedAt: v.optional(v.number()),
  watchedByOrchestrator: v.optional(v.id("sessions")),
  watchedByAve: v.optional(v.id("aveThreads")),
  approvedAt: v.optional(v.number()),
  handedToCoordinatorAt: v.optional(v.number()),
  mergedIntoTaskId: v.optional(v.id("agentTasks")),
  coordinatorRetries: v.optional(v.number()),
  phaseLabel: v.optional(v.string()),
  ...prSummaryFields,
};

export const agentRunFields = {
  taskId: v.id("agentTasks"),
  status: runStatusValidator,
  logs: v.array(logEntryValidator),
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
  finalizingAt: v.optional(v.number()),
  resultSummary: v.optional(v.string()),
  note: v.optional(v.string()),
  prUrl: v.optional(v.string()),
  error: v.optional(v.string()),
  prError: v.optional(v.string()),
  errorType: v.optional(errorTypeValidator),
  limitResetAt: v.optional(v.number()),
  exitReason: v.optional(v.string()),
  sandboxId: v.optional(v.string()),
  repoId: v.optional(v.id("githubRepos")),
  deploymentStatus: v.optional(deploymentStatusValidator),
  deploymentUrl: v.optional(v.string()),
  mode: v.optional(runModeValidator),
  triggeredBy: v.optional(v.id("users")),
  triggeringCommentId: v.optional(v.id("taskComments")),
  credentialSourceLabel: v.optional(v.string()),
  model: v.optional(aiModelValidator),
  mediaStorageIds: v.optional(v.array(v.id("_storage"))),
  sessionStartAttempt: v.optional(v.number()),
};

export const sessionFields = {
  ...entityNumIdFields,
  ...softDeleteFields,
  repoId: v.id("githubRepos"),
  userId: v.id("users"),
  title: v.string(),
  titleRegeneration: v.optional(v.object({ startedAt: v.number() })),
  branchName: v.optional(v.string()),
  baseBranch: v.optional(v.string()),
  stackOnPrNumber: v.optional(v.number()),
  prUrl: v.optional(v.string()),
  prState: v.optional(prStateValidator),
  prCount: v.optional(v.number()),
  prStateOnArchive: v.optional(v.union(v.literal("draft"), v.literal("open"))),
  sandboxId: v.optional(v.string()),
  sandboxError: v.optional(v.string()),
  ptySessionId: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
  status: sessionStatusValidator,
  sandboxStartAttempt: v.optional(v.number()),
  // schema-narrowing-ok: backfillSessionArchive
  archive: v.optional(
    v.object({
      archivedAt: v.number(),
      sandboxDeleteAfter: v.optional(v.number()),
    }),
  ),
  owner: sessionOwnerValidator,
  // schema-narrowing-ok: retireSessionSummaries
  createdBy: v.optional(v.id("users")),
  planContent: v.optional(v.string()),
  lastInteractionMode: v.optional(interactionModeValidator),
  // schema-narrowing-ok: clearSessionWorkflowSlots
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  provider: v.optional(aiProviderValidator),
  lastModel: v.optional(aiModelValidator),
  lastReasoningLevel: v.optional(reasoningLevelValidator),
  lastThinkingEnabled: v.optional(v.boolean()),
  lastUse1mContext: v.optional(v.boolean()),
  lastFastMode: v.optional(v.boolean()),
  previewPath: v.optional(v.string()),
  previewPanePaths: v.optional(v.array(previewPanePathValidator)),
  terminalHistoryTail: v.optional(v.string()),
  devPort: v.optional(v.number()),
  devCommand: v.optional(v.string()),
  terminalPanes: v.optional(v.array(terminalPaneValidator)),
  deploymentStatus: v.optional(deploymentStatusValidator),
  deploymentUrl: v.optional(v.string()),
  ...chatDaemonEntityFields,
  lastTurnFinishedAt: v.optional(v.number()),
  agentBrowsingAt: v.optional(v.number()),
  sandboxSetupPending: v.optional(v.boolean()),
  sandboxServicesPending: v.optional(v.boolean()),
  isOrchestrator: v.optional(v.boolean()),
  watchedByOrchestrator: v.optional(v.id("sessions")),
  watchedByAve: v.optional(v.id("aveThreads")),
  sandboxBranch: v.optional(v.string()),
  sandboxGitSync: v.optional(sandboxGitSyncValidator),
  repoGroupId: v.optional(v.id("repoGroups")),
  linkedRepoCount: v.optional(v.number()),
  forkedFromSessionId: v.optional(v.id("sessions")),
  sessionGroupId: v.optional(v.id("sessionGroups")),
  forkSourceSandboxId: v.optional(v.string()),
  forkRestartsSource: v.optional(v.boolean()),
};

/**
 * Linked sessions across repos: one agent spun up the others. Members point
 * here through `sessions.sessionGroupId`. A group always has two or more
 * members; removing the second-last one dissolves it.
 */
export const sessionGroupFields = {
  name: v.optional(v.string()),
  createdBy: v.id("users"),
};

/**
 * One extra GitHub repo cloned into a session's sandbox alongside the primary.
 * The primary stays at `/tmp/repo` (symlinked into the workspace); every linked
 * repo is a whole checkout at `/tmp/workspace/<name>` on the same branch name as
 * the primary. Its pull request, when it has one, is a `pullRequests` row.
 *
 * A row is always the entire repository — monorepo sibling app rows share one
 * checkout, so `rootDirectory` has no meaning here and is deliberately absent.
 */
export const sessionRepoFields = {
  sessionId: v.id("sessions"),
  repoId: v.id("githubRepos"),
  owner: v.string(),
  name: v.string(),
  installationId: v.number(),
  path: v.string(),
  branchName: v.string(),
  baseBranch: v.string(),
  prUrl: v.optional(v.string()),
  prState: v.optional(prStateValidator),
  installDependencies: v.boolean(),
  clonedAt: v.optional(v.number()),
  devPort: v.optional(v.number()),
  devCommand: v.optional(v.string()),
};

/**
 * A saved "codebase group": one primary repo plus the linked repos that should
 * be cloned with it. Prefills the new-session picker; never edits live sessions.
 */
export const repoGroupFields = {
  name: v.string(),
  createdBy: v.id("users"),
  teamId: v.optional(v.id("teams")),
  primaryRepoId: v.id("githubRepos"),
  linkedRepoIds: v.array(v.id("githubRepos")),
  installDependencies: v.optional(v.boolean()),
  seededSnapshotName: v.optional(v.string()),
  seededFingerprint: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
};

/** One built-in slash command reported by a harness CLI's init handshake. */
export const harnessSkillValidator = v.object({
  name: v.string(),
  description: v.string(),
  argumentHint: v.optional(v.string()),
});

/**
 * The built-in skill catalog a harness CLI ships with, one row per provider.
 * Deliberately global rather than per repo: every sandbox boots from the same
 * image, so the CLI build — and therefore its command list — is fleet-wide.
 * Reported by the provider daemon at session start (see
 * `harnessSkills.upsertForProvider`) and read by the composer's `/` picker,
 * which falls back to a static list until the first sandbox reports.
 */
export const harnessSkillCatalogFields = {
  provider: aiProviderValidator,
  cliVersion: v.string(),
  skills: v.array(harnessSkillValidator),
  updatedAt: v.number(),
};

/** One short-lived, single-use credential for a sandbox catalog report. */
export const harnessSkillReportTokenFields = {
  tokenHash: v.string(),
  provider: aiProviderValidator,
  sandboxId: v.string(),
  repoId: v.id("githubRepos"),
  expiresAt: v.number(),
};

export const repoSkillFields = {
  repoId: v.id("githubRepos"),
  title: v.string(),
  description: v.optional(v.string()),
  content: v.optional(v.string()),
  sourcePath: v.optional(v.string()),
  sourceSha: v.optional(v.string()),
  available: v.optional(v.boolean()),
  lastSyncedAt: v.optional(v.number()),
  unavailableSince: v.optional(v.number()),
  prompt: v.optional(v.string()),
  createdAt: v.number(),
};

/** Large SKILL.md body split from repoSkills so list queries read metadata only. */
export const repoSkillContentFields = {
  skillId: v.id("repoSkills"),
  content: v.string(),
};

/**
 * One installed Eva system skill per canonical repo. The definition itself
 * lives in `convex/_systemSkills/registry.ts`; this row only records that the
 * repo opted in, so nothing is written to the user's codebase.
 */
export const repoSystemSkillFields = {
  repoId: v.id("githubRepos"),
  name: v.string(),
  installedBy: v.id("users"),
  installedAt: v.number(),
};

export const seededAppStatusValidator = v.union(
  v.literal("running"),
  v.literal("seeded"),
  v.literal("fallback"),
);

export const seededAppResultValidator = v.object({
  repoId: v.id("githubRepos"),
  app: v.optional(v.string()),
  status: v.optional(seededAppStatusValidator),
  seededSnapshotName: v.union(v.string(), v.null()),
});

/** Fields for `snapshotBuilds` — schema and query returns share this. */
export const snapshotBuildFields = {
  repoSnapshotId: v.id("repoSnapshots"),
  status: snapshotBuildStatusValidator,
  triggeredBy: snapshotBuildTriggerValidator,
  kind: v.optional(snapshotBuildKindValidator),
  logs: v.string(),
  error: v.optional(v.string()),
  workflowRunId: v.optional(v.number()),
  workflowId: v.optional(v.string()),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  retryCount: v.optional(v.number()),
  seededApps: v.optional(v.array(seededAppResultValidator)),
};

/** Keys of `SANDBOX_SIZES` in @eva/shared. */
export const sandboxSizeValidator = v.union(
  v.literal("small"),
  v.literal("medium"),
  v.literal("large"),
);

export const githubRepoFields = {
  owner: v.string(),
  name: v.string(),
  installationId: v.number(),
  githubId: v.optional(v.number()),
  connected: v.optional(v.boolean()),
  connectedBy: v.optional(v.id("users")),
  teamId: v.optional(v.id("teams")),
  rootDirectory: v.optional(v.string()),
  parentRepoId: v.optional(v.id("githubRepos")),
  defaultBaseBranch: v.optional(v.string()),
  defaultModel: v.optional(aiModelValidator),
  defaultReasoningLevel: v.optional(reasoningLevelValidator),
  defaultThinkingEnabled: v.optional(v.boolean()),
  defaultUse1mContext: v.optional(v.boolean()),
  defaultFastMode: v.optional(v.boolean()),
  sessionsVncEnabled: v.optional(v.boolean()),
  sessionsVscodeEnabled: v.optional(v.boolean()),
  sandboxReadExcluded: v.optional(v.boolean()),
  agentMemoryEnabled: v.optional(v.boolean()),
  sandboxSize: v.optional(sandboxSizeValidator),
  hidden: v.optional(v.boolean()),
  deploymentProjectName: v.optional(v.string()),
  domains: v.optional(v.array(v.string())),
  mcpRootPrompt: v.optional(v.string()),
  startupCommands: v.optional(v.array(v.string())),
  backgroundCommands: v.optional(v.array(v.string())),
  stopCommands: v.optional(v.array(v.string())),
  seededSnapshotName: v.optional(v.string()),
  seededFingerprint: v.optional(v.string()),
  evaConfig: v.optional(
    v.object({
      ref: v.string(),
      syncedAt: v.number(),
      error: v.optional(v.string()),
      appListed: v.optional(v.boolean()),
      mcpServers: v.array(
        v.object({
          name: v.string(),
          kind: v.union(v.literal("http"), v.literal("stdio")),
          target: v.string(),
        }),
      ),
    }),
  ),
  devPort: v.optional(v.number()),
  devCommand: v.optional(v.string()),
  systemPrompt: v.optional(v.string()),
  logoStorageId: v.optional(v.id("_storage")),
  label: v.optional(v.string()),
};

/** Eva team (personal or shared). Logo/background resolve to URLs in list/get. */
export const teamFields = {
  name: v.string(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  isPersonal: v.optional(v.boolean()),
  logoStorageId: v.optional(v.id("_storage")),
  backgroundStorageId: v.optional(v.id("_storage")),
};

export const projectFields = {
  ...entityNumIdFields,
  // schema-narrowing-ok: archiveDeletedEntities
  archivedAt: v.optional(v.number()),
  repoId: v.id("githubRepos"),
  summaryDocId: v.optional(v.id("docs")),
  phaseLabels: v.optional(v.array(v.string())),
  userId: v.id("users"),
  title: v.string(),
  description: v.optional(v.string()),
  branchName: v.optional(v.string()),
  baseBranch: v.optional(v.string()),
  ...prSummaryFields,
  // schema-narrowing-ok: clearLegacyProjectFields
  priority: v.optional(priorityValidator),
  rawInput: v.string(),
  projectLead: v.optional(v.id("users")),
  members: v.optional(v.array(v.id("users"))),
  projectStartDate: v.optional(v.number()),
  projectEndDate: v.optional(v.number()),
  // schema-narrowing-ok: migrateProjectBuildState
  // schema-narrowing-ok: migrateProjectInterviewState
  branchVersion: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  // schema-narrowing-ok: clearProjectCodeReviewer
  tags: v.optional(v.array(v.string())),
  model: v.optional(aiModelValidator),
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  lastTurnFinishedAt: v.optional(v.number()),
  watchedByOrchestrator: v.optional(v.id("sessions")),
  watchedByAve: v.optional(v.id("aveThreads")),
};

/**
 * Repo events an automation can react to (see `_automationEvents/events.ts`).
 * `ci_failed` and `pr_feedback` only ever fire for PRs Eva opened.
 */
export const repoEventKindValidator = v.union(
  v.literal("ci_failed"),
  v.literal("pr_feedback"),
  v.literal("issue_labeled"),
  v.literal("pr_opened"),
  v.literal("pr_merged"),
  v.literal("production_alert"),
);

/** What starts an automation: its cron schedule, or a repo event. */
export const automationTriggerValidator = v.union(
  v.object({ kind: v.literal("cron") }),
  v.object({
    kind: v.literal("event"),
    event: repoEventKindValidator,
    label: v.optional(v.string()),
  }),
);

export const automationFields = {
  ...entityNumIdFields,
  ...softDeleteFields,
  repoId: v.id("githubRepos"),
  title: v.string(),
  description: v.string(),
  cronSchedule: v.string(),
  trigger: v.optional(automationTriggerValidator),
  model: v.optional(aiModelValidator),
  enabled: v.boolean(),
  readOnly: v.optional(v.boolean()),
  actionsEnabled: v.optional(v.boolean()),
  shared: v.optional(v.boolean()),
  sendEmail: v.optional(v.boolean()),
  autoStartTasks: v.optional(v.boolean()),
  alertSecretHash: v.optional(v.string()),
  emailAutoSend: v.optional(v.boolean()),
  cronJobId: v.optional(v.string()),
  systemKey: v.optional(v.string()),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
};

/**
 * The email a successful run produces. A `draft` waits for review and can be
 * edited; `sent` and `discarded` are final, so an email never sends twice.
 */
export const automationRunEmailValidator = v.object({
  status: v.union(
    v.literal("draft"),
    v.literal("sent"),
    v.literal("discarded"),
  ),
  subject: v.string(),
  body: v.string(),
});

export const automationRunFields = {
  automationId: v.id("automations"),
  repoId: v.id("githubRepos"),
  status: runStatusValidator,
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  resultSummary: v.optional(v.string()),
  prUrl: v.optional(v.string()),
  error: v.optional(v.string()),
  acknowledged: v.boolean(),
  sandboxId: v.optional(v.string()),
  activeWorkflowId: v.optional(v.string()),
  activityLog: v.optional(v.string()),
  findings: v.optional(v.array(automationFindingValidator)),
  email: v.optional(automationRunEmailValidator),
  eventKind: v.optional(repoEventKindValidator),
  eventKey: v.optional(v.string()),
  targetUrl: v.optional(v.string()),
  eventCursor: v.optional(v.number()),
  createdTaskId: v.optional(v.id("agentTasks")),
  superseded: v.optional(v.boolean()),
};

export const changelogVoteFields = {
  runId: v.id("automationRuns"),
  userId: v.id("users"),
  itemIndex: v.optional(v.number()),
  vote: v.union(
    v.literal("up"),
    v.literal("down"),
    v.literal("love"),
    v.literal("ok"),
    v.literal("meh"),
  ),
  updatedAt: v.number(),
};

/**
 * Usage columns denormalised from `rawResultEvent` at write time (see
 * `_logs/usage.ts`) so the Usage page aggregates without parsing JSON blobs.
 * Optional until the backfill migration has run; rows without a result event
 * never get them.
 */
export const logUsageFields = {
  costUsd: v.optional(v.number()),
  model: v.optional(v.string()),
  provider: v.optional(v.string()),
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  cacheReadTokens: v.optional(v.number()),
  cacheCreationTokens: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  contextWindow: v.optional(v.number()),
};

export const logFields = {
  entityType: v.string(),
  entityId: v.string(),
  entityTitle: v.string(),
  rawResultEvent: v.optional(v.string()),
  repoId: v.id("githubRepos"),
  projectId: v.optional(v.id("projects")),
  createdAt: v.number(),
  ...logUsageFields,
};

export const messageFields = {
  role: roleValidator,
  content: v.string(),
  timestamp: v.number(),
  finishedAt: v.optional(v.number()),
  activityLog: v.optional(v.string()),
  userId: v.optional(v.id("users")),
  parentId: chatParentIdValidator,
  clientId: v.optional(v.string()),
  isSystemAlert: v.optional(v.boolean()),
  alertTone: v.optional(v.literal("warning")),
  errorDetail: v.optional(v.string()),
  stopped: v.optional(v.literal(true)),
  errorType: v.optional(errorTypeValidator),
  limitResetAt: v.optional(v.number()),
  variations: v.optional(v.array(variationValidator)),
  imageStorageId: v.optional(v.id("_storage")),
  videoStorageId: v.optional(v.id("_storage")),
  mediaStorageIds: v.optional(v.array(v.id("_storage"))),
  attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  pendingQuestion: v.optional(v.string()),
  isSyntheticTurn: v.optional(v.boolean()),
  credentialSourceLabel: v.optional(v.string()),
  credentialAccountId: v.optional(v.id("userProviderAccounts")),
  model: v.optional(aiModelValidator),
  reasoningLevel: v.optional(reasoningLevelValidator),
  sentViaOrchestrator: v.optional(v.boolean()),
  orchestratorNotification: v.optional(v.boolean()),
  beforeSha: v.optional(v.string()),
  afterSha: v.optional(v.string()),
  beforeShas: v.optional(v.array(repoShaValidator)),
  afterShas: v.optional(v.array(repoShaValidator)),
  scopeCheck: v.optional(scopeCheckValidator),
  replyTo: v.optional(v.id("messages")),
  replyCount: v.optional(v.number()),
  lastReplyAt: v.optional(v.number()),
  replierIds: v.optional(v.array(v.id("users"))),
};

/**
 * Manager Ave's conversation. One live thread per user (`archivedAt` unset);
 * a reset archives it and the next send opens a fresh one. Ave runs
 * server-side (`mcp/aveRun.ts`), so there is no sandbox, repo or model here —
 * only the run state that keeps one run in flight at a time.
 */
export const aveThreadFields = {
  userId: v.id("users"),
  status: v.union(v.literal("idle"), v.literal("running")),
  runId: v.optional(v.string()),
  runStartedAt: v.optional(v.number()),
  runMessageId: v.optional(v.id("aveMessages")),
  rerunRequested: v.optional(v.boolean()),
  cancelRequested: v.optional(v.boolean()),
  readAt: v.optional(v.number()),
  archivedAt: v.optional(v.number()),
  updatedAt: v.number(),
};

/**
 * One Manager Ave chat row. Field names deliberately match `messageFields` so
 * the shared chat UI renders these unchanged.
 */
export const aveMessageFields = {
  threadId: v.id("aveThreads"),
  role: roleValidator,
  content: v.string(),
  timestamp: v.number(),
  finishedAt: v.optional(v.number()),
  activityLog: v.optional(v.string()),
  userId: v.optional(v.id("users")),
  clientId: v.optional(v.string()),
  isSystemAlert: v.optional(v.boolean()),
  errorDetail: v.optional(v.string()),
  orchestratorNotification: v.optional(v.boolean()),
  modelMessages: v.optional(v.string()),
};

export const queuedMessageFields = {
  parentId: chatParentIdValidator,
  content: v.string(),
  displayContent: v.optional(v.string()),
  createdAt: v.number(),
  order: v.optional(v.number()),
  userId: v.id("users"),
  model: v.optional(aiModelValidator),
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  reasoningLevel: v.optional(reasoningLevelValidator),
  thinkingEnabled: v.optional(v.boolean()),
  use1mContext: v.optional(v.boolean()),
  fastMode: v.optional(v.boolean()),
  responseLength: v.optional(v.string()),
  interactionMode: v.optional(interactionModeValidator),
  attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  orchestratorNotification: v.optional(v.boolean()),
  sentViaOrchestrator: v.optional(v.boolean()),
  steer: v.optional(v.union(v.literal("requested"), v.literal("delivering"))),
  replyTo: v.optional(v.id("messages")),
};

export const taskSandboxEventFields = {
  taskId: v.id("agentTasks"),
  event: taskSandboxEventValidator,
  errorDetail: v.optional(v.string()),
  createdAt: v.number(),
};

export const taskActivityFields = {
  taskId: v.id("agentTasks"),
  field: taskActivityFieldValidator,
  oldValue: v.optional(v.string()),
  newValue: v.optional(v.string()),
  userId: v.optional(v.id("users")),
  createdAt: v.number(),
};

export const taskCommentFields = {
  taskId: v.id("agentTasks"),
  content: v.string(),
  authorId: v.optional(v.id("users")),
  parentId: v.optional(v.id("taskComments")),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
};

export const taskReactionFields = {
  taskId: v.id("agentTasks"),
  targetType: reactionTargetValidator,
  targetId: v.string(),
  emoji: v.string(),
  userId: v.id("users"),
  createdAt: v.number(),
};

export const taskSubscriberFields = {
  taskId: v.id("agentTasks"),
  userId: v.id("users"),
  subscribed: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const chatReadFields = {
  userId: v.id("users"),
  parentId: chatReadParentIdValidator,
  repoId: v.id("githubRepos"),
  lastReadAt: v.number(),
  lastVisitedAt: v.optional(v.number()),
};

export const standupReadFields = {
  userId: v.id("users"),
  repoId: v.id("githubRepos"),
  lastReadAt: v.number(),
};

export const chatRecapKindValidator = v.union(
  v.literal("away"),
  v.literal("full"),
);
export const chatRecapFields = {
  userId: v.id("users"),
  parentId: chatParentIdValidator,
  kind: chatRecapKindValidator,
  since: v.number(),
  createdAt: v.number(),
  text: v.optional(v.string()),
};

export const sandboxIdlePauseModeValidator = v.union(
  v.literal("off"),
  v.literal("on"),
);

export const appSettingsFields = {
  sandboxAutoStopEnabled: v.boolean(),
  sandboxAutoStopTime: v.string(),
  sandboxAutoStopTimeZone: v.string(),
  sandboxAutoStopLastRunDate: v.optional(v.string()),
  sandboxIdlePauseMode: v.optional(sandboxIdlePauseModeValidator),
  sandboxIdleAfterAgentMinutes: v.optional(v.number()),
  sandboxIdleAfterInteractionMinutes: v.optional(v.number()),
  sandboxIdleStopEnabled: v.optional(v.boolean()),
  sandboxIdleStopMinutes: v.optional(v.number()),
};

/** What reset the idle clock last (shown in the sandbox panel and sweep logs). */
export const sandboxActivitySourceValidator = v.union(
  v.literal("chat"),
  v.literal("start"),
  v.literal("viewing"),
  v.literal("preview-tab"),
  v.literal("preview-page"),
  v.literal("terminal"),
  v.literal("files"),
  v.literal("services"),
);
export type SandboxActivitySource = Infer<
  typeof sandboxActivitySourceValidator
>;

export const sandboxActivityFields = {
  // schema-narrowing-ok: deleteLegacyOwnerSandboxActivity
  kind: v.literal("session"),
  entityId: v.string(),
  lastUserActivityAt: v.optional(v.number()),
  lastUserActivitySource: v.optional(sandboxActivitySourceValidator),
  lastUserActivityUserId: v.optional(v.id("users")),
  lastAgentFinishedAt: v.optional(v.number()),
};

export const sandboxGitCredentialsFields = {
  sandboxId: v.string(),
  installationId: v.number(),
  installationIds: v.optional(v.array(v.number())),
  secret: v.string(),
  repoOwner: v.optional(v.string()),
  repoName: v.optional(v.string()),
  createdAt: v.number(),
};

/**
 * Chat (session / quick task / project) a doc or artifact was created from.
 * Shared by `docs` and `artifacts`; resolved by `_chatSource/helpers.ts`.
 */
export const chatSourceFields = {
  sourceKind: v.optional(chatEntityKindValidator),
  sourceSessionId: v.optional(v.id("sessions")),
  sourceTaskId: v.optional(v.id("agentTasks")),
  sourceProjectId: v.optional(v.id("projects")),
};

/**
 * One append-only entry in a chat's Log (Documents tab): a decision, change,
 * research finding, answered question or note. Never edited; a changed
 * decision is a new row that names the one it `supersedesId`.
 */
export const chatLogEntryFields = {
  ...chatSourceFields,
  repoId: v.optional(v.id("githubRepos")),
  kind: chatLogEntryKindValidator,
  author: chatLogAuthorValidator,
  title: v.string(),
  body: v.optional(v.string()),
  supersedesId: v.optional(v.id("chatLogEntries")),
  messageId: v.optional(v.id("messages")),
  beforeSha: v.optional(v.string()),
  afterSha: v.optional(v.string()),
  createdAt: v.number(),
};

/**
 * One piece of feedback on an Eva turn: a user's thumbs up / down (one row per
 * user per turn) or an agent's `submit_feedback` when the user shows clear
 * frustration or praise. Listed across repos on the global Feedback page.
 */
export const feedbackFields = {
  ...chatSourceFields,
  parentId: messageFields.parentId,
  repoId: v.optional(v.id("githubRepos")),
  messageId: v.optional(v.id("messages")),
  userId: v.id("users"),
  author: feedbackAuthorValidator,
  sentiment: feedbackSentimentValidator,
  comment: v.optional(v.string()),
  createdAt: v.number(),
};

export const docFields = {
  ...entityNumIdFields,
  ...softDeleteFields,
  repoId: v.id("githubRepos"),
  kind: v.optional(docKindValidator),
  sessionId: v.optional(v.id("sessions")),
  ...chatSourceFields,
  title: v.string(),
  content: v.string(),
  html: v.optional(v.string()),
  recapWalkthrough: v.optional(v.array(recapWalkthroughStepValidator)),
  prUrl: v.optional(v.string()),
  prNumber: v.optional(v.number()),
  headSha: v.optional(v.string()),
  prRecapStatus: v.optional(prRecapStatusValidator),
  prRecapOrigin: v.optional(prRecapOriginValidator),
  prRecapError: v.optional(v.string()),
  prRecapModel: v.optional(aiModelValidator),
  ...modelTraitsExecutionFields,
  pendingAgentCommentIds: v.optional(v.array(v.id("docComments"))),
  description: v.optional(v.string()),
  userFlows: v.optional(v.array(userFlowValidator)),
  requirements: v.optional(v.array(v.string())),
  interviewHistory: v.optional(
    v.array(
      v.object({
        role: roleValidator,
        content: v.string(),
        activityLog: v.optional(v.string()),
        userId: v.optional(v.id("users")),
      }),
    ),
  ),
  sandboxId: v.optional(v.string()),
  activeWorkflowId: v.optional(v.string()),
  testGenStatus: v.optional(evaluationStatusValidator),
  testPrUrl: v.optional(v.string()),
  arenaPrRunsUserId: v.optional(v.id("users")),
  contentUpdatedAt: v.optional(v.number()),
  lastParsedAt: v.optional(v.number()),
  createdBy: v.optional(v.id("users")),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const docCommentFields = {
  docId: v.id("docs"),
  content: v.string(),
  authorId: v.optional(v.id("users")),
  parentId: v.optional(v.id("docComments")),
  anchorId: v.optional(v.string()),
  anchorText: v.optional(v.string()),
  resolutionTarget: v.optional(v.union(v.literal("agent"), v.literal("human"))),
  resolvedAt: v.optional(v.number()),
  resolvedBy: v.optional(v.id("users")),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
};

export const docSubscriberFields = {
  docId: v.id("docs"),
  userId: v.id("users"),
  subscribed: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const docVersionFields = {
  docId: v.id("docs"),
  title: v.string(),
  content: v.string(),
  pmContent: v.string(),
  authorIds: v.array(v.id("users")),
  headSha: v.optional(v.string()),
  source: v.optional(docVersionSourceValidator),
  createdAt: v.number(),
};

export const docVersionDraftFields = {
  docId: v.id("docs"),
  authorIds: v.array(v.id("users")),
  updatedAt: v.number(),
};

export const draftFields = {
  userId: v.id("users"),
  repoId: v.id("githubRepos"),
  // schema-narrowing-ok: deleteLegacyOwnerChatDrafts
  kind: v.union(v.literal("taskComment"), v.literal("sessionChat")),
  taskId: v.optional(v.id("agentTasks")),
  parentCommentId: v.optional(v.id("taskComments")),
  projectId: v.optional(v.id("projects")),
  sessionId: v.optional(v.id("sessions")),
  chatId: v.optional(v.id("sessionChats")),
  content: v.string(),
  updatedAt: v.number(),
};

export const promptStashFields = {
  userId: v.id("users"),
  repoId: v.id("githubRepos"),
  content: v.string(),
  attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
};

export const evaluationReportFields = {
  repoId: v.id("githubRepos"),
  docId: v.id("docs"),
  kind: v.optional(evaluationKindValidator),
  trigger: v.optional(evaluationTriggerValidator),
  status: evaluationStatusValidator,
  issues: v.optional(v.array(evalIssueValidator)),
  summary: v.optional(v.string()),
  error: v.optional(v.string()),
  activeWorkflowId: v.optional(v.string()),
  fixStatus: v.optional(evalFixStatusValidator),
  fixBranchName: v.optional(v.string()),
  prUrl: v.optional(v.string()),
  branchName: v.optional(v.string()),
  scenarioResults: v.optional(v.array(arenaScenarioResultValidator)),
  prNumber: v.optional(v.number()),
  headSha: v.optional(v.string()),
  checkRunId: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const arenaScenarioFields = {
  repoId: v.id("githubRepos"),
  docId: v.id("docs"),
  title: v.string(),
  instructions: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const draftTarget = v.union(
  v.object({
    kind: v.literal("taskComment"),
    taskId: v.id("agentTasks"),
    parentCommentId: v.optional(v.id("taskComments")),
  }),
  v.object({
    kind: v.literal("sessionChat"),
    sessionId: v.id("sessions"),
    chatId: v.id("sessionChats"),
  }),
);

export const artifactFields = {
  name: v.string(),
  description: v.optional(v.string()),
  boundTeamId: v.id("teams"),
  declaredTools: v.array(v.string()),
  htmlStorageId: v.id("_storage"),
  uploadedBy: v.id("users"),
  createdAt: v.number(),
  ...chatSourceFields,
  chatParentId: v.optional(
    v.union(
      v.id("sessionChats"),
      v.id("sessions"),
      v.id("projects"),
      v.id("agentTasks"),
    ),
  ),
  messageId: v.optional(v.id("messages")),
};

export const artifactStateFields = {
  artifactId: v.id("artifacts"),
  ownerId: v.optional(v.id("users")),
  key: v.string(),
  value: v.string(),
  updatedBy: v.id("users"),
  updatedAt: v.number(),
};

export const appTabFields = {
  repoId: v.id("githubRepos"),
  name: v.string(),
  icon: v.string(),
  port: v.number(),
  enabled: v.boolean(),
  order: v.number(),
};

/**
 * Agent-spawned background Bash process tracked for the session chat panel.
 * `key` is the Bash tool_use id (idempotency for HTTP retries). `pid` is filled
 * by the first successful reconcile match.
 */
export const backgroundProcessFields = {
  sessionId: v.id("sessions"),
  key: v.string(),
  command: v.string(),
  shellId: v.optional(v.string()),
  pid: v.optional(v.number()),
  status: backgroundProcessStatusValidator,
  startedAt: v.number(),
  exitedAt: v.optional(v.number()),
};

/**
 * The latest plan usage-limit reading for one agent credential, captured in the
 * sandbox at the end of every turn and upserted here (one row per connected
 * account, plus one per team for the shared credential). Each row is a whole
 * snapshot, so a field the provider stopped reporting disappears rather than
 * going stale.
 *
 * Plan windows only: Claude reports `subscriptionType`, `status` and `windows`
 * (5-hour, weekly, per-model). A provider that exposes no plan limits does not
 * belong here — its spend is the per-turn cost gauge's business.
 */
export const agentUsageLimitFields = {
  repoId: v.optional(v.id("githubRepos")),
  provider: usageLimitProviderValidator,
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  teamId: v.optional(v.id("teams")),
  capturedAt: v.number(),
  subscriptionType: v.optional(v.string()),
  status: v.optional(usageLimitStatusValidator),
  windows: v.optional(v.array(usageLimitWindowValidator)),
  completeness: v.optional(usageLimitCompletenessValidator),
};

/**
 * One agent-generated UI panel rendered inline in a chat. `spec` is a
 * json-render Spec serialised as JSON — kept as a string because its shape is
 * the catalog's business, not the database's, and it is re-parsed at the
 * client boundary (`parseGenerativeUiSpec` in `@vvedantb/server/generative-ui`).
 */
export const chatUiPanelFields = {
  parentId: chatParentIdValidator,
  messageId: v.optional(v.id("messages")),
  title: v.optional(v.string()),
  prompt: v.string(),
  spec: v.string(),
  elementCount: v.number(),
  createdAt: v.number(),
};

/**
 * One agent-authored HTML page (`render_html`). The page itself is a separate
 * `chatHtmlRenderBodies` row, so listing a chat's renders never reads pages.
 */
export const chatHtmlRenderFields = {
  parentId: chatParentIdValidator,
  messageId: v.optional(v.id("messages")),
  title: v.string(),
  height: v.number(),
  bodyId: v.id("chatHtmlRenderBodies"),
  createdAt: v.number(),
};

/** The page of one HTML render, as the agent wrote it (no bootstrap). */
export const chatHtmlRenderBodyFields = {
  html: v.string(),
};

export const envVarRequestScopeValidator = v.union(
  v.literal("repo"),
  v.literal("team"),
);

/**
 * One agent request (`request_env_var`) for a secret the user types into an
 * inline card. The value never touches this row: saving writes it encrypted to
 * the repo or team env vars and into the live sandbox, and only the status
 * lands here.
 */
export const envVarRequestFields = {
  parentId: chatParentIdValidator,
  messageId: v.optional(v.id("messages")),
  key: v.string(),
  reason: v.string(),
  scope: envVarRequestScopeValidator,
  repoId: v.id("githubRepos"),
  teamId: v.optional(v.id("teams")),
  sandboxId: v.optional(v.string()),
  status: v.union(
    v.literal("pending"),
    v.literal("saved"),
    v.literal("declined"),
  ),
  createdAt: v.number(),
  answeredAt: v.optional(v.number()),
};

/**
 * One agent proposal (`propose_session`) to run a task in a new session,
 * shown as an inline card with two choices. Nothing starts until the user
 * picks one: "started" opened `sessionId` on `brief`, "here" told the agent to
 * do the work in the chat the card sits in.
 */
export const sessionProposalFields = {
  parentId: v.union(
    v.id("sessionChats"),
    v.id("sessions"),
    v.id("projects"),
    v.id("agentTasks"),
  ),
  messageId: v.optional(v.id("messages")),
  repoId: v.id("githubRepos"),
  title: v.string(),
  reason: v.string(),
  brief: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("started"),
    v.literal("here"),
  ),
  sessionId: v.optional(v.id("sessions")),
  sessionNumId: v.optional(v.number()),
  createdAt: v.number(),
  answeredAt: v.optional(v.number()),
};

/**
 * One agent request to run a WebMCP tool inside the chat's live preview. The
 * sandbox cannot reach the page, so the request is relayed through the user's
 * open Eva tab: the MCP tool inserts a row, a tab claims and runs it in the
 * preview iframe, then writes the result back. Payloads stay JSON strings
 * because their shape is the previewed app's business, not the database's.
 */
export const previewToolCallFields = {
  parentId: v.union(
    v.id("sessionChats"),
    v.id("sessions"),
    v.id("projects"),
    v.id("agentTasks"),
  ),
  kind: v.union(v.literal("list"), v.literal("invoke")),
  name: v.optional(v.string()),
  argumentsJson: v.optional(v.string()),
  status: v.union(
    v.literal("pending"),
    v.literal("claimed"),
    v.literal("done"),
    v.literal("error"),
  ),
  claimedBy: v.optional(v.string()),
  resultJson: v.optional(v.string()),
  error: v.optional(v.string()),
  createdAt: v.number(),
};

/** A captured ExitPlanMode plan, linked to the turn that proposed it. */
export const proposedPlanFields = {
  sessionId: v.id("sessions"),
  turnId: v.optional(v.id("turns")),
  messageId: v.optional(v.id("messages")),
  planMarkdown: v.string(),
  captureKey: v.string(),
  implementedAt: v.optional(v.number()),
  implementationSessionId: v.optional(v.id("sessions")),
  createdAt: v.number(),
  updatedAt: v.number(),
};

/**
 * A child task's message up to its project's coordinator
 * (`report_to_coordinator`). A `report` is a note; an `ask` is a question that
 * ends the task's turn and waits for an answer (`_projects/reports.ts`).
 */
export const projectTaskReportFields = {
  projectId: v.id("projects"),
  taskId: v.id("agentTasks"),
  kind: v.union(v.literal("report"), v.literal("ask")),
  text: v.string(),
  state: v.union(v.literal("open"), v.literal("answered"), v.literal("closed")),
  answeredBy: v.optional(v.union(v.literal("coordinator"), v.id("users"))),
  answeredAt: v.optional(v.number()),
  createdAt: v.number(),
};

/**
 * Tasks the coordinator created in one tool call, for the task card in its
 * chat. `messageId` is the coordinator turn the call ran in.
 */
export const projectTaskBatchFields = {
  projectId: v.id("projects"),
  messageId: v.optional(v.id("messages")),
  taskIds: v.array(v.id("agentTasks")),
  createdAt: v.number(),
};

/**
 * One reason to wake a project's coordinator (decision 16). `key` makes a
 * request idempotent; `sentAt` marks it delivered in a turn.
 */
export const projectCoordinatorWakeFields = {
  projectId: v.id("projects"),
  reason: v.union(
    v.literal("ask"),
    v.literal("failed"),
    v.literal("batch_done"),
    v.literal("triage"),
  ),
  key: v.string(),
  text: v.string(),
  createdAt: v.number(),
  sentAt: v.optional(v.number()),
  // schema-narrowing-ok: clearCoordinatorWakeHeldAt
};

export const notificationFields = {
  userId: v.id("users"),
  type: notificationTypeValidator,
  title: v.string(),
  message: v.optional(v.string()),
  read: v.boolean(),
  href: v.optional(v.string()),
  repoId: v.optional(v.id("githubRepos")),
  createdAt: v.number(),
  contextLabel: v.optional(v.string()),
  emailedAt: v.optional(v.number()),
  archivedAt: v.optional(v.number()),
  commentId: v.optional(v.union(v.id("taskComments"), v.id("docComments"))),
  urgency: v.optional(notificationUrgencyValidator),
  chatTarget: v.optional(v.string()),
};

export const repoEnvVarFields = {
  repoId: v.id("githubRepos"),
  vars: v.array(envVarEntryValidator),
  updatedAt: v.number(),
};

export const repoSnapshotFields = {
  repoId: v.id("githubRepos"),
  // schema-narrowing-ok: removeDaytonaSnapshotFields
  schedule: snapshotScheduleValidator,
  enabled: v.optional(v.boolean()),
  cronJobId: v.optional(v.string()),
  buildCommands: v.optional(v.array(v.string())),
  seedCommands: v.optional(v.array(v.string())),
  baseSnapshotId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const teamMemberFields = {
  teamId: v.id("teams"),
  userId: v.id("users"),
  role: teamMemberRoleValidator,
  joinedAt: v.number(),
};

export const teamEnvVarFields = {
  teamId: v.id("teams"),
  vars: v.array(envVarEntryValidator),
  updatedAt: v.number(),
};

/** Team-scoped routing directory — what a person owns and should be asked. */
export const workProfileFields = {
  teamId: v.id("teams"),
  userId: v.id("users"),
  role: v.optional(roleUserValidator),
  headline: v.string(),
  owns: v.string(),
  askMeAbout: v.string(),
  updatedAt: v.number(),
};

/** One routed question thread: one topic, one source entity, many teammates. */
export const routedThreadFields = {
  teamId: v.id("teams"),
  repoId: v.id("githubRepos"),
  sourceKind: routedSourceKindValidator,
  sourceId: v.string(),
  sourceNumId: v.optional(v.number()),
  sourceTitle: v.string(),
  topicKey: v.string(),
  title: v.string(),
  status: routedThreadStatusValidator,
  lastMessageAt: v.number(),
  lastPreview: v.string(),
  createdAt: v.number(),
  resolvedAt: v.optional(v.number()),
};

/** One teammate on a routed thread. Denormalises the thread's clock so the
 *  Manager Ave question dock is one indexed scan, newest first. */
export const routedParticipantFields = {
  threadId: v.id("routedThreads"),
  userId: v.id("users"),
  teamId: v.id("teams"),
  lastMessageAt: v.number(),
  needsReply: v.boolean(),
  addedAt: v.number(),
  repliedAt: v.optional(v.number()),
};

export const routedMessageFields = {
  threadId: v.id("routedThreads"),
  authorKind: routedAuthorKindValidator,
  authorUserId: v.optional(v.id("users")),
  body: v.string(),
  context: v.optional(v.string()),
  createdAt: v.number(),
  attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  mirroredMessageId: v.optional(v.id("messages")),
};
