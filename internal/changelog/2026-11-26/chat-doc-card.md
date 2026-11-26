# Chat: a card for each doc the agent writes

- A doc made with `create_eva_doc` now shows as a card under the reply that made it, next to artifact cards.
- The card shows the title and first line; Read opens the body inline, and the link opens the doc page.
- Docs gain `chatParentId` and `messageId` (index `by_chat_parent`), set by `docs.anchorToChat`; `docs.listForChat` feeds the cards.
- Artifacts and docs share one anchor helper, `chatTurnAnchor`.
- Docs made before this change have no anchor and show no card.
