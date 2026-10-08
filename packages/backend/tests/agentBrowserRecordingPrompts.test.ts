import { expect, test } from "vitest";
import { buildEditPrompt } from "../convex/_sessions/prompts";

/**
 * `agent-browser record` resolves a relative path against the agent-browser
 * daemon's cwd, not the shell's, so the .webm lands where Eva never looks for
 * it and never reaches the chat message. Every prompt that asks for a recording
 * must spell out an absolute path.
 */
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
  // A bare `record start walkthrough.webm` is the bug this guards.
  expect(prompt).not.toMatch(/record start (?!\/)[\w<]/);
});

/**
 * ffmpeg writes the WebM progressively, so a missing or 0-byte file a few
 * seconds in means recording cannot succeed at all (usually ffmpeg absent).
 * Without this check the agent retry-loops on a capture that will never work
 * instead of falling back to screenshots.
 */
test("recording prompts tell the agent to verify the file is growing", () => {
  const prompt = editPrompt();
  expect(prompt).toMatch(/ls -la \/tmp\/repo\/recordings/);
  expect(prompt).toMatch(/0-byte/);
  expect(prompt).toMatch(/screenshot/i);
});
