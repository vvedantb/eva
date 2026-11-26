# Preview comments drawer (v1)

Status: v1 shipped in #1528 (backfill run on prod, then removed). v2 (resolve / reopen) shipped in #1539 and #1541. v3 onwards are still ideas.

## Context

Preview annotations ("Select element") post into the chat, but you cannot see them from the preview. v1 adds a "Comments" button to the preview action bar. It opens a drawer over the preview that lists every annotation in the active chat, with the agent's reply and a "View in chat" link. A switch filters "On this page" / "All comments".

Scope: web only (the phone app has no preview annotations). It covers sessions, quick tasks and projects, which share one annotation send path. Comments still post to the chat exactly as today.

Later phases (not in this plan):

- v2: resolve and reopen, an Open / Resolved filter, the badge counts open only, optional MCP tool so the agent resolves.
- v3: reply from the card. The `messages.replyTo` thread system (`addReply` in `_sessions/execution.ts`) already exists, so the card can reuse it.
- v4: Eva review page for a separate tab. v5 (maybe): toolbar inside the bare sandbox tab.

## Verified facts

- Every annotation send goes through `sendSandboxTurn` (`apps/web/src/lib/components/chat/sandboxChatTurn.ts`), via `sandboxAnnotationSender` and `annotationSender` (`lib/components/sandbox/annotationSend.ts`).
- The user row is written in exactly two places:
  1. Idle (`start`): `ports.add` calls `api.sessions.addMessage` (`_sessions/mutations.ts:306`), alongside `startExecute`.
  2. Busy (`queue`): `enqueueMessage` calls `sendSessionChatMessage`, then `enqueueChatMessage` inserts `queuedMessages`. When the queue drains, `insertUserMessage` (`_queues/helpers.ts:649`) inserts the row with `displayContent ?? content`.
- Messages carry no structured annotation data today. The chat text ends with `\n\n[Annotated <tag.cls> on /path]` (`buildAnnotationDisplay`, `sessions/_utils/-previewAnnotation.ts:305`).
- `?message=<id>` opens and flashes a chat row (`lib/components/chat/messageLink.tsx`, `MESSAGE_LINK_PARAM`).
- `PreviewActionBar` is a body portal positioned with `useIframeBox`, because the iframe paints in the fixed z-40 host overlay.
- Indexes on `messages`: `by_parent`, `by_parent_and_reply_to` (transcript rows have `replyTo` unset).
- `@convex-dev/migrations` 0.3.5 is installed.

## Phase A: shared format (`packages/shared`)

A1. NEW `packages/shared/src/previewAnnotationDisplay.ts`:

- `buildAnnotationDisplay(feedback, element, pagePath)`, moved from the route utils. The web `buildAnnotationDisplay(feedback, ctx)` becomes a thin call to it.
- `parseAnnotationDisplay(content) → { feedback, element, pagePath } | null`. The one parser, used by the backfill (B5) and by the card to show the feedback without the suffix.
- Builder and parser sit side by side, so the format cannot drift.

## Phase B: backend

B1. `_validators/tableFields.ts`: add `previewAnnotationValidator = v.object({ pagePath: v.string(), element: v.string(), selector: v.optional(v.string()) })`. Selector is optional because backfilled rows do not have one. Add `annotation: v.optional(previewAnnotationValidator)` to `messageFields` and `queuedMessageFields`.

B2. `schema.ts`: add a `messages` index `by_parent_and_annotation_page` on `["parentId", "annotation.pagePath"]`. Rows without an annotation sort as `undefined`, so a `gte("annotation.pagePath", "")` range returns annotated rows only. There is no scan of the full transcript.

B3. Write paths, with one optional `annotation` arg each:

- `sessions.addMessage` stores it on the row (user role only).
- `sessionWorkflow.enqueueMessage`, `sendSessionChatMessage` and `enqueueChatMessage` store it on `queuedMessages`.
- `insertUserMessage` in `_queues/helpers.ts` copies `next.annotation` to the row.
- `queuedMessages.update` clears `annotation` with `displayContent`. An edited queued annotation already becomes a plain message.

B4. NEW `convex/previewComments.ts`, `list({ chatId })`, an `authQuery` behind `getSessionChatWithAccess`:

