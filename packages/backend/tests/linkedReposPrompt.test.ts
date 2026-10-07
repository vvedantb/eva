import { expect, test } from "vitest";
import { buildLinkedReposSection } from "../convex/prompts/shared";

test("buildLinkedReposSection returns nothing for a single-repo session", () => {
  expect(
    buildLinkedReposSection(
      { owner: "evalucom", name: "carepulse-web", branchName: "eva/session-1" },
      [],
      "add nursing home filter",
    ),
  ).toBe("");
});

test("buildLinkedReposSection describes the primary and every linked repo", () => {
  const section = buildLinkedReposSection(
    { owner: "evalucom", name: "carepulse-web", branchName: "eva/session-1" },
    [
      {
        owner: "evalucom",
        name: "carepulse-api",
        path: "/tmp/workspace/carepulse-api",
        branchName: "eva/session-1",
        baseBranch: "main",
      },
      {
        owner: "evalucom",
        name: "carepulse-worker",
        path: "/tmp/workspace/carepulse-worker",
        branchName: "eva/session-1",
        baseBranch: "develop",
      },
    ],
    // Pre-escaped, matching buildEditPrompt's contract: it escapes `"` in the
    // raw message once (`commitMessage`) and reuses the same escaped string in
    // every commit line it builds, including this one.
    'add nursing home filter \\"urgent\\"',
  );

  expect(section).toBe(`

## Linked repositories
This session spans several repos. All are checked out under /tmp/workspace:
- evalucom/carepulse-web   /tmp/workspace/carepulse-web   (primary, your cwd)   branch eva/session-1
- evalucom/carepulse-api   /tmp/workspace/carepulse-api   branch eva/session-1   base main
- evalucom/carepulse-worker   /tmp/workspace/carepulse-worker   branch eva/session-1   base develop
Commit in each repo you change: cd <path> && git add -A -- ':!*.png' ':!*.jpg' ':!recordings/' ':!plan.md' && git diff --cached --quiet || git commit -m "task: add nursing home filter \\"urgent\\"".
Before running a linked repo's commands, load its env: cd <path> && set -a && . ./.env.eva && set +a (the file is absent when the repo has no Eva env vars).
Never push. Eva pushes every repo that has new commits and opens one PR per repo after the turn.
Keep plan.md, screenshots/ and recordings/ in /tmp/repo.`);
});
