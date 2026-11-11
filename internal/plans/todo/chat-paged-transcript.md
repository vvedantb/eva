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

## Status

PR 1 (paged history) is built. What changed from the first draft, and why:

- No `usePaginatedQuery`. Its page args carry a per-hook id, so pages never share a cache key: no prefetch, no sharing between hooks. Instead:
  - Live rows: `listByParent({ since })`, anchored on the oldest row of the first 30-message tail (`useChatTranscript`).
  - Older rows: one `listByParent({ before, tail })` query whose size doubles (50, 100, 200, 400, then `before` alone), in `useOlderTranscript`. It re-reads at most twice what the reader loads.
- `hasMessagesBefore` (one row read) says whether history exists before any is loaded. A quick task's first run waits on it.
- The user-row query is `listUserMessagesByParent`. It returns full content, because up-arrow recall needs it.
- Hidden shells hold only the tail (from #1247); loaded older rows drop and reload on return.

## Remaining: PR 2

1. Schema: search index `search_content` on `messages.content`, filter field `parentId`. `messages.searchByParent({ parentId, query })` returns matching ids, oldest first. Whole words and word starts are fine (agreed 2026-11-11).
2. Find bar: the query goes to `searchByParent`; stepping to a match calls `reach({ messageId })`. Remove the "load all" stopgap in `revealFirstFindMatch`.
3. Fork: the fork mutation takes `throughMessageId` and builds the prefix on the server. Remove the "load all" stopgap in `openFork`.
4. When nothing calls `before` without `tail` any more, drop that form from `listByParent`.
5. Measure on a heavy production chat: bytes on open, time to last-turn paint, JS heap. Compare with the loadtest numbers above.
6. `/ship`.

## Risks

- A `?message=` link to a very old message loads every step down to it: the same cost as before, but only in that case.
- Until PR 2, find and fork load the whole chat on use.
