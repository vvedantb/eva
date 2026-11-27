import { expect, test } from "bun:test";
import { buildEditPrompt } from "../convex/_sessions/prompts";

const RECORD_START = "agent-browser record start /tmp/repo/recordings/";

function editPrompt(): string {
  return buildEditPrompt({
    repo: { owner: "vvedantb", name: "eva", baseBranch: "main" },
    branchName: "eva/some-branch",
    message: "make the save button obvious when dirty",
    rootDirectory: "apps/web",
    customInstructionsBlock: "",
  });
}

test("the session edit prompt records to an absolute path", () => {
  const prompt = editPrompt();
  expect(prompt).toContain(RECORD_START);
  expect(prompt).toMatch(/ALWAYS.*absolute paths/i);
  expect(prompt).not.toMatch(/record start (?!\/)[\w<]/);
});

test("recording prompts tell the agent to verify the file is growing", () => {
  const prompt = editPrompt();
  expect(prompt).toMatch(/ls -la \/tmp\/repo\/recordings/);
  expect(prompt).toMatch(/0-byte/);
  expect(prompt).toMatch(/screenshot/i);
});
