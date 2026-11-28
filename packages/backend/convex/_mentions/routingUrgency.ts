/** The three answers Jev picks between. */
export const MENTION_ROUTES = ["reply", "fyi", "none"] as const;

export type MentionRoute = (typeof MENTION_ROUTES)[number];

/** Delivery loudness a route maps to. Mirrors `notificationUrgencyValidator`. */
export type MentionUrgency = "low" | "normal" | "high";

/**
 * Per-option descriptions for the routing question, named after the person who
 * was mentioned — the distinction is about what the author wants *from them*,
 * so a generic "the reader" wording muddles messages that mention two people
 * for different reasons.
 */
export const MENTION_ROUTE_CRITERIA = (
  mentioned: string,
): Record<MentionRoute, string> => ({
  reply: `the author asks ${mentioned} a question or requests an action or decision from them`,
  fyi: `keeps ${mentioned} informed; no action is requested`,
  none: "incidental: credit, attribution or a passing reference",
});

/**
 * Turns Jev's chosen route into an urgency. Takes a plain string because the
 * answer arrives off the wire: an unrecognised route falls back to `normal`,
 * the same place an unrouted mention sits, rather than silencing a mention
 * that might have needed a reply.
 */
export function urgencyFromRouting(choice: string): MentionUrgency {
  switch (choice) {
    case "reply":
      return "high";
    case "none":
      return "low";
    default:
      return "normal";
  }
}
