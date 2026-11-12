// `UserInitials` / `UserProfileHoverCardBody` are deliberately NOT re-exported
// here. This barrel is imported by `@eva/backend`'s Convex functions, and those
// components pull in React, `@vvedantb/ui` and `convex-helpers/react` — which the
// Convex bundler cannot resolve. Import them from `@eva/shared/user-initials`.
export { getUserInitials } from "./components/getUserInitials";
export { FALLBACK_GIT_BASE_BRANCH } from "./gitDefaults";
export {
  isProjectPreviewPhase,
  PROJECT_PREVIEW_PHASES,
} from "./projectPreview";
export {
  CONVEX_ID_PATTERN,
  MENTION_HREF_REGEX,
  MENTION_TOKEN_REGEX,
  SKILL_TOKEN_REGEX,
  buildMentionPattern,
  buildSkillPattern,
  escapeRegExp,
  formatMentionToken,
  formatSkillToken,
  harnessSkillTokenId,
  isHarnessSkillTokenId,
  isSystemSkillTokenId,
  mentionChipHref,
  mentionTokensToChipLinks,
  mentionTokensToEditableText,
  parseMentionChipHref,
  systemSkillTokenId,
  tokenizeMentionText,
  tokenizedToDisplayText,
  tokenizedToEditable,
  type MentionChipKind,
  type MentionTokenMaps,
} from "./mentionText";
export {
  carriedAccountForProvider,
  defaultAccountForProvider,
  toPickerAccounts,
  type PickerAccount,
} from "./providerAccounts";
export {
  CLAUDE_HARNESS_SKILLS,
  acceptMentionTrigger,
  dataMentionItems,
  filterMentionItems,
  findMentionTrigger,
  harnessCatalogProvider,
  harnessSlashItems,
  isClaudeSkillSourcePath,
  isInsertedTokenTrigger,
  matchesMentionQuery,
  mergeMentionItems,
  peopleMentionItems,
  selectRepoSkillsForProvider,
  shouldShowMentionPicker,
  skillSlashItems,
  type HarnessSkill,
  type InsertedToken,
  type MentionItem,
  type MentionKind,
  type MentionTrigger,
  type SlashItem,
} from "./mentionComposer";
export {
  SANDBOX_STOPPED_ALERT,
  isSandboxPausedAlert,
  sandboxPausedAlertText,
} from "./sandboxStopReason";
export {
  SANDBOX_ENGAGED_WINDOW_MS,
  SANDBOX_ENGAGEMENT_INPUT_EVENTS,
  isSandboxUserEngaged,
  sandboxPresenceRoomId,
} from "./sandboxPresence";
export {
  DEFAULT_PREVIEW_PORT,
  DESKTOP_PORT,
  EDITOR_PORT,
} from "./sandboxPorts";
export { MAX_PARALLEL_CHATS } from "./sessionChats";
export { terminalHistoryTail } from "./terminalHistory";
export { isAgentBrowsingActive } from "./agentBrowsing";
export {
  SANDBOX_STARTUP_PREFIX,
  sandboxOwnerKey,
  sandboxStartupEntityId,
} from "./sandboxOwnerKeys";
export {
  PREVIEW_WAKE_KINDS,
  previewWakePath,
  previewWakeSearchSchema,
  type PreviewWakeKind,
  type PreviewWakeParams,
  type SandboxIdlePauseMode,
} from "./previewWake";
export {
  TASK_TAGS,
  TASK_TAG_DESCRIPTIONS,
  TAG_PROBABILITY_THRESHOLD,
  MAX_GENERATED_TAGS,
  parseGeneratedTags,
  selectTagsByProbability,
  type TaskTag,
} from "./taskTags";
export { isUiImplementationTask } from "./uiTaskPrompt";
export {
  TITLE_REGENERATION_STALE_MS,
  isTitleRegenerating,
} from "./sessionTitle";
export {
  composerTraitFields,
  hasComposerTraitUpdate,
  storedComposerTraits,
  type ComposerTraitFields,
  type ComposerTraits,
  type StoredComposerTraits,
} from "./composerTraits";
export {
  FORK_PROMPT_CHAR_LIMIT,
  canForkMessage,
  collectForkPrefix,
  forkDialogSummary,
  forkThreadTitle,
  formatForkPrompt,
  type ForkTranscriptPrefix,
  type ForkTranscriptTurn,
} from "./messageFork";
export { MESSAGE_LINK_PARAM, messageLinkHref } from "./messageLink";
export { buildPrecedingUserTurns } from "./precedingUserTurns";
export {
  chatStreamingEntityId,
  findStreamingTargetMessage,
} from "./chatStreaming";
export {
  firstNameByUserId,
  firstNameFromUser,
  isOtherUserChatMessage,
  otherUserIdsInChat,
  type ChatUserAttribution,
} from "./teammateMessages";
export {
  isLivePrState,
  prStateLabel,
  prStateTone,
  type LivePrState,
  type PrState,
  type PrStateTone,
} from "./prState";
export { sessionMenuActions, type SessionMenuAction } from "./sessionMenu";
export {
  draftCountAfterRemove,
  draftsAfterRemove,
  visibleDrafts,
} from "./draftVisibility";
export {
  draftContextTitle,
  draftKindLabel,
  draftSnippet,
  mergeDrafts,
  type CommentDraftFields,
  type DraftListItem,
  type TaskDraftFields,
} from "./draftList";
export {
  chatSourceKindLabel,
  chatSourceLabel,
  chatSourceShortLabel,
  type ChatSourceKind,
  type ChatSourceLabelFields,
} from "./chatSourceLabel";
export { standupEntryHeading, standupEntryTime } from "./standup";
export {
  QUICK_TASK_FILTER_DEFAULTS,
  QUICK_TASK_LIST_DEFAULTS,
  QUICK_TASK_SORT_DEFAULTS,
  QUICK_TASK_SORT_FIELDS,
  QUICK_TASK_SORT_FIELD_LABELS,
  QUICK_TASK_TIME_RANGES,
  QUICK_TASK_TIME_RANGE_LABELS,
  activeQuickTaskFilterKeys,
  applyQuickTaskFilters,
  clearedQuickTaskFilter,
  clearedQuickTaskFilters,
  hasActiveQuickTaskFilters,
  quickTaskFilterChips,
  runAllPlan,
  startAll,
  toggleQuickTaskStatus,
  type FilterableQuickTask,
  type QuickTaskFilterChip,
  type QuickTaskFilterKey,
  type QuickTaskListFilters,
  type QuickTaskSortDir,
  type QuickTaskSortField,
  type QuickTaskTimeRange,
} from "./quickTaskFilters";
export { ENTITY_SECTION, entityHref, repoBasePath } from "./repoPath";
export {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  formatEntityNumLabel,
  groupByTaskStatus,
  priorityCompare,
  statusWorkflowOrder,
  type DisplayTaskStatus,
  type Priority,
  type TaskStatus,
} from "./taskMeta";
export {
  getNotificationAppearance,
  type NotificationAppearance,
  type NotificationIconName,
  type NotificationTone,
} from "./notificationAppearance";
export {
  collectChangedFiles,
  groupChangedFilesByRepo,
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  shouldPreviewChangedFiles,
  toRepoRelativePath,
  toSandboxFilePath,
  workspaceRepoName,
  workspaceRootPath,
  type ChangedFile,
  type ChangedFileGroup,
  type ChangedFileStep,
} from "./changedFiles";
export {
  DIFF_FILE_KINDS,
  applyIgnoreWhitespace,
  buildDiffFileEntries,
  diffFileKind,
  ignoreWhitespaceInPatch,
  lineCommentTarget,
  lineRangeCommentTarget,
  summarizeDiffSize,
  unifiedDiffLines,
  type DiffFileEntry,
  type DiffFileKind,
  type DiffFileStatus,
  type DiffSize,
  type UnifiedDiffLine,
} from "./diffFiles";
export {
  MERGE_METHODS,
  PR_LIST_STATES,
  REVIEW_EVENT_OPTIONS,
  buildSummaryComments,
  canMergePr,
  canSubmitReview,
  checkTone,
  checksHeadline,
  checksOverallTone,
  countChecks,
  githubPrUrl,
  headerBlocker,
  mergeBlocker,
  mergeButtonLabel,
  prNumberFromGithubUrl,
  prReviewers,
  revertSessionRequest,
  reviewStateMeta,
  splitSummaryComments,
  stackBlockingReason,
  stackMergeTargets,
  stackVerdict,
  verdictSuccessTitle,
  type CheckCounts,
  type MergeMethod,
  type PrBlocker,
  type PrCheck,
  type PrOverview,
  type PrRemedy,
  type PrStack,
  type PrStackEntry,
  type PullRequestListState,
  type ReviewEvent,
  type StackVerdict,
  type StatusTone,
  type SummaryComment,
} from "./prReview";
export {
  appLeafName,
  repoDisplayLabel,
  repoTileSlot,
  type RepoTileSlot,
} from "./repoTile";

