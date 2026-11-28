import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  webhookEventStatusValidator,
  messageFields,
  aveThreadFields,
  aveMessageFields,
  automationFields,
  automationRunFields,
  changelogVoteFields,
  agentTaskFields,
  pullRequestFields,
  sessionFields,
  sessionRepoFields,
  sessionGroupFields,
  repoGroupFields,
  githubRepoFields,
  teamFields,
  projectFields,
  queuedMessageFields,
  taskActivityFields,
  taskCommentFields,
  taskReactionFields,
  taskSubscriberFields,
  threadParticipantFields,
  chatReadFields,
  standupReadFields,
  chatRecapFields,
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
  chatLogEntryFields,
  feedbackFields,
  docCommentFields,
  docSubscriberFields,
  docVersionFields,
  docVersionDraftFields,
  draftFields,
  promptStashFields,
  evaluationReportFields,
  arenaScenarioFields,
  artifactFields,
  artifactStateFields,
  repoEntityCounterFields,
  appTabFields,
  backgroundProcessFields,
  snapshotBuildFields,
  sessionChatFields,
  turnFields,
  chatUiPanelFields,
  chatHtmlRenderFields,
  chatHtmlRenderBodyFields,
  envVarRequestFields,
  sessionProposalFields,
  previewToolCallFields,
  proposedPlanFields,
  agentUsageLimitFields,
  logFields,
  workProfileFields,
  projectTaskReportFields,
  projectTaskBatchFields,
  projectChatTaskLinkFields,
  projectCoordinatorWakeFields,
  notificationFields,
  repoEnvVarFields,
  repoSnapshotFields,
  teamMemberFields,
  teamEnvVarFields,
  presentationStatusValidator,
  routedThreadFields,
  routedParticipantFields,
  routedMessageFields,
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
    .index("by_source_project", ["sourceProjectId"])
    .index("by_chat_parent", ["chatParentId"]),

  artifactState: defineTable(artifactStateFields).index(
    "by_artifact_owner_key",
    ["artifactId", "ownerId", "key"],
  ),

  projects: defineTable(projectFields)
    .index("by_repo", ["repoId"])
    .index("by_repo_and_archived", ["repoId", "archivedAt"])
    .index("by_user", ["userId"])
    .index("by_repo_and_numId", ["repoId", "numId"]),

  agentTasks: defineTable(agentTaskFields)
    .index("by_repo", ["repoId"])
    .index("by_repo_and_status", ["repoId", "status"])
    .index("by_repo_status_and_archived", ["repoId", "status", "archivedAt"])
    .index("by_repo_status_archived_and_creator", [
      "repoId",
      "status",
      "archivedAt",
      "createdBy",
    ])
    .index("by_repo_and_updatedAt", ["repoId", "updatedAt"])
    .index("by_project", ["projectId"])
    .index("by_project_and_status", ["projectId", "status"])
    .index("by_repo_and_numId", ["repoId", "numId"]),

  pullRequests: defineTable(pullRequestFields)
    .index("by_pr_url", ["prUrl"])
    .index("by_session", ["owner.sessionId"])
    .index("by_task", ["owner.taskId"])
    .index("by_project", ["owner.projectId"])
    .index("by_repo_and_head_branch", ["repoId", "headBranch"])
    .index("by_repo_base_and_watch", [
      "repoId",
      "baseBranch",
      "watch.startedAt",
    ])
    .index("by_head_and_watch", ["headBranch", "watch.startedAt"]),

  agentTaskRunSummaries: defineTable({
    taskId: v.id("agentTasks"),
    repoId: v.id("githubRepos"),
    lastRunStartedAt: v.optional(v.number()),
  })
    .index("by_task", ["taskId"])
    .index("by_repo", ["repoId"]),

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

  threadParticipants: defineTable(threadParticipantFields)
    .index("by_root", ["rootId"])
    .index("by_user_and_root", ["userId", "rootId"]),

  chatReads: defineTable(chatReadFields)
    .index("by_user_parent", ["userId", "parentId"])
    .index("by_user_repo", ["userId", "repoId"]),
  standupReads: defineTable(standupReadFields).index("by_user_repo", [
    "userId",
    "repoId",
  ]),
  chatRecaps: defineTable(chatRecapFields).index("by_user_parent", [
    "userId",
    "parentId",
  ]),

  projectTaskReports: defineTable(projectTaskReportFields)
    .index("by_project", ["projectId"])
    .index("by_task_and_state", ["taskId", "state"]),
  projectTaskBatches: defineTable(projectTaskBatchFields).index("by_project", [
    "projectId",
  ]),
  projectChatTaskLinks: defineTable(projectChatTaskLinkFields).index(
    "by_project_and_message",
    ["projectId", "messageId"],
  ),
  projectCoordinatorWakes: defineTable(projectCoordinatorWakeFields)
    .index("by_project_and_key", ["projectId", "key"])
    .index("by_project_and_sent", ["projectId", "sentAt"]),
  taskActivity: defineTable(taskActivityFields).index("by_task", ["taskId"]),
  messages: defineTable(messageFields)
    .index("by_parent", ["parentId"])
    .index("by_parent_and_role", ["parentId", "role"])
    .index("by_parent_and_reply_to", ["parentId", "replyTo"])
    .index("by_reply_to", ["replyTo"])
    .index("by_parent_and_last_reply_at", ["parentId", "lastReplyAt"])
    .index("by_parent_and_annotation_page", ["parentId", "annotation.pagePath"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["parentId"],
    }),
  aveThreads: defineTable(aveThreadFields).index("by_user_and_archived", [
    "userId",
    "archivedAt",
  ]),
  aveMessages: defineTable(aveMessageFields).index("by_thread", ["threadId"]),
  queuedMessages: defineTable(queuedMessageFields)
    .index("by_parent_and_created", ["parentId", "createdAt"])
    .index("by_parent_and_order", ["parentId", "order"])
    .index("by_parent_and_reply_to_and_order", ["parentId", "replyTo", "order"]),
  sessions: defineTable(sessionFields)
    .index("by_repo", ["repoId"])
    .index("by_repo_and_deleted", ["repoId", "deletedAt"])
    .index("by_user", ["userId"])
    .index("by_repo_and_status", ["repoId", "status"])
    .index("by_status", ["status"])
    .index("by_repo_owner_deleted_and_archived_at", [
      "repoId",
      "owner.kind",
      "deletedAt",
      "archive.archivedAt",
    ])
    .index("by_repo_and_numId", ["repoId", "numId"])
    .index("by_sandbox", ["sandboxId"])
    .index("by_forked_from", ["forkedFromSessionId"])
    .index("by_session_group", ["sessionGroupId"])
    .index("by_owner_task", ["owner.taskId", "deletedAt"])
    .index("by_owner_project", ["owner.projectId"]),
  sessionChats: defineTable(sessionChatFields)
    .index("by_session", ["sessionId"])
    .index("by_repo", ["repoId"]),
  sessionRepos: defineTable(sessionRepoFields)
    .index("by_session", ["sessionId"])
    .index("by_repo", ["repoId"]),
  sessionGroups: defineTable(sessionGroupFields),
  repoGroups: defineTable(repoGroupFields)
    .index("by_created_by", ["createdBy"])
    .index("by_team", ["teamId"]),
  turns: defineTable(turnFields)
    .index("by_entity_open", ["entityId", "open"])
    .index("by_session_open", ["sessionId", "open"])
    .index("by_repo_open", ["repoId", "open"])
    .index("by_open_lease", ["open", "leaseExpiresAt"])
    .index("by_workflow", ["workflowId"]),
  chatUiPanels: defineTable(chatUiPanelFields).index("by_parent", ["parentId"]),
  chatHtmlRenders: defineTable(chatHtmlRenderFields).index("by_parent", [
    "parentId",
  ]),
  chatHtmlRenderBodies: defineTable(chatHtmlRenderBodyFields),
  envVarRequests: defineTable(envVarRequestFields).index("by_parent", [
    "parentId",
  ]),
  sessionProposals: defineTable(sessionProposalFields).index("by_parent", [
    "parentId",
  ]),
  previewToolCalls: defineTable(previewToolCallFields).index(
    "by_parent_status",
    ["parentId", "status"],
  ),
  proposedPlans: defineTable(proposedPlanFields)
    .index("by_session", ["sessionId"])
    .index("by_session_and_capture_key", ["sessionId", "captureKey"])
    .index("by_message", ["messageId"]),
  agentUsageLimits: defineTable(agentUsageLimitFields)
    .index("by_provider_account", ["provider", "providerAccountId"])
    .index("by_provider_team", ["provider", "teamId"]),
  backgroundProcesses: defineTable(backgroundProcessFields)
    .index("by_session_and_status", ["sessionId", "status"])
    .index("by_session_and_key", ["sessionId", "key"]),
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
  daemonLaunchLeases: defineTable({
    entityId: v.string(),
    expiresAt: v.number(),
  }).index("by_entity", ["entityId"]),
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
    .index("by_chat_parent", ["chatParentId"])
    .index("by_repo_and_pr_url", ["repoId", "prUrl"])
    .index("by_repo_and_numId", ["repoId", "numId"])
    .index("by_sandbox", ["sandboxId"]),

  chatLogEntries: defineTable(chatLogEntryFields)
    .index("by_source_session", ["sourceSessionId"])
    .index("by_source_task", ["sourceTaskId"])
    .index("by_source_project", ["sourceProjectId"])
    .index("by_message", ["messageId"])
    .index("by_repo", ["repoId"]),

  feedback: defineTable(feedbackFields)
    .index("by_parent", ["parentId"])
    .index("by_message_and_user", ["messageId", "userId"])
    .index("by_repo", ["repoId"]),

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
  arenaScenarios: defineTable(arenaScenarioFields).index("by_doc", ["docId"]),
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
    .index("by_user_and_thread_root_and_read", [
      "userId",
      "threadRootId",
      "read",
    ])
    .index("by_repo", ["repoId"]),
  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(v.literal("android"), v.literal("ios")),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),
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
  teams: defineTable(teamFields).index("by_created_by", ["createdBy"]),
  teamMembers: defineTable(teamMemberFields)
    .index("by_team", ["teamId"])
    .index("by_team_and_role", ["teamId", "role"])
    .index("by_user", ["userId"])
    .index("by_team_and_user", ["teamId", "userId"]),

  workProfiles: defineTable(workProfileFields)
    .index("by_team", ["teamId"])
    .index("by_team_and_user", ["teamId", "userId"])
    .index("by_team_and_role", ["teamId", "role"])
    .index("by_user", ["userId"]),

  routedThreads: defineTable(routedThreadFields)
    .index("by_team_and_lastMessage", ["teamId", "lastMessageAt"])
    .index("by_source", ["sourceKind", "sourceId"])
    .index("by_source_and_topic", ["sourceId", "topicKey"]),

  routedParticipants: defineTable(routedParticipantFields)
    .index("by_thread", ["threadId"])
    .index("by_thread_and_user", ["threadId", "userId"])
    .index("by_user_and_needsReply_and_lastMessage", [
      "userId",
      "needsReply",
      "lastMessageAt",
    ]),

  routedMessages: defineTable(routedMessageFields)
    .index("by_thread", ["threadId"])
    .index("by_thread_and_created", ["threadId", "createdAt"]),
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
  githubOauthStates: defineTable(githubOauthStateFields)
    .index("by_nonce", ["nonce"])
    .index("by_expires_at", ["expiresAt"]),
  connectedAccounts: defineTable(connectedAccountFields)
    .index("by_user", ["userId"])
    .index("by_user_and_provider", ["userId", "provider"]),
  connectorOauthStates: defineTable(connectorOauthStateFields)
    .index("by_nonce", ["nonce"])
    .index("by_expires_at", ["expiresAt"]),
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
    .index("by_pushedSha", ["pushedSha"])
    .index("by_repo", ["repoId"])
    .index("by_sandbox", ["sandboxId"]),

  changelogVotes: defineTable(changelogVoteFields).index(
    "by_run_and_user_and_item",
    ["runId", "userId", "itemIndex"],
  ),

  logs: defineTable(logFields)
    .index("by_repo", ["repoId"])
    .index("by_repo_and_created", ["repoId", "createdAt"])
    .index("by_entity_type", ["entityType"])
    .index("by_repo_and_entity", ["repoId", "entityId"])
    .index("by_project", ["projectId"]),

  repoEntityCounters: defineTable(repoEntityCounterFields).index(
    "by_repo_and_type",
    ["repoId", "entityType"],
  ),

  sandboxGitCredentials: defineTable(sandboxGitCredentialsFields)
    .index("by_sandbox_id", ["sandboxId"])
    .index("by_secret", ["secret"]),

  appSettings: defineTable(appSettingsFields),

  drafts: defineTable(draftFields)
    .index("by_user_and_task", ["userId", "taskId"])
    .index("by_user_and_project", ["userId", "projectId"])
    .index("by_user_and_session", ["userId", "sessionId"])
    .index("by_user_and_chat", ["userId", "chatId"])
    .index("by_user_and_repo", ["userId", "repoId"]),

  promptStashes: defineTable(promptStashFields).index("by_user_and_repo", [
    "userId",
    "repoId",
  ]),

  presentationSessions: defineTable({
    code: v.string(),
    hostKey: v.string(),
    slide: v.number(),
    status: presentationStatusValidator,
    lastActiveAt: v.number(),
  }).index("by_code", ["code"]),

  presentationVotes: defineTable({
    code: v.string(),
    pollId: v.string(),
    participantKey: v.string(),
    optionId: v.string(),
  })
    .index("by_code_poll", ["code", "pollId"])
    .index("by_code_poll_participant", ["code", "pollId", "participantKey"])
    .index("by_code_poll_participant_option", [
      "code",
      "pollId",
      "participantKey",
      "optionId",
    ]),
});

export default schema;
