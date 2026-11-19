import { v, type Infer } from "convex/values";

/**
 * A Convex union of string literals built from one tuple, so a runtime list
 * (nuqs parsers, Zod enums, pickers) and its validator cannot drift.
 */
export function literalUnion<const Values extends readonly [string, ...string[]]>(
  values: Values,
) {
  return v.union(...values.map((value) => v.literal<Values[number]>(value)));
}

/** Every task status, in the validator's order (draft first). */
export const ALL_TASK_STATUSES = [
  "draft",
  "todo",
  "in_progress",
  "code_review",
  "business_review",
  "done",
  "cancelled",
] as const;
export const taskStatusValidator = literalUnion(ALL_TASK_STATUSES);
type TaskStatus = Infer<typeof taskStatusValidator>;

/** Task statuses still in flight (not done, cancelled, or draft). */
export const OPEN_TASK_STATUSES = [
  "todo",
  "in_progress",
  "code_review",
  "business_review",
] as const satisfies readonly TaskStatus[];

/** Every task status but draft: what task lists and pickers show. */
export const NON_DRAFT_TASK_STATUSES = [
  ...OPEN_TASK_STATUSES,
  "done",
  "cancelled",
] as const satisfies readonly TaskStatus[];

export const RUN_STATUSES = [
  "queued",
  "running",
  "success",
  "error",
  // User-initiated cancellation. Distinct from "error" so cancelled runs are
  // not flagged as failures (no red card border, neutral timeline badge).
  "cancelled",
] as const;
export const runStatusValidator = v.union(
  ...RUN_STATUSES.map((status) => v.literal(status)),
);

export const logLevelValidator = v.union(
  v.literal("info"),
  v.literal("warn"),
  v.literal("error"),
);

export const roleValidator = v.union(v.literal("user"), v.literal("assistant"));

// What a reaction is attached to within a task. `comment` targets a
// `taskComments` doc (targetId = commentId); `description` targets the task's
// own description field (targetId = taskId).
export const reactionTargetValidator = v.union(
  v.literal("comment"),
  v.literal("description"),
);

/** Composer interaction mode: Build (default) vs Claude-native Plan. */
export const INTERACTION_MODES = ["default", "plan"] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];
export const interactionModeValidator = v.union(
  v.literal("default"),
  v.literal("plan"),
);

/** A chat's sandbox lifecycle: sessions, tasks and projects share it. */
export const SANDBOX_STATUSES = [
  "active",
  "starting",
  "stopping",
  "closed",
] as const;
export const sessionStatusValidator = literalUnion(SANDBOX_STATUSES);

/** A project's phase, in workflow order. */
export const PROJECT_PHASES = [
  "draft",
  "finalized",
  "in_progress",
  "business_review",
  "code_review",
  "completed",
  "cancelled",
] as const;
export const phaseValidator = literalUnion(PROJECT_PHASES);

export const indexingStatusValidator = v.union(
  v.literal("pending"),
  v.literal("indexing"),
  v.literal("complete"),
  v.literal("error"),
);

export const prRecapStatusValidator = v.union(
  v.literal("pending"),
  v.literal("ready"),
  v.literal("error"),
);

export const CHAT_LOG_ENTRY_KINDS = [
  "decision",
  "change",
  "research",
  "question",
  "note",
] as const;
export const chatLogEntryKindValidator = literalUnion(CHAT_LOG_ENTRY_KINDS);
export type ChatLogEntryKind = Infer<typeof chatLogEntryKindValidator>;

export const FEEDBACK_SENTIMENTS = ["positive", "negative"] as const;
export const feedbackSentimentValidator = literalUnion(FEEDBACK_SENTIMENTS);
export type FeedbackSentiment = Infer<typeof feedbackSentimentValidator>;

/** "user": thumbs on a turn. "agent": `submit_feedback` from the sandbox. */
export const FEEDBACK_AUTHORS = ["user", "agent"] as const;
export const feedbackAuthorValidator = literalUnion(FEEDBACK_AUTHORS);

export const chatLogAuthorValidator = v.union(
  v.literal("agent"),
  v.literal("user"),
  v.literal("system"),
);

export const docKindValidator = v.union(
  v.literal("document"),
  v.literal("pr-recap"),
);

/** Marks PR recaps generated from Eva sandbox work (hidden from Documents sidebar). */
export const prRecapOriginValidator = v.literal("eva");

export const docVersionSourceValidator = v.union(
  v.literal("recap-regeneration"),
  v.literal("manual"),
);

export const evaluationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("error"),
);

