"use node";

import { v } from "convex/values";
import { marked } from "marked";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendEmail } from "./email";
import { buildAutomationEmailHtml } from "./emailTemplates";
import { getEvaBaseUrl } from "./_env/webAppUrl";

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

    const appUrl = getEvaBaseUrl();
    const contentHtml = await marked.parse(run.content);
    const recipients = await ctx.runQuery(
      internal.users.listEmailRecipients,
      {},
    );

    let sent = 0;
    const failures: string[] = [];
    for (const recipient of recipients) {
      const html = buildAutomationEmailHtml({
        recipientName: recipient.name,
        appUrl,
        contentHtml,
        publishedAt: run.publishedAt,
        heading: run.automationTitle,
      });
      try {
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
