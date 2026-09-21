// `UserInitials` / `UserProfileHoverCardBody` are deliberately NOT re-exported
// here. This barrel is imported by `@eva/backend`'s Convex functions, and those
// components pull in React, `@eva/ui` and `convex-helpers/react` — which the
// Convex bundler cannot resolve. Import them from `@eva/shared/user-initials`.
export { getUserInitials } from "./components/getUserInitials";
export { FALLBACK_GIT_BASE_BRANCH } from "./gitDefaults";
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
