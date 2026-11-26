# Preview comments: resolve and reopen (v2)

- Each sent comment in the preview comments drawer has Resolve, and a resolved one has Reopen. Anyone who can open the chat may do either, as with doc comments. Queued comments cannot be resolved yet.
- A second tab row filters Open / Resolved (default Open). Each row's counts follow the other row's choice. A resolved card is faded and says who resolved it and when.
- The toolbar badge counts open comments only.
- Backend: `annotation.resolvedAt` / `annotation.resolvedBy` on the user row (`storedPreviewAnnotationValidator`; sends still use `previewAnnotationValidator`, so a send cannot set them). New mutation `previewComments.setResolved`; `previewComments.list` returns `resolved: { at, byName }`.
- People only: Eva cannot resolve a comment yet (no MCP tool).
- The drawer's two filters and doc comments' Open / Resolved use the segmented `Tabs` (`tabs-segmented`) instead of the hand-made `CommentFilterTab`, which is deleted.
