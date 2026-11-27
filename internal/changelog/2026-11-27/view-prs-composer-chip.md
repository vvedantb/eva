# View PRs composer chip

- New experimental flag `viewPrsChip` (Settings → Experimental → Composer → "View PRs chip"). Off by default.
- With the flag on, session, quick task and project chats show a "View PR" / "View PRs" chip on the composer's chip row when the owner has pull requests. No PRs, no chip.
- The chip opens the same PR rows and actions as the chat's "…" menu (`PrActionsSubmenus`), so both stay in step.
- `SandboxChatBinding` now carries `prOwner`, so the shared `SandboxChatPanel` renders the chip once for all three chat surfaces. The query skips while the flag is off and in simple view.
