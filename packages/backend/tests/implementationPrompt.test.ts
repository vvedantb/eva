import { expect, test } from "bun:test";
import { buildImplementationPrompt } from "../convex/_taskWorkflow/prompts";

test("buildImplementationPrompt uses commitText for edit commits, not reviewer annotations", () => {
  // promptText may include "[author · date]"; that must not leak into git commits.
  const prompt = buildImplementationPrompt(
    { title: "Add dark mode", description: "Toggle theme", taskNumber: 12 },
    "eva/task-12",
    false,
    "apps/web",
    "vvedantb",
    "eva",
    [
      {
        commitText: "fix hover contrast on sidebar",
        promptText:
          "fix hover contrast on sidebar [alice · 2026-07-01] please bump contrast",
      },
    ],
  );

  expect(prompt).toContain("edit: fix hover contrast on sidebar");
  expect(prompt).not.toContain("edit: fix hover contrast on sidebar [alice");
  expect(prompt).toContain(
    "1. fix hover contrast on sidebar [alice · 2026-07-01] please bump contrast",
  );
});

test("buildImplementationPrompt uses feat scope without change requests", () => {
  const prompt = buildImplementationPrompt(
    { title: "Add dark mode", taskNumber: 12 },
    "eva/task-12",
    false,
    "apps/web",
    "vvedantb",
    "eva",
  );

  expect(prompt).toContain("feat(task-12): Add dark mode");
  expect(prompt).not.toContain("edit:");
});

test("buildImplementationPrompt uses feat for quick tasks", () => {
  const prompt = buildImplementationPrompt(
    { title: "Tiny tweak" },
    "eva/qt-1",
    true,
    "apps/web",
    "vvedantb",
    "eva",
  );

  expect(prompt).toContain("feat: Tiny tweak");
});
