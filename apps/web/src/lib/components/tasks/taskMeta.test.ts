import { describe, expect, it } from "vitest";
import {
  QUICK_TASK_LIST_DEFAULTS,
  applyQuickTaskFilters,
  clearedQuickTaskFilters,
  formatEntityNumLabel,
  groupByTaskStatus,
  priorityCompare,
  quickTaskFilterChips,
  runAllPlan,
  startAll,
  statusWorkflowOrder,
  toggleQuickTaskStatus,
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
    const shown = applyQuickTaskFilters(
      [
        { id: "old", title: "Old", status: "todo" as const, createdAt: 1, updatedAt: 1 },
        { id: "in-project", title: "P", status: "todo" as const, createdAt: 1, updatedAt: 3, projectId: "p1" },
        { id: "draft", title: "D", status: "draft" as const, createdAt: 1, updatedAt: 4 },
        { id: "new", title: "New", status: "todo" as const, createdAt: 1, updatedAt: 2 },
      ],
      QUICK_TASK_LIST_DEFAULTS,
      10,
    );
    expect(shown.map((task) => task.id)).toEqual(["new", "old"]);
  });

  it("searches, filters and sorts the quick-task list as the toolbar picks", () => {
    const day = 24 * 60 * 60 * 1000;
    const now = 100 * day;
    const tasks = [
      { id: "a", title: "Fix footer", status: "todo" as const, createdAt: now - day, updatedAt: 1, createdBy: "u1", tags: ["ui"], priority: "low" as const },
      { id: "b", title: "Bump deps", description: "footer too", status: "done" as const, createdAt: now - 2 * day, updatedAt: 2, createdBy: "u2", assignedTo: "u1", priority: "urgent" as const },
      { id: "c", title: "Old footer", status: "todo" as const, createdAt: now - 40 * day, updatedAt: 3, createdBy: "u1" },
    ];
    const pick = (patch: Partial<typeof QUICK_TASK_LIST_DEFAULTS>) =>
      applyQuickTaskFilters(tasks, { ...QUICK_TASK_LIST_DEFAULTS, ...patch }, now).map((task) => task.id);
    // The search reads the title and the description.
    expect(pick({ q: "FOOTER", sortField: "priority" })).toEqual(["b", "a", "c"]);
    expect(pick({ timeRange: "30d", sortField: "created", sortDir: "asc" })).toEqual(["b", "a"]);
    expect(pick({ user: "u1", tags: ["ui"] })).toEqual(["a"]);
    expect(pick({ assignee: "unassigned" })).toEqual(["c", "a"]);
    expect(pick({ statuses: ["done"] })).toEqual(["b"]);
    expect(pick({ sortField: "title", sortDir: "asc" })).toEqual(["b", "a", "c"]);
  });

  it("names the active filters as chips and clears them back to the defaults", () => {
    const filters = { ...QUICK_TASK_LIST_DEFAULTS, project: "all", assignee: "u1", statuses: toggleQuickTaskStatus(QUICK_TASK_LIST_DEFAULTS.statuses, "done") };
    expect(quickTaskFilterChips(filters, { project: () => undefined, user: () => "Ada" })).toEqual([
      { key: "project", text: "All Projects" },
      { key: "assignee", text: "Code reviewer: ", person: "Ada" },
      { key: "statuses", text: "5 Statuses" },
    ]);
    expect(quickTaskFilterChips({ ...filters, ...clearedQuickTaskFilters() }, { project: () => undefined, user: () => undefined })).toEqual([]);
    // The last status cannot be turned off: an empty filter would hide every task.
    expect(toggleQuickTaskStatus(["todo"], "todo")).toEqual(["todo"]);
  });

  it("runs only the user's own To Do tasks on Run All and counts the ones that fail to start", async () => {
    const plan = runAllPlan(
      [
        { id: "mine", status: "todo" as const, createdBy: "me" },
        { id: "theirs", status: "todo" as const, createdBy: "them" },
        { id: "done", status: "done" as const, createdBy: "me" },
        { id: "broken", status: "todo" as const, createdBy: "me" },
      ],
      "me",
    );
    expect(plan.owned.map((task) => task.id)).toEqual(["mine", "broken"]);
    expect(plan.skippedCount).toBe(1);
    const failed = await startAll(plan.owned, async (task) => {
      if (task.id === "broken") throw new Error("already running");
    });
    expect(failed).toBe(1);
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
