# Idle pause and the leak sweep see every sandbox owner

- `listSandboxOwnerRows` (`_sandbox/owner.ts`) is the one lookup for "which rows hold sandbox X": sessions, docs and automation runs, each through a new `by_sandbox` index.
- `resolveSandboxOwnerState` reads it, so a doc interview's or automation run's VM is no longer `unknown`. The leak sweep now stops it once nothing needs it.
- A doc or automation run wants its VM while its workflow runs, while its agent turn is open, and for the after-agent idle grace. A crashed workflow's stale `activeWorkflowId` does not pin the VM.
- The snapshot purge asks the same lookup for the sandboxes Vercel lists, instead of full-table scans of sessions, docs and automation runs.
