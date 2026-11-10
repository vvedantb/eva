import { expect, test } from "vitest";
import {
  enforceStepBudget,
  headCap,
  serializeSteps,
  STEP_FIELD_CAPS,
  tailCap,
} from "../parse/stepBudget.js";
import type { ProgressStep } from "../types.js";

test("tailCap keeps the end of long output", () => {
  const result = tailCap("ABCDEFGHIJ", 4);
  expect(result.text).toBe("GHIJ");
  expect(result.truncated).toBe(true);
});

test("headCap keeps the start", () => {
  const result = headCap("ABCDEFGHIJ", 4);
  expect(result.text).toBe("ABCD");
  expect(result.truncated).toBe(true);
});

test("enforceStepBudget strips heavy fields oldest-first under budget", () => {
  const fat = "x".repeat(200_000);
  const steps: ProgressStep[] = [
    {
      type: "bash",
      label: "Ran command",
      status: "complete",
      command: "echo one",
      output: { text: fat, truncated: true },
    },
    {
      type: "bash",
      label: "Ran command",
      status: "complete",
      command: "echo two",
      output: { text: fat, truncated: true },
    },
    {
      type: "bash",
      label: "Ran command",
      status: "complete",
      command: "echo three",
      output: { text: fat, truncated: true },
    },
    {
      type: "edit",
      label: "Edited file",
      status: "complete",
      edits: [{ oldText: fat, newText: fat }],
    },
  ];

  enforceStepBudget(steps);
  const encoded = JSON.stringify(steps);
  expect(encoded.length).toBeLessThanOrEqual(STEP_FIELD_CAPS.jsonBytes);
  // Labels always survive
  expect(steps.every((s) => typeof s.label === "string")).toBe(true);
  expect(steps[0]?.command).toBe("echo one");
});

test("enforceStepBudget drops subagent messages before parent output", () => {
  const fat = "x".repeat(350_000);
  const steps: ProgressStep[] = [
    {
      type: "bash",
      label: "Ran command",
      status: "complete",
      output: { text: fat },
    },
    {
      type: "response",
      label: "Agent message",
      status: "complete",
      parentToolUseId: "toolu_agent",
      output: { text: fat },
    },
  ];

  enforceStepBudget(steps);
  expect(steps[0]?.output?.text).toBe(fat);
  expect(steps[1]?.output).toBeUndefined();
});

test("serializeSteps returns JSON string under budget", () => {
  const steps: ProgressStep[] = [
    {
      type: "bash",
      label: "Ran command",
      status: "complete",
      command: "pwd",
      output: { text: "/tmp", exitCode: 0 },
    },
  ];
  const payload = serializeSteps(steps);
  expect(JSON.parse(payload)).toEqual(steps);
});