/** Which Testing Arena check a report holds: spec-vs-code review or browser scenarios. */
export const evaluationKindValidator = v.union(
  v.literal("code"),
  v.literal("browser"),
);

/** What started a Testing Arena run. Absent on manual runs. */
export const evaluationTriggerValidator = v.literal("pr");

export const evalFixStatusValidator = v.union(
  v.literal("fixing"),
  v.literal("fix_completed"),
  v.literal("fix_error"),
);

/**
 * Theme preference, not resolved appearance. "system" is a real, persisted
 * choice: the client resolves it against `prefers-color-scheme` on every boot.
 */
export const themeValidator = v.union(
  v.literal("light"),
  v.literal("dark"),
  v.literal("neutral"),
  v.literal("system"),
);

export const auditSeverityValidator = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);

export const priorityValidator = v.union(
  v.literal("urgent"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);

export const notificationTypeValidator = v.union(
  v.literal("routine_complete"),
  v.literal("export_ready"),
  v.literal("task_complete"),
  v.literal("task_assigned"),
  v.literal("status_changed"),
  v.literal("comment_added"),
  v.literal("changes_requested"),
  v.literal("comment_reply"),
  v.literal("mention"),
  v.literal("run_completed"),
  v.literal("run_failed"),
  v.literal("rate_limit"),
  v.literal("system"),
  // Inbox-only: session auto-archived because its GitHub PR closed or merged.
  v.literal("session_archived"),
  // Eva routed a clarification to a teammate (answered in Manager Ave).
  v.literal("routed_question"),
);

/** The chat surfaces: a session, a quick task or a project. */
export const CHAT_ENTITY_KINDS = ["session", "task", "project"] as const;
/** The chat surface a sandbox MCP token or activity row names. */
export const chatEntityKindValidator = v.union(
  ...CHAT_ENTITY_KINDS.map((kind) => v.literal(kind)),
);
export type ChatEntityKind = Infer<typeof chatEntityKindValidator>;

/** The chat a routed question came from. */
export const routedSourceKindValidator = chatEntityKindValidator;

export const routedThreadStatusValidator = v.union(
  v.literal("open"),
  v.literal("waiting_human"),
  v.literal("waiting_eva"),
  v.literal("resolved"),
  v.literal("cancelled"),
);

export const routedAuthorKindValidator = v.union(
  v.literal("eva"),
  v.literal("user"),
);

export const errorTypeValidator = v.union(
  v.literal("rate_limit"),
  v.literal("generic"),
);

export const deploymentStatusValidator = v.union(
  v.literal("queued"),
  v.literal("building"),
  v.literal("deployed"),
  v.literal("error"),
);

export const roleUserValidator = v.union(
  v.literal("business"),
  v.literal("dev"),
  v.literal("designer"),
);
export type RoleUser = Infer<typeof roleUserValidator>;

export const snapshotScheduleValidator = v.string();

export const snapshotBuildStatusValidator = v.union(
  v.literal("running"),
  v.literal("success"),
  v.literal("error"),
);

export const snapshotBuildTriggerValidator = v.union(
  v.literal("cron"),
  v.literal("manual"),
);

// "base" = base Image only (app has no Stop Commands). "seeded" = app boots and
// seeds its DB before capture (app has Stop Commands). A forceImageRebuild that
// also seeds is still "seeded" — the base rebuild is an implementation detail.
export const snapshotBuildKindValidator = v.union(
  v.literal("base"),
  v.literal("seeded"),
);

export const sandboxProviderKindValidator = v.literal("vercel");

export const teamMemberRoleValidator = v.union(
  v.literal("owner"),
  v.literal("member"),
);

export const runModeValidator = v.union(
  v.literal("implementation"),
  v.literal("resolve_conflicts"),
);

export const activityLogTypeValidator = v.literal("run");

export const webhookEventStatusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("skipped"),
);

export const accentColorValidator = v.union(
  v.literal("zinc"),
  v.literal("red"),
  v.literal("orange"),
  v.literal("amber"),
  v.literal("yellow"),
  v.literal("lime"),
  v.literal("green"),
  v.literal("emerald"),
  v.literal("teal"),
  v.literal("cyan"),
  v.literal("sky"),
  v.literal("blue"),
  v.literal("indigo"),
  v.literal("violet"),
  v.literal("purple"),
  v.literal("fuchsia"),
  v.literal("pink"),
  v.literal("rose"),
  v.literal("slate"),
  v.literal("gray"),
  v.literal("neutral"),
  v.literal("stone"),
  v.literal("taupe"),
  v.literal("mauve"),
  v.literal("mist"),
  v.literal("olive"),
);

