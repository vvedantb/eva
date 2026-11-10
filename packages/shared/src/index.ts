// `UserInitials` / `UserProfileHoverCardBody` are deliberately NOT re-exported
// here. This barrel is imported by `@eva/backend`'s Convex functions, and those
// components pull in React, `@vvedantb/ui` and `convex-helpers/react` — which the
// Convex bundler cannot resolve. Import them from `@eva/shared/user-initials`.
export { getUserInitials } from "./components/getUserInitials";
export { FALLBACK_GIT_BASE_BRANCH } from "./gitDefaults";
export {
  CONVEX_ID_PATTERN,
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
  mentionTokensToEditableText,
  systemSkillTokenId,
  tokenizeMentionText,
  tokenizedToDisplayText,
  tokenizedToEditable,
  type MentionTokenMaps,
} from "./mentionText";
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
  prStateLabel,
  prStateTone,
  type PrState,
  type PrStateTone,
} from "./prState";
export {
  getNotificationAppearance,
  type NotificationAppearance,
  type NotificationIconName,
  type NotificationTone,
} from "./notificationAppearance";
