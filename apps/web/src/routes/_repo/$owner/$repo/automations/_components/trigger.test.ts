import { describe, expect, it } from "vitest";
import { automationTriggerOf, capitalise, describeTrigger } from "./trigger";

describe("automation triggers", () => {
  it("treats rows without a trigger as scheduled", () => {
    expect(automationTriggerOf({})).toEqual({ kind: "cron" });
    expect(describeTrigger({ kind: "cron" })).toBeNull();
  });

  it("describes event triggers, naming the issue label", () => {
    expect(describeTrigger({ kind: "event", event: "ci_failed" })).toBe(
      "Runs when CI fails on an Eva PR",
    );
    expect(describeTrigger({ kind: "event", event: "issue_labeled" })).toBe(
      'Runs when an issue is labelled "eva"',
    );
    expect(
      describeTrigger({ kind: "event", event: "issue_labeled", label: "bug" }),
    ).toBe('Runs when an issue is labelled "bug"');
  });

  it("sentence-cases dropdown labels", () => {
    expect(capitalise("a PR is merged")).toBe("A PR is merged");
  });
});