export { storedRunTraits, toRunTraitArgs } from "./runTraits";
export {
  buildPrTimeline,
  groupTimelineRows,
  type ConversationEvent,
  type TimelineEvent,
  type TimelineRow,
} from "./prTimeline";
export { SANDBOX_CHAT_COPY, sandboxComposerState } from "./sandboxComposer";
export {
  ACTIVE_PROJECT_PHASES,
  BUILDABLE_PROJECT_PHASES,
  PROJECT_LIST_DEFAULTS,
  PROJECT_PHASE_LABELS,
  PROJECT_SORT_FIELDS,
  PROJECT_SORT_FIELD_LABELS,
  clearedProjectFilter,
  clearedProjectFilters,
  filterAndSortProjects,
  interviewTurnText,
  isProjectPlanning,
  newProjectSubmitBlocker,
  parseProjectSpec,
  projectFilterChips,
  projectProgressSegments,
  projectTaskSections,
  toggleHiddenProjectPhase,
  type FilterableProject,
  type ProjectFilterKey,
  type ProjectListFilters,
  type ProjectPhase,
  type ProjectSortDir,
  type ProjectSortField,
  type ProjectSpec,
  type ProjectSpecTask,
  type ProjectTaskProgress,
  type SectionableProjectTask,
} from "./projectMeta";
export { MAINTENANCE_ERROR, isMaintenanceError } from "./maintenance";
