/**
 * Notification titles are authored in the backend as one packed sentence that
 * carries both the entity and what happened to it — `PR #678 merged — "Ship the
 * inbox" archived`, `Quick task completed: Ship the inbox`, `Assigned: "Ship the
 * inbox"`. A trailing bare `archived` after a PR merge/close is expanded to
 * `session archived` so the event line names both outcomes. Rendered whole, every
 * row in the inbox opens with the same boilerplate
 * and the part that identifies the row gets truncated away.
 *
 * This splits a title into the two lines the row renders: the subject (the
 * entity's own name) and the event phrase describing what happened to it. It is
 * pure string work on purpose — the stored titles are the only structure there
 * is, and a schema change would not retitle the notifications already in
 * people's inboxes.
 */
export type NotificationTitleParts = {
  subject: string;
  event: string | undefined;
};

const EDGE_PUNCTUATION = /^[\s—–\-:,]+|[\s—–\-:,]+$/g;

const TRAILING_PREPOSITION = /\s+(?:on|in|for|to|of|about|from)$/i;

const QUOTED_SUBJECT = /"([^"]+)"/;

const FULLY_QUOTED = /^"([^"]+)"$/;

function tidy(fragment: string): string {
  return fragment.replace(EDGE_PUNCTUATION, "").trim();
}

function unwrapQuotes(fragment: string): string {
  const wrapped = FULLY_QUOTED.exec(fragment);
  return wrapped ? wrapped[1].trim() : fragment;
}

function joinEvent(before: string, after: string): string | undefined {
  if (before && after) return `${before} · ${after}`;
  if (before) return tidy(before.replace(TRAILING_PREPOSITION, ""));
  if (after) return after;
  return undefined;
}

export function splitNotificationTitle(notification: {
  title: string;
  contextLabel?: string;
}): NotificationTitleParts {
  const title = notification.title.trim();
  const context = notification.contextLabel?.trim();

  if (context) {
    return { subject: context, event: title || undefined };
  }

  const quoted = QUOTED_SUBJECT.exec(title);
  const colon = title.indexOf(": ");

  if (colon > 0 && (!quoted || colon < quoted.index)) {
    const event = title.slice(0, colon).trim();
    const subject = unwrapQuotes(title.slice(colon + 2).trim());
    if (event && subject) return { subject, event };
  }

  const quotedSubject = quoted ? quoted[1].trim() : "";
  if (quoted && quotedSubject) {
    const before = tidy(title.slice(0, quoted.index));
    const after = tidy(title.slice(quoted.index + quoted[0].length));
    const afterEvent =
      after.toLowerCase() === "archived" &&
      /\b(?:pr\b|merged|closed)/i.test(before)
        ? "session archived"
        : after;
    return {
      subject: quotedSubject,
      event: joinEvent(before, afterEvent),
    };
  }

  return { subject: title, event: undefined };
}
