import { expect, test } from "vitest";
import { buildReadableReposBlock } from "../convex/prompts";
import { buildEditPrompt } from "../convex/_sessions/prompts";
import { buildImplementationPrompt } from "../convex/_taskWorkflow/prompts";

const HEADING = "## Other repositories you may use";

const TWO_REPOS = [
  { owner: "vvedantb", name: "eva" },
  { owner: "evalucom", name: "carepulse" },
];

test("buildReadableReposBlock is empty when nothing is readable", () => {
  expect(buildReadableReposBlock([])).toBe("");
});

test("buildReadableReposBlock lists every repo and clones the first one", () => {
  const block = buildReadableReposBlock(TWO_REPOS);

  expect(block).toContain(HEADING);
  expect(block).toContain("vvedantb/eva, evalucom/carepulse.");
  expect(block).toContain(
    "git clone https://github.com/vvedantb/eva.git /tmp/eva",
  );
  // The helper mints contents-write tokens, so the block must say push works.
  expect(block).toContain("clone, fetch and push these repositories");
});

function sessionPrompt(
  readableRepos: Array<{ owner: string; name: string }>,
): string {
  return buildEditPrompt({
    repo: { owner: "vvedantb", name: "eva", baseBranch: "main" },
    branchName: "eva/session-1",
    message: "continue",
    rootDirectory: "",
    customInstructionsBlock: "",
    systemPrompt: "Repo system prompt text",
    readableRepos,
  });
}

test("buildEditPrompt appends the block after the system prompt", () => {
  const prompt = sessionPrompt(TWO_REPOS);

  const systemPromptIndex = prompt.indexOf("Repo system prompt text");
  const headingIndex = prompt.indexOf(HEADING);
  expect(systemPromptIndex).toBeGreaterThan(-1);
  expect(headingIndex).toBeGreaterThan(systemPromptIndex);
});

test("buildEditPrompt omits the block when nothing is readable", () => {
  expect(sessionPrompt([])).not.toContain(HEADING);
});

test("buildImplementationPrompt appends the block after the system prompt", () => {
  const prompt = buildImplementationPrompt(
    { title: "Add dark mode", taskNumber: 12 },
    "eva/task-12",
    false,
    "apps/web",
    "vvedantb",
    "eva",
    undefined,
    undefined,
    "Repo system prompt text",
    undefined,
    TWO_REPOS,
  );

  const systemPromptIndex = prompt.indexOf("Repo system prompt text");
  const headingIndex = prompt.indexOf(HEADING);
  expect(systemPromptIndex).toBeGreaterThan(-1);
  expect(headingIndex).toBeGreaterThan(systemPromptIndex);
});

test("buildImplementationPrompt omits the block when nothing is readable", () => {
  const prompt = buildImplementationPrompt(
    { title: "Add dark mode", taskNumber: 12 },
    "eva/task-12",
    false,
    "apps/web",
    "vvedantb",
    "eva",
  );

  expect(prompt).not.toContain(HEADING);
});
