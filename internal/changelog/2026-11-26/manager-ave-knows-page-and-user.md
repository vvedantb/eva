# Manager Ave knows the page and the user

- Every message to Manager Ave now carries the page the user has open (path with search, page title) and their time zone (`ave.send` `pageContext`, read at send time in `useAveChat`). It is stored on the user row (`aveMessages.pageContext`).
- `ave.send` looks up the session, quick task, project or doc at that path (`_ave/pageEntity.ts`) and stores its kind, title and status. It uses the same repo access and visibility rules as chat link hover cards, so a path the user cannot read names nothing.
- The text the user last selected on the page goes with the message (`pageSelection.ts`). A `selectionchange` listener keeps it, because clicking into the composer clears the page selection. Selections inside Ave are ignored, and each selection is sent once.
- The run puts the page, the entity and the selection in front of each user turn (`_ave/context.ts`), so "this", "this error" or "this session" resolve without a follow-up question.
- Ave's instructions now name the user (name and admin flag; email is left out, as Ave has no use for it) and explain how to read the page lines (`_ave/prompt.ts`).
- `pageContext` is required on `ave.send`; no compat shim. Only the web app calls it.
