# Preview comments drawer (v1)

- The preview's floating toolbar has a "Comments" button with a count, next to "Select element". It opens a drawer over the right of the preview that lists the chat's preview annotations: "On this page" / "All comments" (grouped by page), newest first.
- Each card shows the element, the time, the feedback and Eva's reply (Working…, a 3-line excerpt, or Queued). "View in chat" sets `?message=<id>` and leaves fullscreen first. Esc closes the drawer; it hides while Sketch or the mini-player has the preview.
- User rows and queued rows carry `annotation` (`pagePath`, `element`, `selector`); `sessions.addMessage`, `sessionWorkflow.enqueueMessage` and the queue drain write it, and editing a queued annotation clears it. New query `previewComments.list` reads them through `messages.by_parent_and_annotation_page`.
- The chat suffix `[Annotated <el> on /path]` is built and parsed in one place, `@eva/shared/previewAnnotationDisplay`.
- Backfill for older comments: `npx convex run --prod dataMigrations:run '{fn:"dataMigrations:backfillPreviewAnnotations"}'`.
- Doc comments' Open / Resolved buttons and the drawer's switch share `CommentFilterTab`.
- Sessions, quick tasks and projects; web only (the phone app has no preview annotations).
