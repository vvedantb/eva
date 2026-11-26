"use node";

import { getEvaBaseUrl } from "./_env/webAppUrl";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendEmail } from "./email";
import { buildNotificationDigestHtml } from "./emailTemplates";
import { digestWindowStart } from "./_notifications/digestWindow";

/**
 * Sends the daily unread-notification digest. For every user with an email and
 * at least one unread, not yet emailed notification since the previous weekday
 * run, builds an HTML summary, emails it and stamps the rows `emailedAt`, so
 * the instant email never sends them again. One failed send is logged and
 * skipped so it does not abort the whole batch. Invoked by the cron (crons.ts).
 */
export const sendDailyDigests = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const appUrl = getEvaBaseUrl();
    // Since the previous weekday run: Monday covers the weekend. Older unread
    // items stay in the in-app inbox.
    const since = digestWindowStart(Date.now());
    const recipients = await ctx.runQuery(
      internal.notifications.getDigestRecipients,
      { since },
    );

    let sent = 0;
    const failures: string[] = [];
    for (const recipient of recipients) {
      const count = recipient.notifications.length;
      const html = buildNotificationDigestHtml({
        recipientName: recipient.name,
        appUrl,
        notifications: recipient.notifications,
        subtext: "Since the last digest",
      });
      try {
        await sendEmail({
          to: recipient.email,
          subject: `You have ${count} unread notification${count === 1 ? "" : "s"}`,
          html,
        });
        await ctx.runMutation(internal.notifications.markEmailed, {
          notificationIds: recipient.notifications.map((n) => n.id),
        });
        sent += 1;
      } catch (error) {
        failures.push(`${recipient.email}: ${String(error)}`);
      }
    }

    console.log(
      `Daily digest: ${sent} sent, ${failures.length} failed of ${recipients.length} recipients.`,
    );
    if (failures.length > 0) {
      console.error(`Daily digest failures:\n${failures.join("\n")}`);
    }
    return null;
  },
});
