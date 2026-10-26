"use node";

import { requiredEnv } from "@vvedantb/server";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendEmail } from "./email";
import { buildNotificationDigestHtml } from "./emailTemplates";

/** Reads a required environment variable, throwing a clear error when it is missing. */
/**
 * Sends the daily unread-notification digest. For every user with an email and
 * at least one unread notification, builds an HTML summary and emails it.
 * One failed send is logged and skipped so it does not abort the whole batch.
 * Invoked by the daily cron (see crons.ts).
 */
export const sendDailyDigests = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const appUrl = requiredEnv("WEB_APP_URL");
    // Only summarise notifications from the past 24 hours, matching the daily
    // cadence — older unread items stay in the in-app inbox.
    const since = Date.now() - 24 * 60 * 60 * 1000;
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
        subtext: "From the past 24 hours",
      });
      try {
        await sendEmail({
          to: recipient.email,
          subject: `You have ${count} unread notification${count === 1 ? "" : "s"}`,
          html,
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
