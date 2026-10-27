"use node";

import { requiredEnv } from "@vvedantb/server";
import { v } from "convex/values";
import { marked } from "marked";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendEmail } from "./email";
import {
  buildAutomationEmailHtml,
  buildChangelogEmailHtml,
} from "./emailTemplates";
import {
  CHANGELOG_AUTOMATION_TITLE,
  changelogVoteHmacMessage,
  parseChangelog,
  type ChangelogFeedback,
} from "./_changelog/entry";
import { hmacSha256Hex } from "./_shared/hmac";

/** Reads a required environment variable, throwing a clear error when it is missing. */
/** Builds the signed one-click feedback link for one recipient of one changelog run. */
async function changelogFeedbackUrlBuilder(
  runId: string,
  userId: string,
): Promise<(feedback: ChangelogFeedback) => string> {
  const sig = await hmacSha256Hex(
    requiredEnv("ENCRYPTION_KEY"),
    changelogVoteHmacMessage(runId, userId),
  );
  const base = `${requiredEnv("CONVEX_SITE_URL")}/api/changelog/vote`;
  return (feedback) => {
    const params = new URLSearchParams({ run: runId, user: userId, sig });
    params.set("vote", feedback.vote);
    if ("itemIndex" in feedback) params.set("item", String(feedback.itemIndex));
    return `${base}?${params}`;
  };
}

/**
 * Emails an automation's latest successful run summary to every user with email
 * notifications enabled. Scheduled by updateRunStatus when a run succeeds and
 * the automation has sendEmail enabled, so it sends exactly once per successful
 * run. A failed send is logged and skipped so it does not abort the batch.
 */
export const sendAutomationEmail = internalAction({
  args: { runId: v.id("automationRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.automations.getRunForEmail, {
      runId: args.runId,
    });
    if (!run) return null;

    const appUrl = requiredEnv("WEB_APP_URL");
    // The weekly changelog returns structured JSON and gets the card layout;
    // every other automation (and legacy markdown changelogs) gets plain HTML.
    const changelog =
      run.automationTitle === CHANGELOG_AUTOMATION_TITLE
        ? parseChangelog(run.content)
        : null;
    const contentHtml = changelog ? "" : await marked.parse(run.content);
    const recipients = await ctx.runQuery(
      internal.users.listEmailRecipients,
      {},
    );

    let sent = 0;
    const failures: string[] = [];
    for (const recipient of recipients) {
      try {
        const html = changelog
          ? buildChangelogEmailHtml({
              appUrl,
              changelog,
              publishedAt: run.publishedAt,
              feedbackUrl: await changelogFeedbackUrlBuilder(
                args.runId,
                recipient.userId,
              ),
            })
          : buildAutomationEmailHtml({
              recipientName: recipient.name,
              appUrl,
              contentHtml,
              publishedAt: run.publishedAt,
              heading: run.automationTitle,
            });
        await sendEmail({
          to: recipient.email,
          subject: `${run.automationTitle} #${run.runNumber}`,
          html,
        });
        sent += 1;
      } catch (error) {
        failures.push(`${recipient.email}: ${String(error)}`);
      }
    }

    console.log(
      `Automation email (${run.automationTitle}): ${sent} sent, ${failures.length} failed of ${recipients.length} recipients.`,
    );
    if (failures.length > 0) {
      console.error(`Automation email failures:\n${failures.join("\n")}`);
    }
    return null;
  },
});