/** The monochrome accent a user has before picking one. */
export const DEFAULT_ACCENT_COLOR = "zinc" satisfies Infer<
  typeof accentColorValidator
>;

export const radiusValidator = v.union(
  v.literal("none"),
  v.literal("sm"),
  v.literal("md"),
  v.literal("lg"),
  v.literal("xl"),
  v.literal("full"),
);

export const fontFamilyValidator = v.union(
  v.literal("inter"),
  v.literal("roboto"),
  v.literal("poppins"),
  v.literal("dm-sans"),
  v.literal("space-grotesk"),
  v.literal("host-grotesk"),
  v.literal("geist"),
  v.literal("source-serif"),
  v.literal("jakarta"),
  v.literal("outfit"),
  v.literal("nunito"),
  v.literal("ibm-plex"),
  v.literal("figtree"),
);

export const letterSpacingValidator = v.union(
  v.literal("tighter"),
  v.literal("tight"),
  v.literal("normal"),
  v.literal("wide"),
  v.literal("wider"),
);


export const FINDING_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export const findingSeverityValidator = v.union(
  ...FINDING_SEVERITIES.map((severity) => v.literal(severity)),
);
export type FindingSeverity = Infer<typeof findingSeverityValidator>;

export const taskSandboxEventValidator = v.union(
  v.literal("started"),
  v.literal("reconnected"),
  v.literal("stopped"),
  v.literal("stop_failed"),
  v.literal("failed"),
);

export const taskActivityFieldValidator = v.union(
  v.literal("status"),
  v.literal("assignee"),
  v.literal("project"),
  v.literal("priority"),
  v.literal("title"),
  v.literal("description"),
  v.literal("tags"),
  v.literal("model"),
  v.literal("baseBranch"),
  // GitHub PR merged/closed event. newValue is "merged" or "closed"; the
  // resulting task status (done/cancelled) is implied and rendered client-side.
  v.literal("pr"),
);

/** Lifecycle of an agent-spawned background Bash shell in a session sandbox. */
export const backgroundProcessStatusValidator = v.union(
  v.literal("running"),
  v.literal("exited"),
  v.literal("killed"),
);

/**
 * Agent provider whose plan usage limits eva tracks. Narrower than
 * `aiProviderValidator` on purpose: only a provider that reports real plan
 * windows can have a row, so the UI never has to handle a windowless one.
 * Cursor is absent because it exposes no plan limits at all — its spend is the
 * per-turn cost gauge's business, not this table's.
 */
export const usageLimitProviderValidator = v.literal("claude");

/** Whether the plan currently allows requests, as reported by the agent SDK. */
export const usageLimitStatusValidator = v.union(
  v.literal("allowed"),
  v.literal("allowed_warning"),
  v.literal("rejected"),
);

/**
 * How much of the provider's plan state the latest observation actually
 * covered. "no windows" has three different causes, and collapsing them into
 * one absent-windows case is what made this feature wrong three times:
 *
 * - `complete`: an authoritative `/usage` response. Whatever it lists is the
 *   whole picture, so the row is replaced and an empty list genuinely means the
 *   plan has no windows (Team/Enterprise seats).
 * - `partial`: observed in passing — a single `rate_limit_event` window, or a
 *   refusal message. Merged into the stored row, never authoritative.
 * - `refused`: the provider answered and declined to report plan limits
 *   (`rate_limits_available: false`). Different from "we never asked".
 */
export const usageLimitCompletenessValidator = v.union(
  v.literal("complete"),
  v.literal("partial"),
  v.literal("refused"),
);

/**
 * How loudly a notification should be delivered. Set by mention routing today
 * (reply → high, fyi → normal, incidental → low):
 *
 * - `high`: instant email shortly after the notification lands.
 * - `normal`: daily digest only.
 * - `low`: inbox only — no email, no digest, no toast or chime.
 *
 * Absent means "not routed yet" (a mention whose routing action has not landed)
 * or a row created before urgency existed; both are treated as normal.
 */
export const notificationUrgencyValidator = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high"),
);

export const presentationStatusValidator = v.union(
  v.literal("live"),
  v.literal("ended"),
);

/**
 * Artifact state scope (`window.cowork.state`). "user" is private to the
 * viewer; "shared" is one copy for the artifact's bound team.
 */
export const ARTIFACT_STATE_SCOPES = ["user", "shared"] as const;
export const artifactStateScopeValidator = v.union(
  ...ARTIFACT_STATE_SCOPES.map((scope) => v.literal(scope)),
);
export type ArtifactStateScope = Infer<typeof artifactStateScopeValidator>;
