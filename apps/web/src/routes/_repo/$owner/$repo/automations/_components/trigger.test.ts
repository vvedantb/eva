import { describe, expect, it } from "bun:test";
import { automationTriggerOf, capitalise, describeTrigger } from "./trigger";

describe("automation triggers", () => {
  it("treats rows without a trigger as scheduled", () => {
    expect(automationTriggerOf({})).toEqual({ kind: "cron" });
    expect(describeTrigger({ kind: "cron" })).toBeNull();
  });

  it("describes event triggers, naming the issue label", () => {
    expect(describeTrigger({ kind: "event", events: ["ci_failed"] })).toBe(
      "Runs when CI fails on an Eva PR",
    );
    expect(describeTrigger({ kind: "event", events: ["issue_labeled"] })).toBe(
      'Runs when an issue is labelled "eva"',
    );
    expect(
      describeTrigger({ kind: "event", events: ["issue_labeled"], label: "bug" }),
    ).toBe('Runs when an issue is labelled "bug"');
  });

  it("joins several events with or", () => {
    expect(
      describeTrigger({
        kind: "event",
        events: ["pr_opened", "pr_updated", "pr_merged"],
      }),
    ).toBe(
      "Runs when a PR is opened, a commit is pushed to a PR or a PR is merged",
    );
  });

  it("sentence-cases event labels", () => {
    expect(capitalise("a PR is merged")).toBe("A PR is merged");
  });
});
