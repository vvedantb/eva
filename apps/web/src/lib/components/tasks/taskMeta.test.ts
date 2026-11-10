import { describe, expect, it } from "vitest";
import {
  defaultQuickTaskSections,
  formatEntityNumLabel,
  groupByTaskStatus,
  priorityCompare,
  statusWorkflowOrder,
} from "@eva/shared";

// The task status, number and priority helpers the web and the phone share.

describe("task meta", () => {
  it("groups tasks into every status section in workflow order, keeping input order and dropping drafts", () => {
    const sections = groupByTaskStatus([
      { id: "a", status: "done" as const },
      { id: "b", status: "todo" as const },
      { id: "c", status: "draft" as const },
      { id: "d", status: "done" as const },
    ]);
    expect(sections.map((section) => [section.status, section.tasks.map((task) => task.id)])).toEqual([
      ["todo", ["b"]],
      ["in_progress", []],
      ["business_review", []],
      ["code_review", []],
      ["done", ["a", "d"]],
      ["cancelled", []],
    ]);
  });

  it("opens the quick-task list on tasks outside projects, newest update first", () => {
    const [todo] = defaultQuickTaskSections([
      { id: "old", status: "todo" as const, updatedAt: 1 },
      { id: "in-project", status: "todo" as const, updatedAt: 3, projectId: "p1" },
      { id: "new", status: "todo" as const, updatedAt: 2 },
    ]);
    expect(todo?.tasks.map((task) => task.id)).toEqual(["new", "old"]);
  });

  it("sorts drafts after every shown status", () => {
    expect(statusWorkflowOrder("todo")).toBe(0);
    expect(statusWorkflowOrder("draft")).toBe(6);
  });

  it("labels numbers, nested under a project when there is one", () => {
    expect(formatEntityNumLabel({ numId: 12 })).toBe("#12");
    expect(formatEntityNumLabel({ numId: 12, projectNumId: 3 })).toBe("#3/12");
    expect(formatEntityNumLabel({})).toBeNull();
  });

  it("ranks no priority below low and urgent above high", () => {
    expect(priorityCompare(undefined, "low")).toBeLessThan(0);
    expect(priorityCompare("urgent", "high")).toBeGreaterThan(0);
  });
});
