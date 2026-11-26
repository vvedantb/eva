# The web sends, stops and picks models through chats.*

- Every web chat (session, quick task, project) sends through `chats.send`, as the phone does. The server alone decides whether a message starts now or queues. The web still paints the user bubble and opens the turn at once when it expects a start.
- `chats.send` takes what the web composer sends: the picker's model, traits and account (`settings`), `displayContent`, `annotation`, attachments and `sourceProposedPlanId`. Without `settings` it uses the chat's sticky picks. The phone's Implement now marks the plan through `sourceProposedPlanId` too.
- `chats.stop` stops the exact chat it is given. Before, a non-Main chat in a task's or project's session stopped the Main chat. The web and MCP now call it; `sessions.stopChatTurn` is gone.
- The web model and traits picker calls `chats.setModel`. `sessionChats.setModel`, `sessionChats.setTraits` and the `sessionWorkflow.startExecute` / `enqueueMessage` aliases are gone. MCP still sends through `_sessions/execution`.
- A quiet comment in a project chat keeps its attachments and annotation on the stored row.
