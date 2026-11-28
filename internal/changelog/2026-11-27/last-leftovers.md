# Last duplication leftovers

- One rule for the PR a task links to: its own, else (an old project task with none) its project's. `taskPrUrl` lives in `@eva/shared`; the web, the phone, the backend (`loadTaskPrUrl`) and MCP use it. The web used to show a project task its project's PR; the phone and backend showed the task's own.
- The phone offers Create PR on a project task too, like the web: every task opens its own PR now.
- `sessions.addMessage` became `sessions.postSendError`: the web's send-failure bubble is its only caller now (every other message goes through `chats.send`).
- The schema-narrowing check also watches `_validators/enums.ts`, where the stored unions live.
- Docs no longer name deleted files (`TIMEOUTS.md`, `ARCHITECTURE.md`, `sandbox-snapshot-lifecycle.md`).
