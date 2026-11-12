import { describe, expect, it } from "vitest";
import { PROJECT_PHASES } from "@eva/backend";
import {
  PROJECT_LIST_DEFAULTS,
  filterAndSortProjects,
  interviewTurnText,
  newProjectSubmitBlocker,
  parseProjectSpec,
  projectFilterChips,
  projectProgressSegments,
  projectTaskSections,
  toggleHiddenProjectPhase,
} from "@eva/shared";

// The project list, task list and new-project helpers the web and the phone share.

const project = (
  title: string,
  phase: (typeof PROJECT_PHASES)[number],
  created: number,
  extra: { priority?: "urgent" | "low"; rawInput?: string } = {},
) => ({ title, phase, _creationTime: created, ...extra });

describe("project meta", () => {
  it("hides blocked phases, searches title and raw input, and sorts newest first by default", () => {
    const projects = [
      project("Billing", "in_progress", 1),
      project("Offline drafts", "draft", 3, { rawInput: "keep a reply when the network drops" }),
      project("Old idea", "cancelled", 2),
    ];
    expect(filterAndSortProjects(projects, PROJECT_LIST_DEFAULTS).map((p) => p.title)).toEqual([
      "Offline drafts",
      "Old idea",
      "Billing",
    ]);
    expect(
      filterAndSortProjects(projects, { ...PROJECT_LIST_DEFAULTS, hiddenPhases: ["cancelled"] }).map((p) => p.title),
    ).toEqual(["Offline drafts", "Billing"]);
    expect(filterAndSortProjects(projects, { ...PROJECT_LIST_DEFAULTS, q: "NETWORK" }).map((p) => p.title)).toEqual([
      "Offline drafts",
    ]);
    expect(
      filterAndSortProjects(projects, { ...PROJECT_LIST_DEFAULTS, sortField: "title", sortDir: "asc" }).map((p) => p.title),
    ).toEqual(["Billing", "Offline drafts", "Old idea"]);
  });

  it("keeps the last visible phase and names the active filters", () => {
    const allButOne = PROJECT_PHASES.filter((phase) => phase !== "draft");
    expect(toggleHiddenProjectPhase(allButOne, "draft", PROJECT_PHASES)).toEqual(allButOne);
    expect(toggleHiddenProjectPhase(["draft"], "draft", PROJECT_PHASES)).toEqual([]);
    expect(
      projectFilterChips({ ...PROJECT_LIST_DEFAULTS, hiddenPhases: ["draft"], sortField: "priority", sortDir: "asc" }, PROJECT_PHASES),
    ).toEqual([
      { key: "phases", label: `${PROJECT_PHASES.length - 1} Phases` },
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

  it("says why Create Project is off", () => {
    expect(newProjectSubmitBlocker(false, " ", "")).toBe("Enter a project title and description");
    expect(newProjectSubmitBlocker(false, "Title", " ")).toBe("Enter a description");
    expect(newProjectSubmitBlocker(false, "Title", "Body")).toBeUndefined();
  });

  it("reads a generated plan and rejects text that is not one", () => {
    expect(parseProjectSpec('{"title":"Plan","tasks":[{"title":"One","dependencies":[0]},{"description":null}]}')).toEqual({
      title: "Plan",
      description: "",
      tasks: [
        { title: "One", description: "", dependencies: [0] },
        { title: "", description: "", dependencies: [] },
      ],
    });
    expect(parseProjectSpec("not json")).toBeNull();
    expect(parseProjectSpec('{"tasks":"many"}')).toBeNull();
  });

  it("reads an interview turn as the web shows it", () => {
    expect(interviewTurnText('{"question":"Which screens?","options":[{"label":"All","description":"Every one"}]}')).toBe("Which screens?");
    expect(interviewTurnText('{"title":"Copy pass","tasks":[{},{}]}')).toBe("Plan ready: Copy pass (2 tasks)");
    expect(interviewTurnText('{"interviewComplete":true}')).toBeNull();
    expect(interviewTurnText("  ")).toBeNull();
    expect(interviewTurnText("Plain answer")).toBe("Plain answer");
  });
});
