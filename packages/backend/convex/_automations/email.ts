/**
 * An automation run's email: drafted when the run succeeds, reviewed and
 * edited on the run, then sent to its recipients. With `emailAutoSend`
 * the draft step is skipped. `run.email.status` is the single source of truth:
 * only a `sent` email is ever delivered, and only a `draft` can change, so a
 * double click or a retry cannot send twice.
 */

import { getEvaBaseUrl } from "../_env/webAppUrl";
import { v } from "convex/values";
import { marked } from "marked";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalQuery,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import {
  CHANGELOG_AUTOMATION_TITLE,
  parseChangelog,
  type ChangelogFeedback,
} from "../_changelog/entry";
import {
  buildAutomationEmailHtml,
  buildChangelogEmailHtml,
} from "../emailTemplates";
import { authMutation, authQuery } from "../functions";
import { createNotification, getRepoHref } from "../notifications";
import { findChangelogAutomation } from "../changelog";
import {
  collectEmailRecipients,
  collectEmailRecipientsAmong,
} from "../users";
import { loadRunWithAccess } from "./helpers";
import { resolveAutomationDoc } from "./systemAutomations";

type RunEmail = NonNullable<Doc<"automationRuns">["email"]>;

const MAX_SUBJECT_CHARS = 200;

/**
 * Renders one recipient's email HTML. The send action and the review preview
 * both call this, so the preview is exactly what recipients get. The weekly
 * changelog body is JSON and gets the card layout; anything else is markdown.
 */
export function renderAutomationEmail(opts: {
  automationTitle: string;
  body: string;
  publishedAt: number;
  appUrl: string;
  recipientName?: string;
  feedbackUrl: (feedback: ChangelogFeedback) => string;
}): string {
  const changelog =
    opts.automationTitle === CHANGELOG_AUTOMATION_TITLE
      ? parseChangelog(opts.body)
      : null;
  if (changelog) {
    return buildChangelogEmailHtml({
      appUrl: opts.appUrl,
      changelog,
      publishedAt: opts.publishedAt,
      feedbackUrl: opts.feedbackUrl,
    });
  }
  return buildAutomationEmailHtml({
    recipientName: opts.recipientName,
    appUrl: opts.appUrl,
    contentHtml: marked.parse(opts.body, { async: false }),
    publishedAt: opts.publishedAt,
    heading: opts.automationTitle,
  });
}

/**
 * Who an automation's email goes to. The weekly changelog broadcasts to every
 * opted-in user; any other automation emails only the opted-in members of its
 * repo's team (or the repo's connector when the repo has no team).
 */
async function collectRunEmailRecipients(
  db: DatabaseReader,
  automation: Doc<"automations">,
) {
  if (
    automation.title === CHANGELOG_AUTOMATION_TITLE &&
    (await findChangelogAutomation(db))?._id === automation._id
  ) {
    return await collectEmailRecipients(db);
  }
  const repo = await db.get(automation.repoId);
  if (!repo) return [];
  const teamId = repo.teamId;
  if (teamId === undefined) {
    return await collectEmailRecipientsAmong(
      db,
      repo.connectedBy ? [repo.connectedBy] : [],
    );
  }
  const members = await db
    .query("teamMembers")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();
  return await collectEmailRecipientsAmong(
    db,
    members.map((member) => member.userId),
  );
}

/** This automation's count of successful runs: the email's edition number. */
async function countSuccessfulRuns(
  db: DatabaseReader,
  automationId: Id<"automations">,
): Promise<number> {
  const runs = await db
    .query("automationRuns")
    .withIndex("by_automation_and_status", (q) =>
      q.eq("automationId", automationId).eq("status", "success"),
    )
    .collect();
  return runs.length;
}

/** Marks the email sent and schedules delivery. The only path to a send. */
async function sendEmail(
  ctx: MutationCtx,
  runId: Id<"automationRuns">,
  email: RunEmail,
): Promise<void> {
  await ctx.db.patch(runId, { email: { ...email, status: "sent" } });
  await ctx.scheduler.runAfter(
    0,
    internal.automationEmail.sendAutomationEmail,
    { runId },
  );
}

/**
 * Creates a successful run's email. Without `emailAutoSend` it stays a draft
 * and the automation's creator gets an in-app notification to review it.
 */
