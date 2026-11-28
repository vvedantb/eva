# Session chat on the shared sandbox chat panel

- The session chat is `SandboxChatPanel` on a session binding (`useSessionChatBinding`). Session-only parts (header, chat tabs, plans, fork, checkpoints, publish recovery, background processes) come in as slots. `useSessionAnnotationSend` is gone; `useSandboxAnnotationSend` covers it.
- One account handoff per chat: the binding carries `useChatModel`'s switch, so the panel no longer makes a second one.
- Every chat now toasts a failed question answer, shows the starting and stopping titles, waits for the account before offering a switch, and stays read-only (no wake, no slash commands) when archived.
- One rail hook, `useSandboxRail`, and one `SandboxRailPanes` for the session, quick task, project and project task rails. Hidden tabs use `KeepAlivePane`, not a `hidden` class. Every rail toasts a failed browser unlock and passes read-only to the Agents tab.
- One auto-wake rule, `sandboxAutoWakeEligible` in `@eva/shared`. A failed last start no longer auto-wakes a task or project sandbox.
- One start and stop hook, `useSandboxControls`, with one error copy: "Couldn't start sandbox" / "Couldn't stop sandbox" (web and phone).
