# Paged chat transcript

Load a chat's messages in pages, newest first, instead of the whole list.

## Why

- Today a chat subscribes to a 30-message tail, then to the full list (`useChatTranscript`). The full list of a 400-message chat reads 5.6 MB and returns 3.2 MB (loadtest, 2026-11-09).
- The full list stays subscribed. A change to any message in it sends the query result again.
- The tail already makes the first paint fast. Paging removes the full-list cost after it.

## Decisions (agreed 2026-11-11)

- Find-in-chat uses a server search, not the loaded pages.
- The jump rail uses a light index query of user messages only.
- The sub-agent roster uses the loaded pages plus live background agents. Old finished sub-agents can drop off.
- Mobile (`apps/mobile`) keeps `messages.listByParent` without paging. Out of scope.

## Steps

0. Measure the baseline on one heavy production chat: bytes on open, time to last-turn paint, time to full transcript, JS heap. Use the loadtest cases plus a browser trace.

### Backend (`packages/backend/convex`)

1. `messages.listPageByParent({ parentId, paginationOpts })`. Index `by_parent`, order desc, `.paginate()`. Run each page through the same URL resolution and `trimActivityLogForTranscript` as `listByParent`. Share that code, do not copy it.
2. Schema: add index `by_parent_and_role` (`["parentId", "role"]`) on `messages`.
3. `messages.userIndexByParent({ parentId })`. Reads only user rows through `by_parent_and_role`. User rows have no `activityLog`, so the read is small. Returns `{ _id, timestamp, preview }` with a preview of 120 characters or less.
4. Schema: add search index `search_content` on `messages.content` with filter field `parentId`. `messages.searchByParent({ parentId, query })` returns matching ids, oldest first.
5. Fork: move the prefix build to the server. The fork mutation takes `throughMessageId` and collects the prefix itself. The client no longer needs the full list to fork.
6. Remove the `tail` argument from `listByParent` when the web app no longer uses it. Mobile keeps the full form.

### Web (`apps/web`)

7. `useChatTranscript` becomes a paged hook: `{ messages, status, loadOlder, ensureLoaded(messageId) }`.
   - First page 30 (same as today's tail). Older pages 50.
   - Use the cached `usePaginatedQuery` from convex-helpers, so cached shells and `prefetchSession` share one subscription.
   - `"skip"` must keep the loaded pages (hidden session shells), like `useHeldResult` does now.
   - `ensureLoaded(id)` calls `loadOlder` until the row is present.
8. `ChatBody`: keep the render window (`TRANSCRIPT_TURN_WINDOW`). When the window reaches the oldest loaded row, `ChatEarlierTurnsLoader` calls `loadOlder` and keeps the reader's place with the existing anchor.
9. Jump rail ticks, and up-arrow recall (`buildMessageHistory`), come from `userIndexByParent`. A tick click calls `ensureLoaded`, then `revealMessage`.
10. Find bar: the query goes to `searchByParent`. Stepping to a match calls `ensureLoaded`. Highlight in the DOM stays as it is.
11. Targets older than the loaded pages call `ensureLoaded` first: a `?message=` link, and a NEW divider (`newSinceAt`). Cap the NEW divider load at 200 messages. Above the cap, the divider goes at the top of what is loaded.
12. Optimistic send (`useChatSend`): write to the paged query with `insertAtTop` from `convex/react`. Remove the two `listByParent` writes.
13. `prefetchSession`: prewarm the first page only.
14. `useSubagentRoster`, `useSessionAnnotationSend`, `isChatTurnExecuting`: read the loaded pages. They need only recent rows.
15. Update `packages/backend/loadtest/cases.ts` with the new queries.

### Verify

16. On a heavy chat, measure step 0 again: bytes, paint times, heap.
17. Use the browser and the per-frame scroll probe from PR #1251:
    - Open a chat and switch back to it: no flicker, and the chat lands at the bottom.
    - Scroll up through several pages with no jump.
    - Click an old rail tick, open an old `?message=` link, and step to an old find match. Each one loads pages and lands on the row.
    - Fork from an old message.
    - Send during a turn: the optimistic row appears and the reply streams in.
18. Check all three chat surfaces: sessions, quick tasks and projects.
19. `/ship`.

## Risks

- A Convex search index matches words and prefixes, not substrings. "auth" finds "authentication". "thenticat" finds nothing. Today's find matches substrings. Decide whether this is acceptable before step 10.
- Paged queries in Convex can split or merge pages when rows are added. New messages land in page 0. Check that the render window pin (a row id) still holds.
- A `?message=` link to a very old message loads every page down to it. That is the same cost as today, but only for that case.
