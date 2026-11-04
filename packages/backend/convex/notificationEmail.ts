"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendEmail } from "./email";
import { buildNotificationDigestHtml } from "./emailTemplates";
import { getEvaBaseUrl } from "./_env/webAppUrl";

/**
 * Sends the instant notification email for a user, debounced via the scheduler
 * delay in createNotification. It re-reads the user's unread, not-yet-emailed,
 * high-signal notifications at send time, so anything read in-app during the
 * delay is silently skipped and a burst collapses into a single email. A single
 * item leads with its own title; multiple are summarised by count. Marking the
 * items emailed keeps the daily digest from repeating them.
 */
export const sendUnreadForUser = internalAction({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.notifications.getUnreadEmailableForUser,
      { userId: args.userId },
    );
    if (!data) return null;

    const appUrl = getEvaBaseUrl();
    const count = data.notifications.length;
    const [first] = data.notifications;

    // A single item leads with its own title for immediacy; a burst is summarised
    // by count. The `if` narrows `first` to defined for the single-item branch.
    let subject: string;
    let heading: string | undefined;
    if (count === 1 && first !== undefined) {
      subject = first.title;
      heading = "New activity";
    } else {
      subject = `You have ${count} new notifications`;
      heading = undefined;
    }

    const html = buildNotificationDigestHtml({
      recipientName: data.name,
      appUrl,
      notifications: data.notifications,
      heading,
    });

    await sendEmail({ to: data.email, subject, html });
    await ctx.runMutation(internal.notifications.markEmailed, {
      notificationIds: data.notifications.map((n) => n.id),
    });
    return null;
  },
});
