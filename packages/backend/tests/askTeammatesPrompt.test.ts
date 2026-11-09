import { expect, test } from "vitest";
import { buildEditPrompt } from "../convex/_sessions/prompts";

function editPrompt(askTeammatesEnabled: boolean | undefined): string {
  return buildEditPrompt({
    repo: { owner: "vvedantb", name: "eva", baseBranch: "main" },
    branchName: "eva/some-branch",
    message: "pick the empty-state copy",
    rootDirectory: "",
    customInstructionsBlock: "",
    runtime: { ownerKey: "session-abc", askTeammatesEnabled },
  });
}

test("ask_teammate instruction is off unless the owner opts in", () => {
  expect(editPrompt(undefined)).not.toContain("ask_teammate");
  expect(editPrompt(false)).not.toContain("ask_teammate");
  expect(editPrompt(true)).toContain(
    "call `list_work_profiles` then `ask_teammate`",
  );
});
