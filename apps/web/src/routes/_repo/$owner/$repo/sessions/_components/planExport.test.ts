import { describe, expect, test } from "vitest";
import {
  buildPlanImplementationPrompt,
  proposedPlanTitle,
} from "./planExport";
import {
  findLatestProposedPlan,
  hasActionableProposedPlan,
  type ProposedPlanRow,
} from "./proposedPlanLogic";
import type { Id } from "@eva/backend";
import { z } from "zod";

const proposedPlanId = z.custom<Id<"proposedPlans">>();

test("proposed plan title is the first heading", () => {
  expect(proposedPlanTitle("# Checkout rework\n\nSteps")).toBe(
    "Checkout rework",
  );
  expect(proposedPlanTitle("no heading")).toBeNull();
});

test("buildPlanImplementationPrompt prefixes the plan", () => {
  expect(buildPlanImplementationPrompt("  # A\nB  ")).toBe(
    "PLEASE IMPLEMENT THIS PLAN:\n# A\nB",
  );
});

describe("proposed plan selection", () => {
  const older: ProposedPlanRow = {
    _id: proposedPlanId.parse("plan_old"),
    planMarkdown: "# Old",
    createdAt: 1,
    updatedAt: 1,
  };
  const newer: ProposedPlanRow = {
    _id: proposedPlanId.parse("plan_new"),
    planMarkdown: "# New",
    createdAt: 2,
    updatedAt: 3,
  };

  test("picks the most recently updated plan", () => {
    expect(findLatestProposedPlan([older, newer])?._id).toBe("plan_new");
  });

  test("actionable means not yet implemented", () => {
    expect(hasActionableProposedPlan(newer)).toBe(true);
    expect(
      hasActionableProposedPlan({ ...newer, implementedAt: 9 }),
    ).toBe(false);
    expect(hasActionableProposedPlan(null)).toBe(false);
  });
});
