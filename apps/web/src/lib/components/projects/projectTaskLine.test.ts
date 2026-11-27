import { describe, expect, it } from "bun:test";
import {
  projectStatusCountsLine,
  projectTaskPrLine,
  projectTaskPullRequests,
  projectTaskSummaryLine,
  type ProjectTaskView,
  type SummarizableProjectTaskRow,
} from "@eva/shared/projectView";

const view = (
  displayStatus: ProjectTaskView["displayStatus"],
  needsYou?: ProjectTaskView["needsYou"],
): ProjectTaskView => ({
  stage: "todo",
  displayStatus,
  needsYou,
  waitingForCoordinator: false,
});

const task = (row: SummarizableProjectTaskRow & { locked?: boolean }) => row;

const none = {
  notes: undefined,
  failed: false,
  authorName: undefined,
  otherRepoLabel: undefined,
};

describe("projectTaskSummaryLine", () => {
  it("names who added a Triage task", () => {
    const row = task({ numId: 904, status: "todo" });
    expect(
      projectTaskSummaryLine(row, view("triage", "approve"), {
        ...none,
        authorName: "Ana",
      }),
    ).toBe("#904 · Added by Ana");
    expect(
      projectTaskSummaryLine({ status: "todo" }, view("triage", "approve"), none),
    ).toBe("Needs approval");
  });

  it("says why a Blocked task needs you, with its PR or its question", () => {
    const row = task({
      numId: 905,
      status: "done",
      prUrl: "https://github.com/acme/web/pull/9003",
      prState: "open",
    });
    expect(projectTaskSummaryLine(row, view("blocked", "review"), none)).toBe(
      "#905 · Needs you: review PR #9003",
    );
    expect(
      projectTaskSummaryLine(row, view("blocked", "question"), {
        ...none,
        notes: { ask: "Which DB?", reports: [] },
      }),
    ).toBe("#905 · Asks: Which DB?");
    expect(
      projectTaskSummaryLine({ status: "in_progress" }, view("blocked", "failed"), none),
    ).toBe("Failed twice");
  });

  it("adds the other repo, the phase and the report count", () => {
    const row = task({ numId: 7, status: "todo", phaseLabel: "Phase 2" });
    expect(
      projectTaskSummaryLine(row, view("idle"), {
        ...none,
        otherRepoLabel: "api",
        notes: { ask: undefined, reports: ["a", "b"] },
      }),
    ).toBe("#7 · Waiting for a free slot · api · Phase 2 · 2 reports");
  });

  it("says how an Archived task ended", () => {
    expect(
      projectTaskSummaryLine(
        { status: "done", prUrl: "https://x/pull/1", prState: "merged" },
        view("archived"),
        none,
      ),
    ).toBe("Merged");
    expect(
      projectTaskSummaryLine({ status: "cancelled" }, view("archived"), none),
    ).toBe("Cancelled");
  });

  it("names an approved Triage item the coordinator holds, and where it went", () => {
    expect(
      projectTaskSummaryLine(
        task({ numId: 908, status: "todo" }),
        { ...view("idle"), withCoordinator: true },
        none,
      ),
    ).toBe("#908 · With Eva");
    expect(
      projectTaskSummaryLine(
        task({ numId: 908, status: "cancelled", mergedIntoTaskId: "t4" }),
        view("archived"),
        { ...none, numIdOf: (id) => (id === "t4" ? 904 : undefined) },
      ),
    ).toBe("#908 · Added to #904");
  });
});

describe("project task PRs and counts", () => {
  it("lists the tasks with a PR, and reads each one as a line", () => {
    const rows = [
      task({ numId: 1, status: "done" }),
      task({
        numId: 2,
        status: "done",
        prUrl: "https://github.com/acme/web/pull/8357",
        prState: "merged",
      }),
      task({ numId: 3, status: "done", prUrl: "https://x/y", locked: true }),
    ];
    const prs = projectTaskPullRequests(rows);
    expect(prs.map((row) => row.numId)).toEqual([2]);
    expect(projectTaskPrLine(prs[0])).toBe("#8357 · Merged · via #2");
    expect(
      projectTaskPrLine({ status: "done", prUrl: "https://gitlab.com/a/-/merge_requests/12" }),
    ).toBe("12 · PR");
  });

  it("lists a multi-repo task's PRs one per repo, each with its repo", () => {
    const prs = projectTaskPullRequests([
      task({
        numId: 4,
        status: "code_review",
        prUrl: "https://github.com/acme/web/pull/12",
        prState: "open",
        repoPrs: [
          { prUrl: "https://github.com/acme/web/pull/12", prState: "merged", repoName: "web" },
          { prUrl: "https://github.com/acme/api/pull/7", prState: "open", repoName: "api" },
        ],
      }),
    ]);
    expect(prs.map((row) => projectTaskPrLine(row))).toEqual([
      "#12 · Merged · web · via #4",
      "#7 · Open · api · via #4",
    ]);
  });

  it("counts the non-empty statuses in list order", () => {
    expect(
      projectStatusCountsLine({
        triage: 3,
        working: 0,
        blocked: 2,
        idle: 1,
        archived: 1,
      }),
    ).toBe("3 triage · 2 blocked · 1 idle · 1 archived");
  });
});
