# Manual smoke test: linked-repo edits per harness

Automated tests cover the pure config decisions (`linkedReposConfig.test.ts`)
and the checkpoint shas (`turnCheckpoint.test.ts`). They cannot prove that a
given coding harness (Claude, Cursor, OpenCode, Codex) will actually read and
write files outside its configured `cwd` — that depends on each SDK/CLI's own
sandboxing, which changes across versions. Run this by hand after any change
to `providers/claudeSdk.ts`, `providers/cursorSdk.ts`, `providers/opencodeServer.ts`,
or `providers/opencodeSdk.ts`, and after upgrading any of those SDKs.

## Setup

1. Start a multi-repo session (two small repos you can safely commit throwaway
   changes to). Confirm the launcher set, in the sandbox:
   - `EVA_WORKSPACE_ROOT=/tmp/workspace`
   - `EVA_LINKED_REPOS` — a JSON array containing the linked repo's
     `{ owner, name, path, branchName, baseBranch }`
   - `/tmp/workspace/<linkedName>` exists as a full git clone
   - `/tmp/workspace/<primaryName>` is a symlink to `/tmp/repo`

2. Note the linked repo's HEAD sha before the test:
   `git -C /tmp/workspace/<linkedName> rev-parse HEAD`

## Per-harness test

Ask the agent, in one turn: "In the `<linkedName>` repo, add a one-line
comment to any file and commit it." Do not mention paths or `cwd` — the point
is to see whether the harness can find and edit the linked repo unassisted.

Repeat for each provider (`AI_PROVIDER=claude|cursor|opencode|codex`):

- **Claude**: `additionalDirectories: [WORKSPACE_ROOT]` is wired in
  `claudeSdk.ts`. Expect it to work out of the box.
- **Cursor**: `local.cwd` is `AGENT_CWD` (`WORK_DIR` by default). Cursor has no
  documented "extra directories" option, so this is the harness most likely to
  need the fallback below.
- **OpenCode**: `directory` (client) and `cwd` (spawned server) are both
  `AGENT_CWD`. Same caveat as Cursor.
- **Codex**: unrestricted already (`approvalPolicy: "never"`,
  `externalSandbox`/`danger-full-access`) — no `cwd` scoping applies, so it is
  expected to work regardless.

## Pass/fail

- **Pass**: a new commit exists on `/tmp/workspace/<linkedName>`'s HEAD
  (`git -C /tmp/workspace/<linkedName> rev-parse HEAD` changed) and contains
  the requested edit.
- **Fail**: the harness could not find the linked repo, tried to edit a
  same-named file in the primary repo instead, or errored trying to reach
  outside its cwd.

## Fallback: `EVA_LINKED_REPOS_CWD_ROOT=1`

If a harness fails the test above, set `EVA_LINKED_REPOS_CWD_ROOT=1` in the
sandbox env for that session. This flips `AGENT_CWD` (see `linkedRepos.ts`
`resolveAgentCwd`) to `WORKSPACE_ROOT` instead of `WORK_DIR`, so Cursor's
`local.cwd` and OpenCode's `directory`/spawn `cwd` root at the workspace —
every linked repo, plus the primary via its symlink, sits inside that cwd.
This is a pure env flag: no callback rebuild is needed, and it can be toggled
per session while a longer-term fix (or an upstream SDK option) is evaluated.

Re-run the test above with the flag set and confirm the harness now finds and
commits to the linked repo.
