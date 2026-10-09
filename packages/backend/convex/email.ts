"use node";

import sendgrid from "@sendgrid/mail";
import { requireEnv } from "./_env/requireEnv";

export interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

/** Lowercases and de-duplicates a single email or list of emails. */
function normalizeEmails(emails: string | string[] | undefined): string[] {
  if (!emails) return [];
  const emailArray = Array.isArray(emails) ? emails : [emails];
  return Array.from(new Set(emailArray.map((email) => email.toLowerCase())));
}

/**
 * Sends an email via SendGrid.
 *
 * In production (EMAIL_ENV === "production") mail is sent to the real recipients,
 * with any BCC addresses already present in to/cc removed. In every other
 * environment all mail is redirected to SENDGRID_DEV_TEST_EMAIL so test runs
 * never reach real users.
 */
export async function sendEmail(data: SendEmailPayload): Promise<void> {
  sendgrid.setApiKey(requireEnv("SENDGRID_API_KEY"));
  // SendGrid renders { email, name } as the sender display name in the inbox.
  const from = {
    email: data.from ?? requireEnv("SENDGRID_FROM_EMAIL"),
    name: "Eva",
  };

  if (process.env.EMAIL_ENV === "production") {
    const normalizedTo = normalizeEmails(data.to);
    const normalizedCc = normalizeEmails(data.cc);
    const toAndCc = new Set([...normalizedTo, ...normalizedCc]);
    const filteredBcc = normalizeEmails(data.bcc).filter(
      (email) => !toAndCc.has(email),
    );

    await sendgrid.send({
      from,
      subject: data.subject,
      html: data.html,
      to: normalizedTo,
      cc: normalizedCc,
      bcc: filteredBcc,
      replyTo: data.replyTo,
    });
    return;
  }

  // Non-production: redirect everything to the test inbox.
  await sendgrid.send({
    from,
    subject: `[dev] ${data.subject}`,
    html: data.html,
    to: requireEnv("SENDGRID_DEV_TEST_EMAIL"),
  });
}