export async function queueRunEmail(
  ctx: MutationCtx,
  run: Doc<"automationRuns">,
  automation: Doc<"automations">,
): Promise<void> {
  if (!run.resultSummary || run.email !== undefined) return;
  const title = resolveAutomationDoc(automation).title;
  const edition = await countSuccessfulRuns(ctx.db, automation._id);
  const email: RunEmail = {
    status: "draft",
    subject: `${title} #${edition}`,
    body: run.resultSummary,
  };

  if (automation.emailAutoSend === true) {
    await sendEmail(ctx, run._id, email);
    return;
  }

  await ctx.db.patch(run._id, { email });
  const repo = await ctx.db.get(automation.repoId);
  await createNotification(ctx, {
    userId: automation.createdBy,
    title: `Email draft ready: ${title}`,
    message: "Review and send it from the automation's latest run.",
    repoId: automation.repoId,
    href:
      repo && automation.numId !== undefined
        ? `${getRepoHref(repo.owner, repo.name, repo.rootDirectory)}/automations/${automation.numId}/latest`
        : undefined,
  });
}

/** Loads a run the user can access whose email is still a draft. */
async function loadDraft(
  db: DatabaseReader,
  userId: Id<"users">,
  runId: Id<"automationRuns">,
): Promise<RunEmail> {
  const { run } = await loadRunWithAccess(db, userId, runId);
  if (run.email?.status !== "draft") {
    throw new Error("This email is no longer a draft");
  }
  return run.email;
}

/** Saves edits to a draft email's subject and markdown body. */
export const updateRunEmail = authMutation({
  args: {
    runId: v.id("automationRuns"),
    subject: v.string(),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const draft = await loadDraft(ctx.db, ctx.userId, args.runId);
    const subject = args.subject.trim();
    if (subject.length === 0) throw new Error("The subject is empty");
    if (subject.length > MAX_SUBJECT_CHARS) {
      throw new Error(`The subject is over ${MAX_SUBJECT_CHARS} characters`);
    }
    if (args.body.trim().length === 0) throw new Error("The body is empty");
    await ctx.db.patch(args.runId, {
      email: { ...draft, subject, body: args.body },
    });
    return null;
  },
});

/** Sends a reviewed draft to the automation's email recipients. */
export const sendRunEmail = authMutation({
  args: { runId: v.id("automationRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const draft = await loadDraft(ctx.db, ctx.userId, args.runId);
    await sendEmail(ctx, args.runId, draft);
    return null;
  },
});

/** Drops a draft so it never sends. */
export const discardRunEmail = authMutation({
  args: { runId: v.id("automationRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const draft = await loadDraft(ctx.db, ctx.userId, args.runId);
    await ctx.db.patch(args.runId, {
      email: { ...draft, status: "discarded" },
    });
    return null;
  },
});

/**
 * The run's email rendered as the viewer would receive it, and how many people
 * it goes to. Changelog feedback links are inert here: they are signed per
 * recipient only at send time.
 */
export const previewRunEmail = authQuery({
  args: { runId: v.id("automationRuns") },
  returns: v.union(
    v.null(),
    v.object({ html: v.string(), recipientCount: v.number() }),
  ),
  handler: async (ctx, args) => {
    const { run, automation } = await loadRunWithAccess(
      ctx.db,
      ctx.userId,
      args.runId,
    );
    if (!run.email) return null;
    const [viewer, recipients] = await Promise.all([
      ctx.db.get(ctx.userId),
      collectRunEmailRecipients(ctx.db, automation),
    ]);
    return {
      html: renderAutomationEmail({
        automationTitle: resolveAutomationDoc(automation).title,
        body: run.email.body,
        publishedAt: run.finishedAt ?? run.startedAt,
        appUrl: getEvaBaseUrl(),
        recipientName: viewer?.firstName ?? viewer?.fullName,
        feedbackUrl: () => "#",
      }),
      recipientCount: recipients.length,
    };
  },
});

/**
 * A sent run's email and its recipients, for the delivery action. Null unless
 * the email is `sent`, so a draft or discarded email can never be delivered.
 * Internal use only.
 */
export const getRunForEmail = internalQuery({
  args: { runId: v.id("automationRuns") },
  returns: v.union(
    v.object({
      subject: v.string(),
      body: v.string(),
      publishedAt: v.number(),
      automationTitle: v.string(),
      recipients: v.array(
        v.object({
          userId: v.id("users"),
          email: v.string(),
          name: v.optional(v.string()),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.email?.status !== "sent") return null;
    const automation = await ctx.db.get(run.automationId);
    if (!automation) return null;
    return {
      subject: run.email.subject,
      body: run.email.body,
      publishedAt: run.finishedAt ?? run.startedAt,
      automationTitle: resolveAutomationDoc(automation).title,
      recipients: await collectRunEmailRecipients(ctx.db, automation),
    };
  },
});