- Reads annotated messages through B2 (`take(200)`), plus annotated `queuedMessages` for the chat.
- For each message, the reply is the first assistant row after it in the transcript (`by_parent_and_reply_to`, `replyTo` undefined, `_creationTime >` the row), stopping at the next user row. At most a few reads per comment.
- Returns `{ id, kind: "message" | "queued", feedback, element, pagePath, timestamp, reply }`. `reply` is `{ status: "working" | "done" | "stopped" | "failed", excerpt? }`. The excerpt is plain text, capped at 280 characters.
- Sorted newest first.
- Name note: `convex/annotations.ts` already belongs to the Chrome extension pins. Do not reuse that name.

B5. Backfill with `@convex-dev/migrations` over `messages`: for each user row with no `annotation`, run `parseAnnotationDisplay(content)`, then patch `annotation` (no selector). A row that does not parse is skipped. Run it once on dev, then on prod.

## Phase C: web

C1. Send path: `AnnotationSubmit` becomes `(display, full, annotation)`. `PreviewAnnotationLayer` builds `{ pagePath, element: elementChip(ctx), selector }` from `pending.context`. `SandboxTurnInput.annotation` flows into `ports.add` and `ports.enqueue`.

C2. Props: replace `onAnnotationSubmit` with one `annotation?: { submit: AnnotationSubmit; chatId: Id<"sessionChats"> }` prop. It goes through `SandboxPaneSlots` to `WebPreviewPanel`. Each surface (`sessions/SandboxPanel.tsx`, `TaskSandboxPanel.tsx`, `ProjectSandboxPanel.tsx`) passes the chat it already sends to.

C3. NEW `_components/usePreviewComments.ts`: `useQuery(api.previewComments.list, active ? { chatId } : "skip")`, the same cached hook the chat uses. It is skipped while the pane is hidden.

C4. `PreviewActionBar`: new optional `comments?: { count; active; onToggle }`. Button with `IconMessages`, a count badge and the tooltip "Comments". It sits right after "Select element". The count is all comments.

C5. NEW `_components/PreviewCommentsDrawer.tsx`: a body portal placed over the iframe with `useIframeBox`, the same as the action bar. It is right-aligned, `min(320px, 62%)` wide and full iframe height, and it does not resize the app.

- Header "Comments" with a close button.
- Switch "On this page" / "All comments" with counts. Reuse the `Tabs` already used for the design preview device toggle. The scope is `useState` in the drawer.
- "On this page" compares the normalised `pagePath` with `normalizePreviewPath(previewPath)`.
- "All comments" groups by `pagePath`.
- Empty state: "No comments on this page" and "Use Select element to add one."
- Esc closes the drawer.
- The action bar stays centred over the free part of the preview while the drawer is open.

C6. NEW `_components/PreviewCommentCard.tsx`:

- Element chip, relative time, feedback text.
- Reply block: "Working…" with a dot, or the excerpt (3-line clamp), or "Queued" in the warning tone, or nothing when stopped or failed.
- "View in chat" sets `?message=<id>` with nuqs. If the preview is fullscreen or popped out, it leaves that mode first so the chat is visible.
- A queued comment has no message id yet, so it has no "View in chat" link. This is a change from the mockup.

C7. `WebPreviewPanel`: `commentsOpen` in `useState` per pane. It wires C4 and C5. Opening Select element does not close the drawer, so you can add comments with the list open.

## Edge cases

| Case | Handling |
| --- | --- |
| Busy agent | Queued row shows "Queued". It becomes a message row when the queue drains, and the annotation moves with it. |
| Edited queued annotation | `annotation` is cleared, so it leaves the drawer. This matches how `displayContent` behaves. |
| Project question routing (`routePersonChatMessage` writes its own row) | Annotation not stored. Rare, accepted. |
| Old comment that cannot be parsed | Not in the drawer, still in the chat. |
| Chat with more than 200 comments | Newest 200 only. |
| Several preview panes | Each pane has its own drawer state. Data is per chat, so all panes show the same list. |
| Agent reply is a thread reply | Ignored. Only transcript rows (`replyTo` unset) count as the reply. |

## Verification

1. `cd packages/backend && npx convex codegen --typecheck enable`; `cd apps/web && npx tsc`.
2. Unit test for `parseAnnotationDisplay` round-tripping `buildAnnotationDisplay`. It calls real code.
3. Live check in a session:
   - Annotate while idle and while busy. The drawer shows Queued, then Working…, then the reply.
   - The page switch follows navigation inside the iframe.
   - "View in chat" scrolls and flashes the row, also from fullscreen.
   - Also check a quick task and a project.
4. Run the backfill on dev. Old comments appear and can be linked.
5. `/changelog`, `/parallel-awaits --diff origin/main`, then `/ship`.

## Unresolved questions

- None that block. Icon: `IconMessages` (chosen, not asked for).
