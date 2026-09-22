import { describe, expect, test } from "vitest";
import {
  MENTION_ROUTES,
  MENTION_ROUTE_CRITERIA,
  urgencyFromRouting,
} from "../convex/_mentions/routingUrgency";

/**
 * The mapping from Jev's answer to delivery loudness. Worth its own test
 * because the failure is silent in both directions: a mis-mapped `reply` means
 * a direct question sits unemailed in an inbox, and a mis-mapped `none` means
 * every offhand credit pages somebody.
 */
describe("urgencyFromRouting", () => {
  test("a direct ask is high, a heads-up normal, an incidental mention low", () => {
    expect(urgencyFromRouting("reply")).toBe("high");
    expect(urgencyFromRouting("fyi")).toBe("normal");
    expect(urgencyFromRouting("none")).toBe("low");
  });

  test("an unrecognised route falls back to normal rather than silence", () => {
    // The choice arrives off the wire. Guessing "low" would quietly drop a
    // mention that might have needed an answer; normal is where an unrouted
    // mention already sits.
    expect(urgencyFromRouting("")).toBe("normal");
    expect(urgencyFromRouting("reply ")).toBe("normal");
    expect(urgencyFromRouting("something-else")).toBe("normal");
  });

  test("every route Jev is offered maps to an urgency", () => {
    expect(MENTION_ROUTES.map(urgencyFromRouting)).toEqual([
      "high",
      "normal",
      "low",
    ]);
  });
});

describe("MENTION_ROUTE_CRITERIA", () => {
  test("describes exactly the routes Jev is asked to choose between", () => {
    expect(Object.keys(MENTION_ROUTE_CRITERIA("Ada"))).toEqual([
      ...MENTION_ROUTES,
    ]);
  });

  test("names the mentioned person, so two mentions are judged separately", () => {
    const criteria = MENTION_ROUTE_CRITERIA("Ada");
    expect(criteria.reply).toContain("Ada");
    expect(criteria.fyi).toContain("Ada");
  });
});
