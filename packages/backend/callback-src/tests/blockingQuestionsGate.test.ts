import { afterEach, describe, expect, test, vi } from "vitest";

/**
 * Which surfaces may pause a turn on a question.
 *
 * The gate is read once at module load from the environment, so each case
 * re-imports config with the env it is asserting about. The `RUN_ID` case is
 * the one that matters: a run has nobody to answer, and the pause suspends the
 * turn watchdog, so enabling it there would hang the turn until someone stopped
 * the sandbox.
 */
const ORIGINAL = {
  entity: process.env.ENTITY_ID_FIELD,
  run: process.env.RUN_ID,
};

async function gateWith(env: {
  entityIdField?: string;
  runId?: string;
}): Promise<boolean> {
  if (env.entityIdField === undefined) delete process.env.ENTITY_ID_FIELD;
  else process.env.ENTITY_ID_FIELD = env.entityIdField;
  if (env.runId === undefined) delete process.env.RUN_ID;
  else process.env.RUN_ID = env.runId;
  vi.resetModules();
  const { BLOCKING_QUESTIONS_ENABLED } = await import("../config.js");
  return BLOCKING_QUESTIONS_ENABLED;
}

afterEach(() => {
  if (ORIGINAL.entity === undefined) delete process.env.ENTITY_ID_FIELD;
  else process.env.ENTITY_ID_FIELD = ORIGINAL.entity;
  if (ORIGINAL.run === undefined) delete process.env.RUN_ID;
  else process.env.RUN_ID = ORIGINAL.run;
  vi.resetModules();
});

describe("BLOCKING_QUESTIONS_ENABLED", () => {
  test("is on for the three chat surfaces that can answer", async () => {
    for (const entityIdField of ["sessionId", "taskId", "projectId"]) {
      expect(await gateWith({ entityIdField })).toBe(true);
    }
  });

  test("is off for a run, whatever the surface", async () => {
    for (const entityIdField of ["sessionId", "taskId", "projectId"]) {
      expect(await gateWith({ entityIdField, runId: "run_123" })).toBe(false);
    }
  });

  test("is off for surfaces with no answering UI", async () => {
    expect(await gateWith({ entityIdField: "docId" })).toBe(false);
    expect(await gateWith({ entityIdField: "reportId" })).toBe(false);
    expect(await gateWith({ entityIdField: "automationRunId" })).toBe(false);
    expect(await gateWith({})).toBe(false);
  });
});
