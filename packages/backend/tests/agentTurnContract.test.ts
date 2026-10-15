import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/**
 * Quick-task runs and one-shot agents run on durable turns (durable-turns
 * Phases 6 and 7). These pin every start and launch on a turn, and the run
 * journal that in-flight workflows replay.
 */

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");
const source = (path: string): string =>
  readFileSync(join(convexDir, path), "utf8").replaceAll("\r\n", "\n");

function convexFiles(dir = convexDir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "_generated" || name === "node_modules") return [];
    if (statSync(path).isDirectory()) return convexFiles(path);
    return name.endsWith(".ts") ? [relative(convexDir, path)] : [];
  });
}

function workflowBody(path: string, name: string): string {
  const file = source(path);
  const start = file.indexOf(`export const ${name} = workflow.define(`);
  expect(start, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = file.indexOf("\nexport const ", start + 1);
  return file.slice(start, end < 0 ? undefined : end);
}

const stepsOf = (body: string): string[] =>
  [
    ...body.matchAll(/step\.(?:run\w+|awaitEvent)\(\s*(internal\.[\w.]+|\w+)/g),
  ].map((match) => match[1]);

test("every run holds a turn and keeps its journal", () => {
  const body = workflowBody(
    "_taskWorkflow/workflowDefinition.ts",
    "taskExecutionWorkflow",
  );
  expect(body).toContain('turnId: v.id("turns")');
  expect(body).not.toContain("args.turnId !== undefined");
  // Steps replay by position: this is the journal every run started since
  // durable run turns has recorded.
  expect(stepsOf(body)).toEqual([
    "internal.taskWorkflow.updateRunToRunning",
    "internal.taskWorkflow.getTaskData",
    "internal.turns.markLaunching",
    "internal.turns.acquireOneShotLease",
    "internal.sandbox.launchOnExistingSandbox",
    "internal.taskWorkflow.saveSandboxId",
    "internal.taskWorkflow.updateProjectSandbox",
    "internal.taskWorkflow.saveTaskSandboxId",
    "taskCompleteEvent",
    "internal.sandbox.pushSandboxBranch",
    "internal.taskWorkflow.scheduleDeploymentTracking",
    "internal.taskWorkflow.getPrEnrichmentData",
    "internal.taskWorkflowActions.createTaskPullRequest",
    "internal.taskWorkflowActions.refreshTaskPullRequestBody",
    "internal.taskWorkflowActions.createTaskPullRequest",
    "internal.taskWorkflow.completeRun",
    "internal.github.generatePrDescription",
    // One terminal tail for success and failure: completeRun only when the
    // try did not reach it.
    "internal.taskWorkflow.completeRun",
    "internal.taskWorkflow.maybeScheduleQuickTaskRetry",
    "internal.sandbox.stopSandbox",
    "internal.taskWorkflow.markTaskSandboxStopped",
    "internal.taskWorkflow.clearActiveWorkflow",
    "internal.taskWorkflow.closeRunTurn",
  ]);
});

test("every run starts through startTaskRunWorkflow", () => {
  const starters = convexFiles().filter((path) =>
    /workflow\.start\(\s*ctx,\s*internal\.taskWorkflow\.taskExecutionWorkflow/.test(
      source(path),
    ),
  );
  expect(starters).toEqual(["_taskWorkflow/startRun.ts"]);
});

test("the lease is a run's only stall check", () => {
  expect(source("_taskWorkflow/runLifecycle.ts")).not.toContain(
    "internal.taskWorkflow.checkStaleRuns",
  );
});

/** Every one-shot agent workflow, with the turn owner its launch names. */
const ONE_SHOT_WORKFLOWS: ReadonlyArray<[string, string]> = [
  ["automationWorkflow.ts", "automationExecutionWorkflow"],
  ["prRecapWorkflow.ts", "prRecapWorkflow"],
  ["summarizeWorkflow.ts", "summarizeSessionWorkflow"],
  ["docInterviewWorkflow.ts", "docInterviewWorkflow"],
  ["docInterviewWorkflow.ts", "docGenerateWorkflow"],
  ["projectInterviewWorkflow.ts", "projectInterviewWorkflow"],
  ["projectInterviewWorkflow.ts", "projectSpecWorkflow"],
  ["evaluationWorkflow.ts", "evaluationWorkflow"],
  ["evaluationWorkflow.ts", "fixWorkflow"],
  ["testGenWorkflow.ts", "testGenWorkflow"],
];

test.each(ONE_SHOT_WORKFLOWS)(
  "%s %s launches through launchAgentStep",
  (path, name) => {
    const body = workflowBody(path, name);
    expect(body).toContain("await launchAgentStep(");
    expect(body).not.toContain("internal.sandbox.launchOnExistingSandbox");
  },
);

test("every one-shot completion settles its lease fence first", () => {
  const completions: ReadonlyArray<[string, string]> = [
    ["_automations/runs.ts", "handleCompletion"],
    ["prRecapWorkflow.ts", "handleCompletion"],
    ["summarizeWorkflow.ts", "handleCompletion"],
    ["docInterviewWorkflow.ts", "handleCompletion"],
    ["projectInterviewWorkflow.ts", "handleCompletion"],
    ["evaluationWorkflow.ts", "handleCompletion"],
    ["evaluationWorkflow.ts", "handleFixCompletion"],
    ["testGenWorkflow.ts", "handleCompletion"],
  ];
  for (const [path, name] of completions) {
    const file = source(path);
    const start = file.indexOf(`export const ${name} = authMutation(`);
    expect(start, `${path} ${name}`).toBeGreaterThan(-1);
    const body = file.slice(start, file.indexOf("\n});", start));
    expect(body, `${path} ${name}`).toContain("...turnLeaseFenceArgs");
    const settleAt = body.indexOf("settleAgentTurnCompletion(ctx");
    const sendAt = body.indexOf("sendCompletionEvent(");
    expect(settleAt, `${path} ${name}`).toBeGreaterThan(-1);
    expect(settleAt, `${path} ${name}`).toBeLessThan(sendAt);
  }
});
