import { afterEach, describe, expect, test } from "bun:test";
import { freshModules } from "./freshModules";

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
  freshModules();
  const { BLOCKING_QUESTIONS_ENABLED } = await import("../config.js");
  return BLOCKING_QUESTIONS_ENABLED;
}

afterEach(() => {
  if (ORIGINAL.entity === undefined) delete process.env.ENTITY_ID_FIELD;
  else process.env.ENTITY_ID_FIELD = ORIGINAL.entity;
  if (ORIGINAL.run === undefined) delete process.env.RUN_ID;
  else process.env.RUN_ID = ORIGINAL.run;
  freshModules();
});

describe("BLOCKING_QUESTIONS_ENABLED", () => {
  test("is on for a chat turn, which can answer", async () => {
    expect(await gateWith({ entityIdField: "chatId" })).toBe(true);
  });

  test("is off for a run", async () => {
    expect(
      await gateWith({ entityIdField: "chatId", runId: "run_123" }),
    ).toBe(false);
  });

  test("is off for surfaces with no answering UI", async () => {
    expect(await gateWith({ entityIdField: "entityId" })).toBe(false);
    expect(await gateWith({})).toBe(false);
  });
});
