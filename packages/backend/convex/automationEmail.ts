"use node";

import { requiredEnv } from "@vvedantb/server";
import { getEvaBaseUrl } from "./_env/webAppUrl";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendEmail } from "./email";
import { renderAutomationEmail } from "./_automations/email";
import {
  changelogVoteHmacMessage,
  type ChangelogFeedback,
} from "./_changelog/entry";
import { hmacSha256Hex } from "./_shared/hmac";

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
 * Delivers a run's `sent` email to every user with email notifications
 * enabled. Scheduled once, by the mutation that marks the email sent (auto-send
 * or a reviewed draft). A failed send is logged and skipped so it does not
 * abort the batch.
 */
export const sendAutomationEmail = internalAction({
  args: { runId: v.id("automationRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.automations.getRunForEmail, {
      runId: args.runId,
    });
    if (!run) return null;

    const appUrl = getEvaBaseUrl();
    const recipients = await ctx.runQuery(
      internal.users.listEmailRecipients,
      {},
    );

    let sent = 0;
    const failures: string[] = [];
    for (const recipient of recipients) {
      try {
        const html = renderAutomationEmail({
          automationTitle: run.automationTitle,
          body: run.body,
          publishedAt: run.publishedAt,
          appUrl,
          recipientName: recipient.name,
          feedbackUrl: await changelogFeedbackUrlBuilder(
            args.runId,
            recipient.userId,
          ),
        });
        await sendEmail({ to: recipient.email, subject: run.subject, html });
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
