import { describe, expect, it } from "vitest";
import {
  duplicateFromChoice,
  duplicateOptionKey,
  FINDING_SEVERITIES,
  MAX_DUPLICATE_CANDIDATES,
  SEVERITY_LEVELS,
  severityFromScore,
  type DuplicateCandidate,
} from "../convex/_automations/triageMapping";

// The mapping is generic over the id type, so plain strings stand in for the
// `Id<"agentTasks">` the action passes.
const tasks: Array<DuplicateCandidate<string>> = [
  { _id: "task_a", numId: 12, title: "Fix flaky login test" },
  { _id: "task_b", numId: 34, title: "Rewrite billing webhook" },
  { _id: "task_c", title: "Draft with no number" },
];

describe("severity scale", () => {
  it("keeps one level per severity, lowest first", () => {
    expect(SEVERITY_LEVELS).toHaveLength(FINDING_SEVERITIES.length);
    for (const [index, severity] of FINDING_SEVERITIES.entries()) {
      expect(SEVERITY_LEVELS[index].startsWith(`${severity}:`)).toBe(true);
    }
  });
});

describe("severityFromScore", () => {
  it("maps each whole level to its severity", () => {
    expect(severityFromScore(0)).toBe("low");
    expect(severityFromScore(1)).toBe("medium");
    expect(severityFromScore(2)).toBe("high");
    expect(severityFromScore(3)).toBe("critical");
  });

  it("rounds between levels", () => {
    expect(severityFromScore(1.4)).toBe("medium");
    expect(severityFromScore(1.6)).toBe("high");
  });

  it("clamps scores off either end of the scale", () => {
    expect(severityFromScore(-3)).toBe("low");
    expect(severityFromScore(99)).toBe("critical");
  });
});

describe("duplicateOptionKey", () => {
  it("names an option after the task number", () => {
    expect(duplicateOptionKey(12)).toBe("task-12");
  });
});

describe("duplicateFromChoice", () => {
  it("reads 'none' as no duplicate", () => {
    expect(duplicateFromChoice("none", { none: 0.9 }, tasks)).toEqual({
      duplicateProbability: 0,
    });
  });

  it("resolves a chosen task to its id, number and probability", () => {
    expect(
      duplicateFromChoice("task-34", { "task-34": 0.82, none: 0.18 }, tasks),
    ).toEqual({
      duplicateOfTaskId: "task_b",
      duplicateOfNumId: 34,
      duplicateProbability: 0.82,
    });
  });

  it("defaults the probability to 0 when Jev reported none", () => {
    expect(duplicateFromChoice("task-12", {}, tasks)).toEqual({
      duplicateOfTaskId: "task_a",
      duplicateOfNumId: 12,
      duplicateProbability: 0,
    });
  });

  it("ignores an option naming a task that is not a candidate", () => {
    expect(duplicateFromChoice("task-999", { "task-999": 1 }, tasks)).toEqual({
      duplicateProbability: 0,
    });
  });

  it("never matches a candidate without a number", () => {
    expect(duplicateFromChoice("task-undefined", {}, tasks)).toEqual({
      duplicateProbability: 0,
    });
  });
});

describe("candidate cap", () => {
  it("leaves room for the 'none' option under Jev's 255-option limit", () => {
    expect(MAX_DUPLICATE_CANDIDATES + 1).toBeLessThanOrEqual(255);
  });
});
