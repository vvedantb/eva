# Chat column lines up with the side panel

- The chat's top controls start on the side panel's top edge, and the composer's last row ends on its bottom edge, on project, task and session pages (desktop). The side panel sits 8px in (`md:my-2`); the chat header row and the composer now use the same 8px.
- Files: `SandboxChatHeaderActions` (`pt-2`, and top-aligned when it holds a project's tabs), `ChatComposer` (`md:pb-2`), `ChatPageWrapper` session header (`sm:py-2`).
- Web only: the phone has no side panel.
