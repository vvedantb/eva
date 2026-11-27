import { describe, expect, it } from "bun:test";
import {
  PROJECT_LIST_DEFAULTS,
  searchAndSortProjects,
  newProjectSubmitBlocker,
  projectFilterChips,
  projectProgressSegments,
  projectTaskSections,
  toggleHiddenProjectPhase,
} from "@eva/shared";
import { PROJECT_STAGES } from "@eva/shared/projectView";


const project = (
  title: string,
  created: number,
  extra: { priority?: "urgent" | "low"; rawInput?: string } = {},
) => ({ title, _creationTime: created, ...extra });

describe("project meta", () => {
  it("searches title and raw input, and sorts newest first by default", () => {
    const projects = [
      project("Billing", 1),
      project("Offline drafts", 3, { rawInput: "keep a reply when the network drops" }),
      project("Old idea", 2),
    ];
    expect(searchAndSortProjects(projects, PROJECT_LIST_DEFAULTS).map((p) => p.title)).toEqual([
      "Offline drafts",
      "Old idea",
      "Billing",
    ]);
    expect(searchAndSortProjects(projects, { ...PROJECT_LIST_DEFAULTS, q: "NETWORK" }).map((p) => p.title)).toEqual([
      "Offline drafts",
    ]);
    expect(
      searchAndSortProjects(projects, { ...PROJECT_LIST_DEFAULTS, sortField: "title", sortDir: "asc" }).map((p) => p.title),
    ).toEqual(["Billing", "Offline drafts", "Old idea"]);
  });

  it("keeps the last visible column and names the active filters", () => {
    const allButOne = PROJECT_STAGES.filter((stage) => stage !== "todo");
    expect(toggleHiddenProjectPhase(allButOne, "todo", PROJECT_STAGES)).toEqual(allButOne);
    expect(toggleHiddenProjectPhase(["todo"], "todo", PROJECT_STAGES)).toEqual([]);
    expect(
      projectFilterChips({ ...PROJECT_LIST_DEFAULTS, hiddenPhases: ["todo"], sortField: "priority", sortDir: "asc" }, PROJECT_STAGES),
    ).toEqual([
      { key: "phases", label: `${PROJECT_STAGES.length - 1} Phases` },
      { key: "sortField", label: "Sort: Priority" },
      { key: "sortDir", label: "Ascending" },
    ]);
  });

  it("keeps To Do in project order, puts the latest run first elsewhere, and opens live sections", () => {
    const sections = projectTaskSections([
      { id: "t2", status: "todo" as const, createdAt: 5 },
      { id: "t1", status: "todo" as const, createdAt: 1 },
      { id: "r-old", status: "code_review" as const, createdAt: 1, lastRunStartedAt: 2 },
      { id: "r-new", status: "code_review" as const, createdAt: 1, lastRunStartedAt: 9 },
      { id: "d", status: "done" as const, createdAt: 1 },
    ]);
    expect(sections.map((s) => [s.status, s.tasks.map((t) => t.id), s.defaultOpen])).toEqual([
      ["todo", ["t2", "t1"], true],
      ["in_progress", [], false],
      ["business_review", [], false],
      ["code_review", ["r-new", "r-old"], true],
      ["done", ["d"], false],
      ["cancelled", [], false],
    ]);
  });

  it("splits progress by status in workflow order", () => {
    expect(
      projectProgressSegments({ total: 4, todo: 2, in_progress: 0, business_review: 0, code_review: 1, done: 1, cancelled: 0 }),
    ).toEqual([
      { status: "todo", ratio: 0.5, offset: 0 },
      { status: "code_review", ratio: 0.25, offset: 0.5 },
      { status: "done", ratio: 0.25, offset: 0.75 },
    ]);
  });

  it("says why Save is off", () => {
    expect(newProjectSubmitBlocker(false, " ")).toBe("Describe the project");
    expect(newProjectSubmitBlocker(true, "Body")).toBe("Creating project…");
    expect(newProjectSubmitBlocker(false, "Body")).toBeUndefined();
  });
});
