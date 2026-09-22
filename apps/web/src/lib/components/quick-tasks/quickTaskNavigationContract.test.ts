import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const directory = dirname(fileURLToPath(import.meta.url));
const card = readFileSync(join(directory, "QuickTaskCard.tsx"), "utf8");
const callers = [
  "QuickTasksKanbanBoard.tsx",
  "QuickTasksListView.tsx",
  "../projects/ProjectTaskListPanel.tsx",
].map((path) => ({
  path,
  source: readFileSync(join(directory, path), "utf8"),
}));

describe("quick-task SPA navigation", () => {
  test("the stretched card link is a TanStack-aware DynamicLink", () => {
    expect(card).toContain(
      'import { DynamicLink } from "@/lib/components/DynamicLink"',
    );
    expect(card).toContain(
      "<DynamicLink to={toInternalRepoHref(href)} search={true} />",
    );
  });

  test("never falls back to a location assignment", () => {
    for (const { path, source } of callers) {
      expect(source, path).not.toMatch(/(?:window\.)?location\.href\s*=/);
    }
    expect(card).not.toMatch(/(?:window\.)?location\.href\s*=/);
  });

  test.each(callers)("$path supplies an in-app href", ({ source }) => {
    expect(source).toContain("href={");
    expect(source).toContain("/quick-tasks/");
  });

  test("selection mode cancels navigation before toggling selection", () => {
    for (const { path, source } of callers.slice(0, 2)) {
      // The second argument carries the shift modifier and the view's own
      // visible order for range selection.
      const toggleAt = source.indexOf("onToggleSelect(task._id, {");
      const preventAt = source.lastIndexOf("event.preventDefault()", toggleAt);
      expect(toggleAt, path).toBeGreaterThan(-1);
      expect(preventAt, path).toBeGreaterThan(-1);
      expect(toggleAt - preventAt, path).toBeLessThan(200);
    }
  });
});
