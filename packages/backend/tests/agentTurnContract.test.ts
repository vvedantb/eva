import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/**
 * Quick-task runs and one-shot agents run on durable turns (durable-turns
 * Phases 6 and 7). These pin the shape that keeps in-flight workflows
 * replayable and every start on a turn.
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

/** Steps a run with a durable turn records; each sits behind `args.turnId`. */
const RUN_TURN_STEPS = [
  "internal.turns.markLaunching",
  "internal.turns.acquireOneShotLease",
  "internal.taskWorkflow.closeRunTurn",
];

test("a run started before durable run turns replays its old journal", () => {
  const body = workflowBody(
    "_taskWorkflow/workflowDefinition.ts",
    "taskExecutionWorkflow",
  );
  expect(body).toContain('turnId: v.optional(v.id("turns"))');
  const steps = stepsOf(body);
  // Old journal: every step except the gated turn steps, in this order.
  expect(steps.filter((step) => !RUN_TURN_STEPS.includes(step))).toEqual([
    "internal.taskWorkflow.updateRunToRunning",
    "internal.taskWorkflow.getTaskData",
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
    "internal.taskWorkflow.finalizeRunStreamingPhase",
    "internal.taskWorkflow.completeRun",
    "internal.github.generatePrDescription",
    "internal.taskWorkflow.maybeScheduleQuickTaskRetry",
    "internal.sandbox.stopSandbox",
    "internal.taskWorkflow.markTaskSandboxStopped",
    "internal.taskWorkflow.finalizeRunStreamingPhase",
    "internal.taskWorkflow.completeRun",
    "internal.taskWorkflow.maybeScheduleQuickTaskRetry",
    "internal.sandbox.stopSandbox",
    "internal.taskWorkflow.markTaskSandboxStopped",
    "internal.taskWorkflow.clearActiveWorkflow",
  ]);
  for (const step of RUN_TURN_STEPS) {
    const at = body.indexOf(`${step},`);
    const gate = body.lastIndexOf("if (args.turnId !== undefined)", at);
    expect(gate, `${step} is not gated on args.turnId`).toBeGreaterThan(-1);
  }
  // The launch adds the lease only for a run that has one.
  expect(body).toContain("...(turnLease\n          ? {");
});

test("every run starts through startTaskRunWorkflow", () => {
  const starters = convexFiles().filter((path) =>
    /workflow\.start\(\s*ctx,\s*internal\.taskWorkflow\.taskExecutionWorkflow/.test(
      source(path),
    ),
  );
  expect(starters).toEqual(["_taskWorkflow/startRun.ts"]);
});

test("the run's stall chain is armed only for runs without a turn", () => {
  const lifecycle = source("_taskWorkflow/runLifecycle.ts");
  const at = lifecycle.indexOf("internal.taskWorkflow.checkStaleRuns");
  const gate = lifecycle.lastIndexOf(
    "if ((await findOpenTurn(ctx, args.runId)) === null)",
    at,
  );
  expect(gate).toBeGreaterThan(-1);
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
    expect(body).toContain("durableTurns: v.optional(v.boolean())");
    expect(body).toContain("await launchAgentStep(");
    expect(body).toContain("durable: args.durableTurns === true");
    expect(body).not.toContain("internal.sandbox.launchOnExistingSandbox");
  },
);

test("every one-shot workflow start asks for durable turns", () => {
  for (const [, name] of ONE_SHOT_WORKFLOWS) {
    for (const path of convexFiles()) {
      const file = source(path);
      const ref = new RegExp(
        `workflow\\.start\\(\\s*ctx,\\s*internal\\.\\w+\\.${name},\\s*\\{\\s*durableTurns: true,`,
        "g",
      );
      const starts =
        file.match(
          new RegExp(
            `workflow\\.start\\(\\s*ctx,\\s*internal\\.\\w+\\.${name},`,
            "g",
          ),
        ) ?? [];
      expect(
        (file.match(ref) ?? []).length,
        `${path} starts ${name} without durableTurns`,
      ).toBe(starts.length);
    }
  }
});

test("every one-shot completion settles its lease fence first", () => {
  const completions: ReadonlyArray<[string, string]> = [
    ["_automations/runs.ts", "handleCompletion"],
    ["prRecapWorkflow.ts", "handleCompletion"],
    ["summarizeWorkflow.ts", "handleCompletion"],
    ["docInterviewWorkflow.ts", "handleCompletion"],
    ["docInterviewWorkflow.ts", "handleGenerateCompletion"],
    ["projectInterviewWorkflow.ts", "handleCompletion"],
    ["projectInterviewWorkflow.ts", "handleSpecCompletion"],
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
