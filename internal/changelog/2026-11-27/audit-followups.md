# Last duplication follow-ups: one send path for MCP, chats.start

- MCP `send_chat_message` / `send_agent_message` now send through `sendSessionChatMessage`, the same server path as `chats.send`. The server decides start or queue. `_sessions/execution:startExecute` and `enqueueMessage` are gone, and so is the user-row clean-up they needed.
- The web starts every session with `chats.start`, like the phone. MCP `create_session` uses it too. `sessions.create` is gone. `chats.start` now takes linked repos, a repo group and the MCP-only `fromSessionId` / `sentViaOrchestrator`.
- `_taskWorkflow/` is gone: link builders joined `_env/webAppUrl.ts`, task files moved to `_agentTasks/`, and the rest went to `_queues/`, `_sandbox/` and `_deployment/`. Importers use `TURN_BACKSTOP_MS` directly.
- The PR summary no longer keeps an old link for owners with no `pullRequests` rows. `parseFirstJsonValue` parses LLM JSON with a Zod schema. Sandbox MCP tokens name only a session.
- `check-schema-narrowing` now checks that every `schema-narrowing-ok` marker names a real migration, now or in git history.
