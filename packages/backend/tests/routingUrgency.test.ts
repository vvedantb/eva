import { describe, expect, test } from "bun:test";
import {
  MENTION_ROUTES,
  MENTION_ROUTE_CRITERIA,
  urgencyFromRouting,
} from "../convex/_mentions/routingUrgency";

describe("urgencyFromRouting", () => {
  test("a direct ask is high, a heads-up normal, an incidental mention low", () => {
    expect(urgencyFromRouting("reply")).toBe("high");
    expect(urgencyFromRouting("fyi")).toBe("normal");
    expect(urgencyFromRouting("none")).toBe("low");
  });

  test("an unrecognised route falls back to normal rather than silence", () => {
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
