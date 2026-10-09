import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  activityLogTypeValidator,
  webhookEventStatusValidator,
  messageFields,
  aveThreadFields,
  aveMessageFields,
  automationFields,
  automationRunFields,
  agentTaskFields,
  agentRunFields,
  pullRequestFields,
  sessionFields,
  sessionRepoFields,
  repoGroupFields,
  githubRepoFields,
  teamFields,
  syncSettingFields,
  projectFields,
  projectDetailsFields,
  queuedMessageFields,
  taskSandboxEventFields,
  taskActivityFields,
  taskCommentFields,
  taskReactionFields,
  taskSubscriberFields,
  chatReadFields,
  repoSkillFields,
  repoSkillContentFields,
  repoSystemSkillFields,
  harnessSkillCatalogFields,
  harnessSkillReportTokenFields,
  sandboxGitCredentialsFields,
  appSettingsFields,
  sandboxActivityFields,
  userFields,
  userPresenceFields,
  userProviderAccountFields,
  githubUserTokenFields,
  githubOauthStateFields,
  connectedAccountFields,
  connectorOauthStateFields,
  docFields,
  docCommentFields,
  docSubscriberFields,
  docVersionFields,
  docVersionDraftFields,
  draftFields,
  promptStashFields,
  evaluationReportFields,
  artifactFields,
  repoEntityCounterFields,
  appTabFields,
  backgroundProcessFields,
  snapshotBuildFields,
  sessionDaemonStateFields,
  turnFields,
  chatUiPanelFields,
  chatHtmlRenderFields,
  chatHtmlRenderBodyFields,
  envVarRequestFields,
  previewToolCallFields,
  proposedPlanFields,
  agentUsageLimitFields,
  logFields,
  notificationFields,
  teamMemberFields,
  taskDependencyFields,
  repoSnapshotFields,
  sandboxConfigFileFields,
  repoEnvVarFields,
  teamEnvVarFields,
  presentationStatusValidator,
} from "./validators";

