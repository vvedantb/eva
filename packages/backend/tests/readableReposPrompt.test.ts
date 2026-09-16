import { expect, test } from "vitest";
import { buildReadableReposBlock } from "../convex/prompts";
import { buildEditPrompt } from "../convex/_sessions/prompts";
import { buildAgentTaskChatPrompt } from "../convex/_agentTasks/chatPrompt";
import { buildProjectChatPrompt } from "../convex/_projects/chatPrompt";
import { buildImplementationPrompt } from "../convex/_taskWorkflow/prompts";

const HEADING = "## Other repositories you may read";

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
  // Clone/fetch only: the helper mints read-only tokens.
  expect(block).toContain("clone/fetch only, no push");
});

function sessionPrompt(
  readableRepos: Array<{ owner: string; name: string }>,
): string {
  return buildEditPrompt(
    { owner: "vvedantb", name: "eva", baseBranch: "main" },
    "eva/session-1",
    "",
    "continue",
    "",
    "",
    "Repo system prompt text",
    undefined,
    [],
    readableRepos,
  );
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

test("buildAgentTaskChatPrompt passes readable repos through", () => {
  const prompt = buildAgentTaskChatPrompt({
    repoOwner: "vvedantb",
    repoName: "eva",
    branchName: "eva/task-1",
    title: "Add dark mode",
    description: undefined,
    tags: undefined,
    taskNumber: 1,
    status: "in_progress",
    message: "continue",
    rootDirectory: "",
    customInstructionsBlock: "",
    systemPrompt: undefined,
    devPort: undefined,
    readableRepos: TWO_REPOS,
  });

  expect(prompt).toContain(HEADING);
  expect(prompt).toContain("evalucom/carepulse");
});

test("buildProjectChatPrompt passes readable repos through", () => {
  const prompt = buildProjectChatPrompt({
    repoOwner: "vvedantb",
    repoName: "eva",
    branchName: "eva/project-1",
    title: "Billing revamp",
    description: undefined,
    generatedSpec: undefined,
    message: "continue",
    rootDirectory: "",
    customInstructionsBlock: "",
    systemPrompt: undefined,
    devPort: undefined,
    readableRepos: TWO_REPOS,
  });

  expect(prompt).toContain(HEADING);
  expect(prompt).toContain("evalucom/carepulse");
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
