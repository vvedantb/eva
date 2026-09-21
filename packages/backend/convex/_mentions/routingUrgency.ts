/**
 * How a chat `@`-mention is routed, and what that means for delivery.
 *
 * Being named in a message covers three very different things — a direct
 * question, a heads-up, and an offhand credit — and today all three arrive the
 * same way: an inbox row plus an email fifteen minutes later. Jev is asked
 * which one it is, and the answer picks the delivery. Nothing is dropped: an
 * incidental mention still lands in the inbox, just quietly.
 *
 * Pure so the mapping can be tested without the gateway. The prompt criteria
 * live here too, beside the mapping they feed, rather than in the `"use node"`
 * action that sends them.
 */

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