const schema = defineSchema({
  users: defineTable(userFields)
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  userPresence: defineTable(userPresenceFields).index("by_user", ["userId"]),

  artifacts: defineTable(artifactFields)
    .index("by_team", ["boundTeamId"])
    .index("by_uploader", ["uploadedBy"])
    .index("by_source_session", ["sourceSessionId"])
    .index("by_source_task", ["sourceTaskId"])
    .index("by_source_project", ["sourceProjectId"]),

  projects: defineTable(projectFields)
    .index("by_repo", ["repoId"])
    .index("by_repo_and_deleted", ["repoId", "deletedAt"])
    .index("by_user", ["userId"])
    .index("by_repo_and_phase", ["repoId", "phase"])
    .index("by_repo_and_numId", ["repoId", "numId"])
    .index("by_repo_and_sandbox_status", [
      "repoId",
      "reviewProjectSandboxStatus",
    ])
    .index("by_sandbox", ["sandboxId"]),

  projectDetails: defineTable(projectDetailsFields).index("by_project", [
    "projectId",
  ]),

  agentTasks: defineTable(agentTaskFields)
    .index("by_repo", ["repoId"])
    .index("by_repo_and_status", ["repoId", "status"])
    .index("by_repo_status_and_deleted", ["repoId", "status", "deletedAt"])
    .index("by_repo_and_updatedAt", ["repoId", "updatedAt"])
    .index("by_project", ["projectId"])
    .index("by_project_and_status", ["projectId", "status"])
    .index("by_repo_and_numId", ["repoId", "numId"])
    .index("by_repo_and_sandbox_status", ["repoId", "reviewTaskSandboxStatus"])
    .index("by_sandbox", ["sandboxId"]),

  agentRuns: defineTable(agentRunFields)
    .index("by_task", ["taskId"])
    .index("by_task_and_status", ["taskId", "status"])
    .index("by_status", ["status"]),

  // Every pull request linked to a session, quick task or project. An owner
  // may hold many; `owner.*` indexes list them, `by_pr_url` resolves webhooks.
  pullRequests: defineTable(pullRequestFields)
    .index("by_pr_url", ["prUrl"])
    .index("by_session", ["owner.sessionId"])
    .index("by_task", ["owner.taskId"])
    .index("by_project", ["owner.projectId"])
    .index("by_repo_and_head_branch", ["repoId", "headBranch"]),

  agentTaskRunSummaries: defineTable({
    taskId: v.id("agentTasks"),
    repoId: v.id("githubRepos"),
    lastRunStartedAt: v.optional(v.number()),
  })
    .index("by_task", ["taskId"])
    .index("by_repo", ["repoId"]),

  agentRunActivityLogs: defineTable({
    runId: v.id("agentRuns"),
    activityLog: v.string(),
    type: v.optional(activityLogTypeValidator),
    updatedAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_and_type", ["runId", "type"]),

  githubRepos: defineTable(githubRepoFields)
    .index("by_github_id", ["githubId"])
    .index("by_installation", ["installationId"])
    .index("by_owner_and_name", ["owner", "name"])
    .index("by_team", ["teamId"])
    .index("by_connected_by", ["connectedBy"]),

  taskComments: defineTable(taskCommentFields).index("by_task", ["taskId"]),

  taskReactions: defineTable(taskReactionFields)
    .index("by_task", ["taskId"])
    .index("by_target_user_emoji", [
      "targetType",
      "targetId",
      "userId",
      "emoji",
    ]),

  taskSubscribers: defineTable(taskSubscriberFields)
    .index("by_task", ["taskId"])
    .index("by_task_and_user", ["taskId", "userId"]),

  chatReads: defineTable(chatReadFields)
    .index("by_user_parent", ["userId", "parentId"])
    .index("by_user_repo", ["userId", "repoId"]),

  taskDependencies: defineTable(taskDependencyFields)
    .index("by_task", ["taskId"])
    .index("by_task_and_depends_on", ["taskId", "dependsOnId"])
    .index("by_dependency", ["dependsOnId"]),
  taskSandboxEvents: defineTable(taskSandboxEventFields).index("by_task", [
    "taskId",
  ]),
  taskActivity: defineTable(taskActivityFields).index("by_task", ["taskId"]),
  messages: defineTable(messageFields).index("by_parent", ["parentId"]),
  aveThreads: defineTable(aveThreadFields).index("by_user_and_archived", [
    "userId",
    "archivedAt",
  ]),
  aveMessages: defineTable(aveMessageFields).index("by_thread", ["threadId"]),
  queuedMessages: defineTable(queuedMessageFields)
    .index("by_parent_and_created", ["parentId", "createdAt"])
    .index("by_parent_and_order", ["parentId", "order"]),
  sessions: defineTable(sessionFields)
    .index("by_repo", ["repoId"])
    .index("by_repo_and_deleted", ["repoId", "deletedAt"])
    .index("by_user", ["userId"])
    .index("by_repo_and_status", ["repoId", "status"])
    .index("by_repo_and_archived", ["repoId", "archived"])
    .index("by_repo_archived_and_deleted", ["repoId", "archived", "deletedAt"])
    .index("by_repo_and_numId", ["repoId", "numId"])
    .index("by_sandbox", ["sandboxId"])
    .index("by_forked_from", ["forkedFromSessionId"]),
  sessionDaemonStates: defineTable(sessionDaemonStateFields).index(
    "by_session",
    ["sessionId"],
  ),
  // Extra repos cloned into a session's sandbox beside the primary (which stays
  // on `sessions.repoId`). One row per linked repo per session.
  sessionRepos: defineTable(sessionRepoFields)
    .index("by_session", ["sessionId"])
    .index("by_repo", ["repoId"]),
  // Saved codebase groups that prefill a new session's repo selection.
  repoGroups: defineTable(repoGroupFields)
    .index("by_created_by", ["createdBy"])
    .index("by_team", ["teamId"]),
  turns: defineTable(turnFields)
    .index("by_entity_open", ["entityId", "lane", "open"])
    .index("by_repo_open", ["repoId", "open"])
    .index("by_open_lease", ["open", "leaseExpiresAt"])
    .index("by_workflow", ["workflowId"]),
  // Agent-generated chat UI panels, one row per `render_ui` call. Shared by
  // sessions, quick tasks and projects — the chat surface is one surface.
  chatUiPanels: defineTable(chatUiPanelFields).index("by_parent", ["parentId"]),
  // Agent-authored HTML pages, one row per `render_html` call; the page body
  // is its own row. Same three chat surfaces as `chatUiPanels`.
  chatHtmlRenders: defineTable(chatHtmlRenderFields).index("by_parent", [
    "parentId",
  ]),
  chatHtmlRenderBodies: defineTable(chatHtmlRenderBodyFields),
  // Secret requests the agent posts as an inline card (`request_env_var`).
  // Status only: the value goes to the encrypted env var stores.
  envVarRequests: defineTable(envVarRequestFields).index("by_parent", [
    "parentId",
  ]),
  // Agent → live-preview WebMCP tool calls relayed through the user's open Eva
  // tab. Short-lived: cleared when the entity's sandbox stops.
  previewToolCalls: defineTable(previewToolCallFields).index(
    "by_parent_status",
    ["parentId", "status"],
  ),
  proposedPlans: defineTable(proposedPlanFields)
    .index("by_session", ["sessionId"])
    .index("by_session_and_capture_key", ["sessionId", "captureKey"])
    .index("by_message", ["messageId"]),
  // Latest agent plan usage-limit reading per credential, upserted by the
  // sandbox callback at the end of every turn (usageLimits:report). Plan limits
  // belong to the credential, not the repo it ran on, so a user with two Claude
  // accounts keeps a row for each and the shared team credential keeps one per
  // team. Legacy per-repo rows still sit in the by_provider_account range and
  // are filtered out on read — see `_usageLimits/rows.ts`.
  agentUsageLimits: defineTable(agentUsageLimitFields)
    .index("by_provider_account", ["provider", "providerAccountId"])
    .index("by_provider_team", ["provider", "teamId"]),
  backgroundProcesses: defineTable(backgroundProcessFields)
    .index("by_session_and_status", ["sessionId", "status"])
    .index("by_session_and_key", ["sessionId", "key"]),
  // Per-sandbox rate-limit stamps for the preview poll's background heal
  // (sandboxHeal.claim). Rows are tiny and reaped opportunistically on claim.
  sandboxHealStamps: defineTable({
    sandboxId: v.string(),
    lastHealAt: v.number(),
  })
    .index("by_sandbox", ["sandboxId"])
    .index("by_last_heal", ["lastHealAt"]),
  sandboxActivity: defineTable(sandboxActivityFields).index("by_entity", [
    "kind",
    "entityId",
  ]),
  streamingActivity: defineTable({
    entityId: v.string(),
    currentActivity: v.string(),
    currentContent: v.optional(v.string()),
    pendingQuestion: v.optional(v.string()),
    lastUpdatedAt: v.optional(v.number()),
  }).index("by_entity", ["entityId"]),
  // Single-flight guard for warm-daemon launches (claimDaemonLaunchLease).
  // Prewarm bursts (page opens, doc-patch refires) used to race the multi-
  // second check-then-launch window and boot duplicate daemons; only the
  // lease claimant launches, the rest no-op. Short TTL so a crashed launcher
  // never blocks the next boot for long. One row per entity, upserted.
  daemonLaunchLeases: defineTable({
    entityId: v.string(),
    expiresAt: v.number(),
  }).index("by_entity", ["entityId"]),
  // Blocking AskUserQuestion round-trip. The paused sandbox turn posts a row
  // here (via canUseTool), the UI reads the unanswered one and writes the
  // answer, and the sandbox claims the answer to resume the turn. `entityId`
  // is the generic session/project/task id (matches streamingActivity).
  pendingQuestions: defineTable({
    entityId: v.string(),
    toolUseId: v.string(),
    payload: v.string(),
    answer: v.optional(v.string()),
    answeredAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_entity", ["entityId"])
    .index("by_entity_tool", ["entityId", "toolUseId"]),
  docs: defineTable(docFields)
    .index("by_repo", ["repoId"])
    .index("by_repo_and_deleted", ["repoId", "deletedAt"])
    .index("by_session", ["sessionId"])
    .index("by_source_session", ["sourceSessionId"])
    .index("by_source_task", ["sourceTaskId"])
    .index("by_source_project", ["sourceProjectId"])
    .index("by_repo_and_pr_url", ["repoId", "prUrl"])
    .index("by_repo_and_numId", ["repoId", "numId"]),

  docComments: defineTable(docCommentFields).index("by_doc", ["docId"]),

  docSubscribers: defineTable(docSubscriberFields)
    .index("by_doc", ["docId"])
    .index("by_doc_and_user", ["docId", "userId"]),

  docVersions: defineTable(docVersionFields).index("by_doc", ["docId"]),

  docVersionDrafts: defineTable(docVersionDraftFields).index("by_doc", [
    "docId",
  ]),
  annotations: defineTable({
    userId: v.id("users"),
    pageUrl: v.string(),
    pins: v.string(),
    updatedAt: v.number(),
  }).index("by_user_and_url", ["userId", "pageUrl"]),

  evaluationReports: defineTable(evaluationReportFields)
    .index("by_repo", ["repoId"])
    .index("by_doc", ["docId"]),
  appTabs: defineTable(appTabFields).index("by_repo", ["repoId"]),
  repoSkills: defineTable(repoSkillFields)
    .index("by_repo", ["repoId"])
    .index("by_repo_and_source_path", ["repoId", "sourcePath"]),
  repoSkillContents: defineTable(repoSkillContentFields).index("by_skill", [
    "skillId",
  ]),
  repoSystemSkills: defineTable(repoSystemSkillFields)
    .index("by_repo", ["repoId"])
    .index("by_repo_and_name", ["repoId", "name"]),
  harnessSkillCatalogs: defineTable(harnessSkillCatalogFields).index(
    "by_provider",
    ["provider"],
  ),
  harnessSkillReportTokens: defineTable(harnessSkillReportTokenFields)
    .index("by_token_hash", ["tokenHash"])
    .index("by_expires_at", ["expiresAt"]),
  notifications: defineTable(notificationFields)
    .index("by_user", ["userId"])
    .index("by_user_and_read", ["userId", "read"])
    .index("by_repo", ["repoId"]),
  repoEnvVars: defineTable(repoEnvVarFields).index("by_repo", ["repoId"]),
  extensionReleases: defineTable({
    version: v.string(),
    crxStorageId: v.id("_storage"),
    releasedAt: v.number(),
    notes: v.optional(v.string()),
  }).index("by_version", ["version"]),
  repoSnapshots: defineTable(repoSnapshotFields).index("by_repo", ["repoId"]),
  snapshotBuilds: defineTable(snapshotBuildFields)
    .index("by_repo_snapshot", ["repoSnapshotId"])
    .index("by_repo_snapshot_and_status", ["repoSnapshotId", "status"])
    .index("by_status", ["status"]),
  sandboxConfigFiles: defineTable(sandboxConfigFileFields).index("by_repo", [
    "repoId",
  ]),
  teams: defineTable(teamFields).index("by_created_by", ["createdBy"]),
  teamMembers: defineTable(teamMemberFields)
    .index("by_team", ["teamId"])
    .index("by_team_and_role", ["teamId", "role"])
    .index("by_user", ["userId"])
    .index("by_team_and_user", ["teamId", "userId"]),
  githubWebhookEvents: defineTable({
    event: v.string(),
    action: v.string(),
    prUrl: v.optional(v.string()),
    merged: v.optional(v.boolean()),
    taskId: v.optional(v.id("agentTasks")),
    status: webhookEventStatusValidator,
    createdAt: v.number(),
  }).index("by_status", ["status"]),
  userProviderAccounts: defineTable(userProviderAccountFields)
    .index("by_user", ["userId"])
    .index("by_user_and_provider", ["userId", "provider"]),
  githubUserTokens: defineTable(githubUserTokenFields).index("by_user", [
    "userId",
  ]),
  githubOauthStates: defineTable(githubOauthStateFields).index("by_nonce", [
    "nonce",
  ]),
  connectedAccounts: defineTable(connectedAccountFields)
    .index("by_user", ["userId"])
    .index("by_user_and_provider", ["userId", "provider"]),
  connectorOauthStates: defineTable(connectorOauthStateFields).index(
    "by_nonce",
    ["nonce"],
  ),
  teamEnvVars: defineTable(teamEnvVarFields).index("by_team", ["teamId"]),
  automations: defineTable(automationFields)
    .index("by_repo", ["repoId"])
    .index("by_repo_and_enabled", ["repoId", "enabled"])
    .index("by_repo_and_numId", ["repoId", "numId"]),

  automationRuns: defineTable(automationRunFields)
    .index("by_automation", ["automationId"])
    .index("by_automation_and_status", ["automationId", "status"])
    .index("by_automation_and_eventKey", ["automationId", "eventKey"])
    .index("by_automation_and_targetUrl", ["automationId", "targetUrl"])
    .index("by_repo", ["repoId"]),

  logs: defineTable(logFields)
    .index("by_repo", ["repoId"])
    .index("by_repo_and_created", ["repoId", "createdAt"])
    .index("by_entity_type", ["entityType"])
    .index("by_repo_and_entity", ["repoId", "entityId"])
    .index("by_project", ["projectId"]),

  syncSettings: defineTable(syncSettingFields).index("by_owner_and_name", [
    "owner",
    "name",
  ]),

  repoEntityCounters: defineTable(repoEntityCounterFields).index(
    "by_repo_and_type",
    ["repoId", "entityType"],
  ),

  mcpAuthCodes: defineTable({
    code: v.string(),
    clerkUserId: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
    redirectUri: v.string(),
    clientId: v.string(),
    expiresAt: v.number(),
  }).index("by_code", ["code"]),

  mcpClientRegistrations: defineTable({
    clientId: v.string(),
    clientSecret: v.optional(v.string()),
    redirectUris: v.array(v.string()),
    registeredAt: v.number(),
  }).index("by_clientId", ["clientId"]),

  sandboxGitCredentials: defineTable(sandboxGitCredentialsFields)
    .index("by_sandbox_id", ["sandboxId"])
    .index("by_secret", ["secret"]),

  // App-wide singleton settings (only ever one row). Read/written via the
  // helpers in `sandboxAutoStop.ts`.
  appSettings: defineTable(appSettingsFields),

  // One row per (user, surface target). Persists unsent composer text for task
  // comments and chat prompts so drafts survive page reloads.
  // Not a stash queue — see `promptStashes` and internal/docs/prompt-stash-vs-drafts.md.
  drafts: defineTable(draftFields)
    .index("by_user_and_task", ["userId", "taskId"])
    .index("by_user_and_project", ["userId", "projectId"])
    .index("by_user_and_session", ["userId", "sessionId"])
    .index("by_user_and_repo", ["userId", "repoId"]),

  // Explicit ⌘S queue of frozen composer snapshots (text + attachment blobs),
  // scoped per user per repo. Separate from `drafts` (live WIP upsert).
  promptStashes: defineTable(promptStashFields).index("by_user_and_repo", [
    "userId",
    "repoId",
  ]),

  // Live sharing for the `/slides` deck — "follow the presenter" (Teams-style).
  // The presenter is the sole driver: only the browser holding the secret
  // `hostKey` (returned once from `createSession`) may move the deck.
  presentationSessions: defineTable({
    code: v.string(),
    hostKey: v.string(),
    slide: v.number(),
    status: presentationStatusValidator,
    lastActiveAt: v.number(),
  }).index("by_code", ["code"]),
});

export default schema;
