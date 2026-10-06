import { expect, test } from "vitest";
import { buildAgentMemoryBlock } from "../convex/prompts";
import { buildEditPrompt } from "../convex/_sessions/prompts";
import { buildImplementationPrompt } from "../convex/_taskWorkflow/prompts";
import { MEMORY_DREAMING_PROMPT } from "../convex/_automations/prompts/memoryDreaming";

const HEADING = "## Agent memory (this repo opted in):";

test("buildAgentMemoryBlock is empty unless the repo opted in", () => {
  expect(buildAgentMemoryBlock(undefined)).toBe("");
  expect(buildAgentMemoryBlock(false)).toBe("");
});

test("buildAgentMemoryBlock points at MEMORY.md and forbids sensitive data", () => {
  const block = buildAgentMemoryBlock(true);

  expect(block).toContain(HEADING);
  expect(block).toContain(".eva/memory/MEMORY.md");
  expect(block).toContain("Never save secrets");
});

function sessionPrompt(agentMemoryEnabled: boolean): string {
  return buildEditPrompt(
    { owner: "vvedantb", name: "eva", baseBranch: "main" },
    "eva/session-1",
    "",
    "continue",
    "",
    "",
    undefined,
    5173,
    [],
    [],
    [],
    { ownerKey: "session-1", agentMemoryEnabled },
  );
}

test("session prompt carries memory only when enabled", () => {
  expect(sessionPrompt(true)).toContain(HEADING);
  expect(sessionPrompt(false)).not.toContain(HEADING);
});

test("quick task prompt carries memory only when enabled", () => {
  const prompt = (enabled: boolean) =>
    buildImplementationPrompt(
      { title: "Fix it" },
      "eva/task-1",
      true,
      "",
      "vvedantb",
      "eva",
      undefined,
      undefined,
      undefined,
      undefined,
      [],
      enabled,
    );

  expect(prompt(true)).toContain(HEADING);
  expect(prompt(false)).not.toContain(HEADING);
});

test("dreaming prompt shares the memory entry format", () => {
  expect(MEMORY_DREAMING_PROMPT).toContain(".eva/memory/MEMORY.md");
  expect(MEMORY_DREAMING_PROMPT).toContain("Never save secrets");
});
