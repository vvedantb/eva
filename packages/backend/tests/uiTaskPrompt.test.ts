import { describe, it, expect } from "bun:test";
import { isUiImplementationTask } from "@eva/shared/uiTaskPrompt";
import {
  buildImplementationSteps,
  buildSummarySection,
  detectUiImplementationTask,
} from "../convex/_agentTasks/uiImplementationPrompt";

describe("isUiImplementationTask", () => {
  it("detects UI keywords in title", () => {
    expect(
      isUiImplementationTask({
        title:
          "on users may page, dropdown scrollbar always visible for user type",
      }),
    ).toBe(true);
  });

  it("detects structured UI description sections", () => {
    expect(
      isUiImplementationTask({
        title: "Fix thing",
        description: "## Route\n/domcare/users-may",
      }),
    ).toBe(true);
  });

  it("returns false for backend-only tasks", () => {
    expect(
      isUiImplementationTask({
        title: "Add cron job to purge stale sessions",
        description: "Run nightly in convex/crons.ts",
      }),
    ).toBe(false);
  });
});

describe("ui implementation prompt sections", () => {
  const typecheck = "cd /tmp/repo && npx tsc";
  const commit = "feat: test";
  const branch = "eva/project-1";

  it("includes locate-the-UI step for UI tasks", () => {
    const steps = buildImplementationSteps(typecheck, commit, branch, true);
    expect(steps).toMatch(/Locate the UI \(required before editing\)/);
    expect(steps).toMatch(/Do NOT change unrelated Selects\/dropdowns/);
  });

  it("omits UI locate step for backend tasks", () => {
    const steps = buildImplementationSteps(typecheck, commit, branch, false);
    expect(steps).not.toMatch(/Locate the UI \(required before editing\)/);
  });

  it("uses UI summary rules when task looks like UI work", () => {
    const uiTask = detectUiImplementationTask({
      title: "Profile type filter scrollbar on users-may list",
    });
    expect(uiTask).toBe(true);
    const summary = buildSummarySection(uiTask);
    expect(summary).toMatch(/route and the specific control you changed/);
    expect(summary).toMatch(/Do NOT claim "No user-facing routes changed"/);
  });

  it("uses default summary rules for backend tasks", () => {
    const uiTask = detectUiImplementationTask({
      title: "Migrate webhook handler to new schema",
    });
    expect(uiTask).toBe(false);
    const summary = buildSummarySection(uiTask);
    expect(summary).toMatch(/No user-facing routes changed/);
    expect(summary).not.toMatch(/specific control you changed/);
  });

  it("detects UI work from route/control description sections", () => {
    expect(
      detectUiImplementationTask({
        title: "Minor tweak",
        description:
          "## Route\n/domcare/users-may\n\n## Control\nProfile type filter",
      }),
    ).toBe(true);
  });
});
