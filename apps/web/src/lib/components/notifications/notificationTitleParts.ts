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
  /** Line one: the entity's own name, or the whole title when nothing parses. */
  subject: string;
  /** Line two: what happened, e.g. `PR #678 merged`. Absent when unparsed. */
  event: string | undefined;
};

/** Punctuation left dangling once the quoted subject is lifted out of a title. */
const EDGE_PUNCTUATION = /^[\s—–\-:,]+|[\s—–\-:,]+$/g;

/** A preposition left stranded at the end of a prefix, as in `New comment on`. */
const TRAILING_PREPOSITION = /\s+(?:on|in|for|to|of|about|from)$/i;

/** First double-quoted run in a title — the backend quotes entity names. */
const QUOTED_SUBJECT = /"([^"]+)"/;

/** A subject that is nothing but one quoted run, e.g. `"Fix login"`. */
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

  // Types whose title names the actor rather than the entity ("Ada mentioned
  // you in a comment") already carry the entity separately, so no parsing is
  // needed: the context label is the subject and the whole title is the event.
  if (context) {
    return { subject: context, event: title || undefined };
  }

  const quoted = QUOTED_SUBJECT.exec(title);
  const colon = title.indexOf(": ");

  // A colon before any quote means the subject is everything after it, quotes
  // and all: `Task completed: Fix the "login" flow` must not surrender "login"
  // to the quote rule. A colon inside a quoted run (`New comment on "Parser:
  // rewrite it"`) sorts after the quote and falls through to the quote rule.
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
