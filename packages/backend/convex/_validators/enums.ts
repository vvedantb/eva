import { v } from "convex/values";

export const taskStatusValidator = v.union(
  v.literal("draft"),
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("code_review"),
  v.literal("business_review"),
  v.literal("done"),
  v.literal("cancelled"),
);

export const runStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("success"),
  v.literal("error"),
  // User-initiated cancellation. Distinct from "error" so cancelled runs are
  // not flagged as failures (no red card border, neutral timeline badge).
  v.literal("cancelled"),
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

export const sessionStatusValidator = v.union(
  v.literal("active"),
  v.literal("starting"),
  v.literal("stopping"),
  v.literal("closed"),
);

export const phaseValidator = v.union(
  v.literal("draft"),
  v.literal("finalized"),
  v.literal("in_progress"),
  v.literal("business_review"),
  v.literal("code_review"),
  v.literal("completed"),
  v.literal("cancelled"),
);

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

export const evalFixStatusValidator = v.union(
  v.literal("fixing"),
  v.literal("fix_completed"),
  v.literal("fix_error"),
);

export const themeValidator = v.union(
  v.literal("light"),
  v.literal("dark"),
  v.literal("neutral"),
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

export const taskSandboxStatusValidator = v.union(
  v.literal("starting"),
  v.literal("active"),
  v.literal("stopping"),
  v.literal("closed"),
);

export const findingSeverityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

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
