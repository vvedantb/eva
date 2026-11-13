# Changelog

## Phone: cheaper tab switches

Date: 2026-11-13

WHY: Tapping tabs quickly lagged. Each switch re-rendered all four tab bar buttons with their SVG icons (the kit is not built with React Compiler), and the Android glass blur target was a context value above every tab, changed twice per switch, so React walked every mounted tab each time.

Architectural: native-ui packages#206 and #207 memoise each tab (`TabBarItem`) and keeps the blur target in a small store read with `useSyncExternalStore`. Measured on the phone web build, 12 switches at 4× CPU: app JS 439 → 277–294 ms, renders per switch 276 → ~195, median tap → first commit 77 → 64.5 ms. Not done: `freezeOnBlur` (a frozen tab never re-renders to inactive, so the blur hand-off would break).

## Session chats: Delete a parallel chat and all its messages

Date: 2026-11-13

WHY: Users could only rename chat tabs. Extra chats piled up with no way to clear them.

- Web: right-click a chat tab → Delete → confirm dialog. Not on Main; disabled while the chat runs. Deleting the open chat switches to Main.
- Backend: `sessionChats.remove` hides the chat (`archived`), drops its queued sends and the caller's draft, then `_sessionChats/purge.purgeDeletedChat` deletes messages 100 per run, then cards, env requests, proposals and closed turns. The chat row stays as a tombstone so `?chat=N` numbers are never reused.
- Architectural: `deleteChatRows` moved from `_migrations/deleteRepos.ts` to `_sessionChats/purge.ts` (optional page size) and is shared by both. `tests/sessionChatTabs.test.ts` called a removed `archive` mutation; it now covers `remove`.

## CI: main is green again

Date: 2026-11-13

WHY: Main's CI failed on every run, so new failures hid among old ones and PRs merged with `--admin`; the Hermes, shared-backend and APK guards only block once main is green.

Architectural: `useSandboxLifecycle.run` uses `.finally` instead of a `try`/`finally` statement (React Compiler bailed on the whole file); the agent-browsing auto-switch effect keeps its `no-event-handler` disable with the reason (a live query change has no local event). `sessionChatTabs.test.ts` sets `archived: true` on the row, since `_sessionChats.mutations.archive` was removed (c686b9ad3) but old closed chats keep the flag. `MaintenanceScreen` uses `ui-surface` (16 px corners, was 8); the BackgroundProcessesChip pill is marked deliberate like its BackgroundAgentsChip sibling. The design baseline drops one stale entry.

## Phone: chat ⋯ menu rows lay out icon and label in one row again

Date: 2026-11-13

WHY: On Android every menu row stacked its icon above its label. The kit's `MenuRow` kept its layout in a function `style`; NativeWind's `Pressable` interop rebuilds `style` from the inline value on native and drops a function, so the row fell back to React Native's default column. Web does not take that path, so the preview looked right.

Architectural: native-ui packages#205 moves the layout to a plain style object and draws the press highlight from the `pressed` render state; the labelled Conversation scroll pill gets the same fix. Kit tests assert both styles are objects.

## CI: one backend for web and phone, and installed APKs keep working

Date: 2026-11-13

WHY: The phone drifted onto its own Convex functions (`mobile.*`), and a backend change broke installed APKs (0.1.33). The owner wants one backend, logic in `@eva/shared`, and apps that hold only UI.

Architectural: `scripts/check-shared-backend.mjs` fails when the phone calls an `api.*` function the web never calls, unless `ALLOWED` gives the reason (push tokens; `mobile.*` while it moves to `chats.*`). `scripts/check-apk-compat.sh` type-checks the newest `eva-apk-*` release's phone and shared code against the changed backend, and fails on any error (it catches the 0.1.33 break; skips when the backend did not change). Both run in CI. CLAUDE.md gains the three rules.

## Backend: chat actions under one neutral name (chats.*)

Date: 2026-11-13

WHY: The owner wants one backend for both apps. The phone's `mobile.*` functions (open a chat by target, send, stop, set model, start a session, archive) already make each decision once on the server; the web makes the same decisions in the browser. They now live in `convex/chats.ts` (`get`, `send`, `setModel`, `stop`, `start`, `archive`) for both apps to use.

Architectural: `mobile.ts` keeps the old names as re-exports of `chats.*` for installed APKs (a test checks `mobile.getChat` equals `chats.get`), plus the deprecated `listChats`. Next: the phone switches to `chats.*` once prod Convex has this module; then the web moves onto `chats.*` one action at a time; then `mobile.ts` goes.

## Lint: wider Hermes guard for phone and shared code

Date: 2026-11-13

WHY: `toSorted` in shared code crashed the phone Sessions tab (#1299). TypeScript cannot catch this here: some packages pull in ESNext lib types for every project, and `packages/shared` is not in the root typecheck.

Architectural: The apps/mobile + packages/shared override in `.oxlintrc.json` also forbids `Object.groupBy`, `Map.groupBy`, `Promise.withResolvers`, `Array.fromAsync` and the `structuredClone` global. Set methods (`union`, ...) stay allowed: their names collide with `z.union`. The mobile `test` script no longer runs `hermesApis.test.mjs`, deleted in #1156.

## Phone: Sessions tab no longer crashes ("undefined is not a function")

Date: 2026-11-13

WHY: The phone Sessions tab showed "Could not start Eva — undefined is not a function". The shared session-list code (`sessionList.ts`, used by the phone since #1291) and `SessionGroup.tsx` call `Array.prototype.toSorted`, which Hermes lacks; the web preview runs on Chrome, which has it.

Architectural: Every `toSorted` became `[...list].sort(...)` (same result). `.oxlintrc.json` now forbids `toSorted`, `toReversed` and `toSpliced` in apps/mobile and packages/shared, so this cannot come back unnoticed (the old `hermesApis.test.mjs` guard was removed in #1156).

## Phone: lighter first open of list tabs

Date: 2026-11-13

WHY: The first open of Sessions and Projects mounted 600 to 1,000 components.

Architectural: native-ui `SwipeableRow` mounts its action strips on the row's first touch (packages#202), so Inbox and Sessions rows no longer mount hidden buttons and icons up front (Sessions first open 641 → 596 mounts on the preview). Every long list (Projects, Project tasks, Quick Tasks, Reviews, Timeline, Docs, Drafts, Today) now uses `LIST_WINDOW`, as Inbox and Sessions do; the diff view keeps its own sizing (22 pt lines). The rest of the Projects cost is card weight (NativeWind wrappers, SVG icons).

## Phone: chats load like the web (newest 30, then older pages)

Date: 2026-11-13

WHY: The phone read a chat's whole transcript at once (`messages.listByParent` with no range: about 3.2 MB for 400 messages), which the web stopped doing.

Architectural: The load plan moved to `@eva/shared` (`transcriptTailArgs`, `transcriptLiveArgs`, `olderTranscriptArgs`); the web's `useChatTranscript` uses it. The phone's new `src/chat/useChatTranscript.ts` opens on the newest 30, follows `since` the oldest of them, and loads older pages (50, 100, 200, 400, then the rest) when the inverted list nears its top (`onEndReached`), with a spinner while one loads. Fork asks the server for its prefix (`forkPrefixByParent`) while history above is not loaded, as the web does.

## Phone: Sessions and Projects tabs compile; lighter lists and chat rows

Date: 2026-11-13

WHY: Tab switches still lagged. The React Compiler bailed on the whole Sessions and Projects screens, session rows got new handlers on each render, the Inbox mounted all 100 rows at start, and every chat message redrew on each list batch.

Architectural: The section lookup moved out of the screens (`src/ui/sectionIndex.ts`): a `findIndex` on a pill list that was sometimes the module constant hit a compiler internal error ("MethodCall::property must be an unpromoted + unmemoized MemberExpression"). `SessionListRow` takes stable `onOpenMenu` / `swipe` / `onSwipe`. Inbox and Sessions lists use `LIST_WINDOW` (12 first, window 7, batches of 8). Chat messages are a compiled `ChatMessageRow` with id-taking handlers. A full compiler scan of apps/mobile now finds no bailouts.

## Removed the snapshot Config Files settings page

Date: 2026-11-13

WHY: No repo used it. The `sandboxConfigFiles` table had 0 rows on prod and dev.

- Web: removed the Config Files tab and its upload UI from snapshot settings. `/settings/snapshots/config-files` is no longer a tab; the existing unknown-tab guard sends it to `configuration`.
- Convex: deleted `sandboxConfigFiles.ts` and dropped the `sandboxConfigFiles` table.
- Snapshot build: no config-file download, no `/home/eva/sandbox-config` copy. The `startup-pre-daemon` stage existed only for config-file moves, so all startup commands now run after the daemons.
- Sandbox start: removed `copySandboxConfigFilesToWorkspace` and the "Restoring config files..." step.

## Chats: the agent can suggest a new session in a card

Date: 2026-11-13

WHY: An agent asked for unrelated work mid-task either did it in the same chat, which mixed two changes on one branch, or called `create_session` on its own. The user had no say.

Architectural: New eva MCP tool `propose_session` (`mcp/chatSelfTools.ts`, mounted for sessions, quick tasks and projects) stores a `sessionProposals` row (title, reason, brief) anchored to the latest message. `ChatBody` places it as an inline card like `request_env_var`. "New session" calls `sessionProposals.start`: `createSession` in the same repo on the repo defaults, the brief as first message, joined to the linked-session group; the user stays in the chat and the card becomes a link. "Do it here" calls `sessionProposals.keepHere` and posts the returned message to the agent. Nothing runs before a click and cards do not expire. The chat runtime prompt names the tool. Needs a Convex deploy.

## Sandboxes: a deployment never touches another deployment's VMs

Date: 2026-11-13

WHY: Session sandboxes stopped in the middle of a turn. The prod-to-dev sync copies prod's Vercel credentials and session rows to dev, so dev's leak sweep and idle pause stopped running prod VMs from a stale copy of their owner rows. Prod never asked for the stop, so the chat showed only "Sandbox stopped while this turn was running."

Architectural: `foreignSandboxDeployment` (`_sandbox/tags.ts`) compares a VM's `eva.deployment` tag with the own Convex slug. `VercelSandboxClient.get` throws a 404 `SandboxProviderError` for a foreign VM, so every stop, exec and delete classifies it as sandbox-gone and drops the mirrored row. `sandboxLeakSweep` skips foreign VMs in the list. `sync-prod-to-dev.mjs` runs the new `sandboxIdlePause.switchOffInternal` after the import. Untagged VMs (created without `ENVIRONMENT`, or with five caller tags) are not protected.

## Chat alerts: amber warnings, icons; VM memory on the turn heartbeat

Date: 2026-11-13

WHY: Session 427's VM stopped three times with no reason in the logs, and the "Sandbox startup unfinished" warning (session still running) looked like a red error.

Architectural: `messages.alertTone` (optional `"warning"`) marks system alerts that did not fail the session; `sandboxStartupWarning` and the seeded-restore alert set it. `SystemAlertMessage` renders warnings with an amber triangle and "View details", and alerts with `errorDetail` with a red circle and "View error"; plain dividers stay icon-less. The callback daemon reads `/proc/meminfo` (`runtime/vmMemory.ts`) and adds `memTotalMb`/`memAvailableMb`/`swapUsedMb` to the HMAC heartbeat at most every 30s; the `/api/streaming/heartbeat` route logs `[heartbeat][vm]` so Axiom shows memory pressure before a VM dies.

## Phone: Sessions tab reads the web's session lists and shows linked groups

Date: 2026-11-12

WHY: The phone Sessions tab read `mobile.listChats`, a cross-repo wrapper with its own fields and caps, and did not show linked session groups as the web sidebar does.

Architectural: The tab subscribes as `GlobalSessionsSidebar` does: `githubRepos.list`, then one `sessions.list` (Active) or `sessions.listArchived` (Archived) per repo through `useQueries`. `linkedSessionGroups`, the sort orders and sort helpers, `sessionListEntries` (groups and apps as one ordered list, lifted out of the web sidebar) and `perRepoQueryCache` (stable `useQueries` maps) moved to `@eva/shared`; the web sidebar uses them with no behaviour change. Linked groups draw as a section with the link tile, name and member count, open by default; member rows show their app mark. A long press on a group header offers Rename group (`sessions.renameGroup`), and a group row's menu has Remove from group (`sessions.removeFromGroup`, via `sessionMenuActions({ inGroup })`). `mobile.listChats` stays for APKs up to 0.1.43 and is marked deprecated.

## Phone: a working session shows the web "Working" grid

Date: 2026-11-12

WHY: A session whose agent was mid-turn showed only its status dot on the phone; the web sidebar shows the animated Drive pixel grid.

Architectural: `mobile.listChats` returns `isExecuting`, from `sessionIsExecuting` over `chatTurnFlagsForRepos` (one open-turn read per listed repo, as the web list; it also replaces the separate awaiting-answer read). `RowStatus` follows the web `SessionStatusLeading` order: question mark, then native-ui `LoadingState` (`size="sm"`), then the dot. Quick task rows swap their system spinner for the same `WorkingMark`, as the web `QuickTaskCard`. The grid holds still while its tab is not focused.

## Phone: Inbox select mode as Android's contextual action bar

Date: 2026-11-12

WHY: Select mode started only from a header icon, its bar showed unlabelled 36 pt icons, and it floated over the last row with the tab bar still under it.

Architectural: A long press on a row starts select mode with that row ticked and a light haptic (in select mode it ticks, as a tap). While selecting, the Inbox sets `tabBarStyle: { display: "none" }` with `<Tabs.Screen options>`, native-ui `FloatingTabBar` hides on it, and `BulkActionBar placement="tabBar"` sits in the same slot with labelled 48 pt actions. The header shows "N selected" with a close X (native-ui `PageHeader leading`) and hides the page actions.

## Phone: segmented switches slide

Date: 2026-11-12

WHY: Open / Closed / All (Reviews), Active / Archived (Sessions) and the project tabs jumped; the web segmented pill slides.

Architectural: `SegmentedTabs` passes `TabsList` a `progress` value (`useDerivedValue(() => withTiming(index))`, the web `--tabs-dur` 200 ms and `--tabs-ease`, instant under Reduce Motion), so the kit draws one sliding thumb instead of a fill per trigger.

## Phone: Neutral theme, shared with the web

Date: 2026-11-12

WHY: The web has four appearance modes (Light, Neutral, Dark, System); the phone had three, and kept its pick on the phone only, so the phone and the web could show different themes.

Architectural: `EVA_THEME.neutral` (`@eva/shared`) is the dark palette with the web `.dark.neutral` surfaces. Neutral is dark-family: NativeWind runs "dark", `applyEvaTheme("neutral")` repaints the kit's dark slot (native-ui `configureTheme` now redraws mounted parts), and the root layout sets the changed global.css variables with NativeWind `vars` for class colours. The app's `useScheme()` returns light, dark or neutral, and app code reads its colours from `EVA_THEME[scheme]` only, so React Compiler memos follow a Dark to Neutral pick. The mode is the account's `auth.getTheme` once loaded (SecureStore is the start value); a pick writes both, as the web `ThemeModeProvider`. `isThemeMode` and `themeAppearance` moved to `@eva/shared`; the web uses them.

## Phone: queued messages show above the composer

Date: 2026-11-12

WHY: On the phone, messages sent while Eva was busy disappeared until they ran. The web shows them above the composer, where you can steer with them, edit, reorder or delete them.

Architectural: `QueuedMessagesPanel` (apps/mobile) reads `queuedMessages.listByParent` with the session chat id from `getChat` and calls the web's own `update`, `remove`, `reorder` and `steer`, with the same optimistic updates. The chat screen builds it and hands it to `ChatDock` as one element, so a keystroke does not redraw it. The web's hover actions and drag reorder are a sheet (Edit, Move to front, Move up, Move down, Delete); Steer stays on the row. The heading, the row text and the reorder rule are in `@eva/shared` (`queuePanelLabel`, `queuedMessagePreview`, `moveQueuedId`, `orderQueuedRows`), and the `<review_comment>` reader moved there too (`stripReviewCommentBlocks`, `parseReviewCommentSegments`); the web uses them with no change in behaviour.

## Phone: a chat opens at its newest message

Date: 2026-11-12

WHY: On the APK, a chat opened at its top and then scrolled to the bottom. The list drew its oldest rows first, jumped to an end it measured, and then rendered and measured the newer rows in batches, so the content height changed again and the list jumped again after it showed.

Architectural: The chat transcript is an inverted `ConversationList` (kit `inverted`, data newest first). The newest message is row 0 at the bottom, so the first frame is already at the end with no scroll. The "Working…" line is the list header (the bottom when inverted). The thread's side padding moves into each row, as Android flips an inverted list on both axes.

## Phone: faster on resume, on the Inbox and while typing

Date: 2026-11-12

WHY: The phone app froze for a moment when it came back from the background, the Inbox stalled for seconds after it opened, and typing in a chat lagged. Measured on the 390×844 web preview at 4× CPU throttling: a reconnect redrew 7,720 components (a 650 ms task), the Inbox redrew about 40,000 while it drew its 100 rows, and each keystroke redrew the whole transcript.

Architectural: The app's Convex client is a `StableConvexClient`: a query result whose JSON equals the last one keeps the last object, so the reconnect after resume (every query sent again, unchanged) redraws nothing. The Inbox passes the same handlers to every `NotificationRow`, and its `BackHandler` effect comes before the derived values, so the React Compiler memoises the list and a row draws only when its notification changes. The chat's question card and composer move into `ChatDock`, which owns the draft, the attachments and the model pick, so a keystroke redraws the dock only.

## Phone: image attachments upload on Android

Date: 2026-11-12

WHY: An image picked on the phone never reached the chat: the message went out with an empty `attachmentStorageIds`, and the failed upload dropped the chip with no message.

Architectural: `useAttachments` asks the picker for base64 and posts the bytes (an `ArrayBuffer`) to the Convex upload URL with `expo/fetch`, not React Native's `fetch` of a file-URI Blob. A failed upload shows "Couldn't upload the image" instead of vanishing.

## Phone: the live turn shows its steps and text

Date: 2026-11-12

WHY: While Eva worked, the phone chat showed only "Working…" and then the finished reply. It never read the chat's streaming row, so the current step, the tool timeline and the streamed text that the web shows were missing.

Architectural: `findStreamingTargetMessage` and `chatStreamingEntityId` move to `@eva/shared`; the web re-exports and uses them with no behaviour change. The phone's `LiveAssistantMessage` reads `api.streaming.get` for the oldest unfinished reply and draws it with `AssistantMessage`, the same trace as a finished reply. Only that row subscribes, so a token does not re-render the transcript, and the activity is deferred (`useDeferredValue`) as on the web. Before the first visible step it shows the web header: a spinner and the live step's label, or "Working...".

## Late PR webhooks no longer reopen a merged PR

Date: 2026-11-12

WHY: Session 1004 showed PR 1274 as open after it merged. `gh pr ready` and `gh pr merge` ran a second apart; the merge webhook closed the session, then the late `ready_for_review` webhook set the PR row back to open.

- `handlePullRequestEvent` ignores a live state (open/draft) for a merged or closed row unless the action is `reopened`. Title and branches still update.

## Phone: "Update available" prompt; solid composer

Date: 2026-11-12

WHY: An APK has no over-the-air updates, so an old one kept calling the backend as it was built and broke silently (0.1.33 after #1266/#1267). On a phone the keyboard lifts the composer over the transcript, and its 70% footer and clear dock let the messages show through.

Architectural: `src/update/updateCheck.ts` reads the public GitHub releases list once at start (Zod-parsed), takes the highest `eva-apk-*` tag above `Constants.expoConfig.version`, and `UpdateDialog` offers it (Download opens the APK; Later stores the version in SecureStore). Local builds (0.1.0) and failed checks offer nothing. The composer footer mixes the web `bg-muted/70` over the page background into one solid colour, and `ConversationDock` takes the page background.

## Collaborators can switch the account in quick task and project chats

Date: 2026-11-12

WHY: In a teammate's quick task chat, picking another account did nothing. `SandboxChatPanel` returned early unless the viewer created the task. The session chat and `sessionChats.setProviderAccountId` already let any repo collaborator switch among the owner's accounts.

Architectural: `SandboxChatBinding` drops `isOwner` and `pickerAccounts`; `accounts` is always the owner's pool. Projects now use `userProviderAccounts.listForProjectOwner` (was the viewer's own accounts plus a synthetic owner row, which the backend rejected for teammates).

## Agent feedback cards use the shared card placement

Date: 2026-11-12

WHY: `submit_feedback` cards were keyed only by `messageId`. A card whose turn was hidden (simple view) or that had no turn was silently dropped.

Architectural: `groupChatFeedback` returns `agentReports` as a list. `ChatBody` places artifacts and reports together through `placeChatUiPanels` (`turnOutputPlacement`), so both follow one rule, in creation order.

## Chat cards stay with their turn, not at the bottom

Date: 2026-11-12

WHY: Every artifact (and older `render_ui` / `render_html` card) showed at the end of the chat. The transcript loads only recent messages, so cards anchored to unloaded older messages fell into the "trailing" bucket.

Architectural: `placeChatUiPanels` now takes the rendered rows and `hasOlderHistory`. A card with an unrendered anchor goes under the newest row created at or before it; a card older than the loaded window waits until that history loads. Trailing is only for cards older than every row with full history loaded.

## Retry Vercel exec on dropped connections

Date: 2026-11-12

WHY: Opening a terminal failed with `vercel exec failed ... fetch failed`. Undici dropped the HTTP connection to the Vercel API, and `exec` only retried a closed command stream, so the pty connect action threw.

Architectural: `_sandbox/vercelProvider.ts` `isRetryableExecFailure` (was `isVercelCommandStreamClosed`) also matches `fetch failed`, `UND_ERR_SOCKET`, `ECONNRESET` and `socket hang up`, so every `exec` gets one refresh+retry on a transit failure. A failed refresh no longer hides the exec error.

## Bounded handoff read; clear stale task runs

Date: 2026-11-12

WHY: A large chat (163 rows, ~8.8 MB) failed every send and queued dequeue with "Too many bytes read": one send runs handoff detection twice (alert, then prompt), and each read took the newest 400 messages. Separately, one cancelled task kept a `running` run from the 0b migration.

Architectural: `_shared/modelHandoff.ts` `readHandoffHistory` reads the newest messages in batches of 4 and stops at 400 rows or 2 MiB (`HANDOFF_SCAN_BYTE_BUDGET`); both `maybeInsertModelHandoffAlert` and `prependModelHandoffContext` use it. `_agentTasks/runState:finishStaleTerminalRuns` (`{ dryRun? }`, self-paginating) ends the run of done/cancelled tasks idle for 24 h with no open turn and a terminal or absent `agentRuns` row, through `finishTaskRun`.

## Phone: maintenance screen; new APK for the session-chat backend

Date: 2026-11-12

WHY: With `MAINTENANCE=1`, the web shows a maintenance screen but the phone showed its start-up error. The published APK (0.1.33, from `a5f5d4e2b`) predates #1266 and #1267: its project page sends a project id to `chatReads.isUnread`, which now takes session ids, so it crashes, and task and project chats without a session cannot send. Main's phone code already fits; this `feat` merge releases it.

Architectural: `MaintenanceGate` (`src/ui/MaintenanceScreen.tsx`) wraps the app above `ClerkGate` and shows the web wording while `maintenance.status` is true. It reads the status with `watchQuery` and `useSyncExternalStore`, not `useQuery`, so a backend without that query does not take the app down. The root `ErrorBoundary` shows the same screen for `isMaintenanceError` errors, with its own `ConvexProvider`, and retries when the status turns false.

## Maintenance mode

Date: 2026-11-12

WHY: Destructive migrations need eva closed to users while they run. Before this, the only way was to stop the whole deployment.

Architectural: `convex/maintenance.ts` reads the `MAINTENANCE` env var (`npx convex env set MAINTENANCE 1` on, `npx convex env remove MAINTENANCE` off). `authQuery`, `authMutation` and `authAction` throw `ConvexError(MAINTENANCE_ERROR)` while it is on; `internalAuth*` wrappers, crons and sandbox callbacks keep running. The MCP endpoint returns 503. `maintenance:status` is a public live query: web `MaintenanceGate` (in `ClientProvider`) swaps the whole app for `MaintenanceScreen` and brings it back on its own when the var is removed; `DeploymentErrorFallback` shows the same screen for a maintenance error that beat the status query (`isMaintenanceError` in `@eva/shared`). Gaps: raw public `query` / `mutation` / `action` functions and `ensureUserExists` are not gated, and mobile shows only the error.

## Projects run on sessions (2)

Date: 2026-11-11

WHY: Projects and their tasks kept the last copy of the old chat, sandbox and prompt pipelines. A project now owns one hidden session, and its tasks work on it; the project stays the product surface.

Architectural: `_sessions/ownedSession.ts` is generalised from task to task|project (`OwnerEntity`): `ensureOwnedSession` creates the project's session lazily (project branch, chat model and traits from the project, takes over `projects.sandboxId` and project chat drafts), `ensureTaskChat` gives a project task its own non-Main chat in that session (`sessionChats.taskId`, index `by_task`; the one extra chat an owned session holds), and `getOwned` / `ensureOwned` take `{ owner }`. Project task runs and builds use the project session's sandbox through 1b's claim → attach → finish lifecycle (the session reads `active` while a VM is up; after a project run it stays `active` for the next task and the chat, and idle pause stops it). A build holds the session: `sessionChatHasFreeSlot` queues chat sends for the whole build and `finishProjectBuild` drains the queue; `startBuild` refuses and a scheduled build retries in 60 s while the project chat replies (`ownedSessionBusy`). Interviews claim, attach and finish the session sandbox the same way. `rotateProjectBranch` is the one writer of a merged PR's branch bump (project branch, session branch, VM delete, start fenced). `syncProjectSession` retires a completed/cancelled/deleted project's session and revives a reopened one (`functions.ts` schedules `syncProjectSessionLifecycle`). `buildSessionPrompt` adds the project context (`withProjectContext`, spec as plan, project PR); a project task's chat adds the task context. Docs, unread, mentions and Ave watches route to the owner (a project task's chat to the task). Lists, wake links, MCP send/stop/start and chat-self tools read the session. Web: `useOwnedSession` (generalised `useTaskSession`) and `useOwnedChatBinding` drive the project chat, sandbox panel, header and project tasks; the task-row chat binding is gone. Mobile resolves a project or project task as its session chat. `dataMigrations:migrateProjectChatsToSessions` and `migrations:projectChatsLeft` (helpers shared with 1b in `_migrations/ownerChatsToSessions.ts`). Single owners: `chatOwner` (who a chat speaks for), `projectHoldsSession` (build/interview hold, read by busy gates and idle pause), `ownerBusyReason` (adoption and migration), `syncProjectSessionBranch` (the session branch; waits while busy), `taskSandboxStatus` / `projectSandboxStatus` (lists, detail, MCP). retiring a project stops its build and interview first; scheduled builds give up after 30 min of a busy session; preview phases live in `@eva/shared`.

## Quick tasks run on sessions (1b)

Date: 2026-11-11

WHY: Quick tasks kept their own copy of the session chat, sandbox and prompt pipelines. A quick task now owns one hidden session, and that session runs its sandbox and chat; the task stays the product surface.

Architectural: `_sessions/ownedSession.ts` owns the mapping: `ensureOwnedSession` (lazy, one per task, normal `numId`, task branch `eva/task-<id>`, chat model seeded from the task), `retireOwnedSession` / `reviveOwnedSession` behind `syncOwnedSessionWithTaskStatus` (done/cancelled, PR merged/closed, delete → stop + archive + grace delete; reopen/restore → unarchive), `mirrorTaskIntoOwnedSession` (title, base branch) and `liveTaskSessionStatuses` (task cards). Owned sessions are hidden from the Sessions list (new index `by_repo_owner_deleted_and_archived_at` replaces `by_repo_deleted_and_archived_at`), counts, mentions, spotlight, MCP lists and analytics (`standaloneOnly`), and refuse fork, groups, extra chats, rename and archive (`assertStandaloneSession`). They push the task branch but open no session PR. The task run keeps its own workflow but reads and writes the session sandbox (`ownedSessionId`) and files its turn under the session: `sessionChatHasFreeSlot` makes chat sends queue behind a run and `closeTurn` drains the queue when the run ends; the run stops the sandbox silently (`stopSandboxAfterTaskRun`, stop reason `task_run`). `buildSessionPrompt` adds the task context. Docs, artifacts, mentions, unread and the Ave watch attribute to the task. MCP `send_chat_message` and the mobile chat target deliver to the session Main chat. Web and mobile task chat panels bind to `sessions.getOwned` / `ensureOwned`. `dataMigrations:migrateQuickTaskChatsToSessions` moves existing tasks (generalised `moveLegacyTranscriptPage`, Claude transcript seed = task id); `migrations:quickTaskChatsLeft` reports what is left. Every reader of a quick task's sandbox goes through `findQuickTaskSession`. Moving a quick task to another repo or into a project detaches its session (`detachOwnedSession`: retire + soft delete; `by_owner_task` now includes `deletedAt`). Project tasks are unchanged (PR 2).

## Composer tasks panel: model the todo status once

Date: 2026-11-11

WHY: A domain-model audit found five ternary chains on one status, a duration field nothing set, a renamed status, and guards for states that cannot occur.

Architectural: `ComposerTasksPanel` uses the activity trace's todo item type directly (no `in_progress` → `inProgress` rename). `TASK_STATUS_STYLE` (a `Record` on status) holds each status's colours, icon and trailing label, so a new status fails the type check. `durationMs` and `formatTaskDuration` are gone. `deriveProgress` takes the first step, so it cannot see an empty list. The panel needs a `turnId`; the old `"current"` fallback key let one dismissal hide every later turn without an id.

## Phone: chats open at the end; chat menu matches the web

Date: 2026-11-11

WHY: A chat drew its first messages for a frame and then jumped to the end. The session chat menu showed only Rename and Archive, not the web More menu's items.

Architectural: native-ui `ConversationList` stays hidden until its first jump to the measured end. The chat header menu takes every `sessionMenuActions` item except the session Copy link (the header has its own), in the web groups: Rename and Regenerate title; Copy title, Copy link, Copy branch name, Open PR, Open on web; Archive; Stop. The session target now carries the branch and PR.

## Sessions: one owner field (1a)

Date: 2026-11-11

WHY: Quick tasks and projects will move onto sessions as the one chat, sandbox and PR engine. A task will own one hidden session; a project and its tasks will share one. A session must say who owns it before any code can create or hide such sessions.

Architectural: `sessions.owner` is one union (`standalone`, `task` with `taskId`, `project` with `projectId`). `_sessions/owner.ts` owns it: the validator, `STANDALONE_SESSION_OWNER`, `sessionOwner` (absent reads as standalone), `isStandaloneSession` and `findOwnedSession`. New indexes `by_owner_task` (`owner.taskId`) and `by_owner_project` (`owner.projectId`). `createSession` (create, fork, MCP `create_session`), the load-test seed and the test fixtures write `standalone`. `dataMigrations:backfillSessionOwner` sets `standalone` on older rows; run it after deploy. No behaviour change: list, count and search queries still return every session. 1b hides owned sessions; 3b makes the field required.

## Drop the legacy state fields (0e)

Date: 2026-11-11

WHY: 0a–0d moved four lifecycles to one field each and kept the old fields, with read fallbacks, until their migrations ran. Once those migrations have run in prod, the old fields are dead data and the fallbacks are dead code.

Architectural: removed `sessions.archived`, `sessions.sandboxDeleteAfter`, `sessions.activeWorkflowId`, `sessions.turnLifecycleVersion`, `sessionChats.activeWorkflowId`, `agentTasks.activeWorkflowId` / `scheduledAt` / `scheduledRetryAt` / `scheduledFunctionId`, and `projects.activeBuildWorkflowId` / `scheduledBuildAt` / `scheduledBuildFunctionId`. Removed the indexes `sessions.by_repo_archived_and_deleted` and `projects.by_repo_and_build_workflow`. `taskRunState` and `projectBuildState` now return the new field as is; `sessionArchive`, `withResolvedArchive`, the legacy-clearing writes and the unused prewarm arg `activeWorkflowField` are gone. The four migrations (`backfillSessionArchive`, `migrateTaskRunState`, `migrateProjectBuildState`, `clearSessionWorkflowSlots`) are deleted. `sessionChats.create` read `session.archived` directly; it now uses `isSessionArchived`. Deploy only after the four migrations have run, or schema validation fails.


## Projects: one explicit build state (0c)

Date: 2026-11-11

WHY: A project build (idle, scheduled, running) lived in three fields that had to agree (`activeBuildWorkflowId`, `scheduledBuildAt`, `scheduledBuildFunctionId`), patched from `buildWorkflow.ts`, `workflowWatchdog.ts`, `_scheduling/helpers.ts` and `runLifecycle.ts`.

Architectural: `projects.build` is one union (`scheduled` with `at` + `jobId`; `running` with `workflowId` and an optional `scheduled` that waits behind it, for usage-limit retries; absent = idle). `_projects/buildState.ts` holds the transition table (`nextProjectBuild`) and the only writers (`scheduleProjectBuild`, `cancelProjectBuildSchedule`, `fireProjectBuildSchedule`, `markProjectBuildStarted`, `finishProjectBuild`); each write clears the legacy fields. The task a build is on is not stored: it is the project task whose `run` is `running`. Reads use `projectBuildState` / `isProjectBuilding` / `projectScheduledBuildAt` (the last two exported to web), which fall back to the legacy fields until `dataMigrations:migrateProjectBuildState` runs after deploy. New index `by_repo_and_build_state`; `projects.getActive` returns `isBuilding` instead of `activeBuildWorkflowId`. 0e drops the legacy fields, the `by_repo_and_build_workflow` index and the fallback.

## Tasks: one explicit run state (0b)

Date: 2026-11-11

WHY: A quick task's run lifecycle (idle, scheduled, retry pending, running) lived in four fields that had to agree (`activeWorkflowId`, `scheduledAt`, `scheduledFunctionId`, `scheduledRetryAt`), patched from a dozen files.

Architectural: `agentTasks.run` is one union (`scheduled` / `retry_pending` with `at` + `jobId`, `running` with `workflowId` + `runId`; absent = idle). `_agentTasks/runState.ts` holds the transition table (`nextTaskRun`) and the only writers (`scheduleTaskRun`, `cancelTaskRunSchedule`, `fireTaskRunSchedule`, `markTaskRunStarted`, `finishTaskRun`); each write clears the legacy fields. Reads use `taskRunState` / `taskScheduledAt` / `isTaskRunning` (also exported to web and mobile), which fall back to the legacy fields until `dataMigrations:migrateTaskRunState` runs after deploy. 0e drops the legacy fields and the fallback.

## Sessions: one explicit archive state (0a)

Date: 2026-11-11

WHY: A session's archive lived in two fields, `archived` and `sandboxDeleteAfter`, that had to agree. A delete time on a live session, or an archive without one, could be written but meant nothing. This is the first of the PRs (0a–0e) that replace such pairs with one state field before the chat engines merge.

Architectural: `sessions.archive` (`{ archivedAt, sandboxDeleteAfter? }`) is the one field; unset means live. `_sessions/archive.ts` owns it: `archiveSession`, `unarchiveSession`, `clearDeletedSessionSandbox`, `isSessionArchived`, `sessionDeleteAfter` and the indexed list read. Every write clears the legacy pair, and reads fall back to it until `dataMigrations:backfillSessionArchive` runs after deploy. The delete time stays optional: a session with no sandbox at archive time has nothing to delete, and the time is cleared once the sandbox goes. New index `by_repo_deleted_and_archived_at` replaces the unused `by_repo_and_archived`; `by_repo_archived_and_deleted` stays for the fallback. The stale one-off `backfillArchivedFromPrState` is removed. 0e drops the legacy fields, the fallback and the old index.

## Segmented tabs: lighter active pill in dark (web and phone)

Date: 2026-11-11

WHY: The phone tab bar pill went back to #474747 in dark. The web segmented pill was `bg-card` (#101010) on a #101010 trough, so it hardly showed, and the phone segmented thumb copied the web #202020.

Architectural: New `--segment-active` (white light, #474747 dark, #444548 neutral dark) in globals.css and `segmentActive` in `EVA_THEME`. `.tabs-segmented .t-tabs-pill` uses it; the old `[data-state="active"]` rules never matched the sliding pill and are gone. The phone themes `segment` and the dark `tabBarPill` from it.

## Phone: bottom tab pill slides again and is lighter in dark

Date: 2026-11-11

WHY: The remove-animations pass took out the bottom tab bar slide, which the owner wanted to keep. In dark, the app themed `segment` to the web #202020, which also darkened the bar pill on the #101010 glass.

Architectural: native-ui restores the 200 ms `FloatingTabBar` pill slide (instant under Reduce Motion) and gives the pill its own `palette.tabBarPill`. `applyEvaTheme` sets it to Eva's secondary in light (no change) and the package #474747 in dark. The segmented `Tabs` thumb keeps #202020.

## Sessions: lower tab memory from the session cache

Date: 2026-11-11

WHY: A single Eva tab used 1.3 GB or more. Hidden sessions kept their Editor and Browser iframes, full transcripts and idle query subscriptions alive.

Architectural: The sessions layout keeps 3 shells, not 5 (`MAX_CACHED_SESSIONS`). `KeepAlivePane` takes `discard`, and `SandboxPaneSlots` sets it from the new `onScreen` prop for Editor, Browser/Computer and custom tabs, so a hidden session unmounts its iframes; they reload on return. `useChatTranscript` holds only the 30-message tail while skipped; the full list swaps back in by row id. `ConvexQueryCacheProvider` keeps idle queries for 60 s (was 5 min) and at most 50 (was 250).

## Phone: phone-tuned tabs, PR tabs swipe, separate tap areas, back and Return

Date: 2026-11-11

WHY: At larger text the Projects pills wrapped and the fill cut between rows. Labels changed colour only when a swipe settled. A tab press made the page jump. Small buttons and agent trace rows had overlapping tap areas. Android back ignored the `@` / `/` picker. Return did not move between sign-in fields.

Architectural: The kit (`@vvedantb/native-ui`, not yet pinned) makes `PillTabs` one sideways row that keeps the active pill centred, 36 high, with the label colour following the pager's `progress`. `TabsList` takes `progress`, so the PR page (Summary, Timeline, Code) now sits on a `Pager` and swipes like Sessions and Projects; the diff still loads only once Code is visited. A tab press slides the `Pager` in 220 ms. `SegmentedTabs` (Active/Archived, Open/Closed) has 40-high triggers with 14 px labels. `useMentionComposer` gains `dismiss` (shut until the next edit, as the web Escape), wired to the picker's `onDismiss` in the chat and new-session composers. Trace content rows stack with no gap at the kit's 28 pitch.

## Phone: TalkBack rows, Inbox filter sheet and 14 px tappable labels

Date: 2026-11-11

WHY: A kit review found rows that TalkBack read wrong or could not reach, an Inbox filter that opened as a corner popover, and tappable labels at the web desktop 12 px.

Architectural: The Settings email row is one `switch` row (`SettingsToggleRow` `onCheckedChange`). Pickers built from `SheetRow active` read as radios, and the multi-select ones pass `multiple` (checkboxes). The Inbox "Show" and "Group by" filter is a `Sheet` of `SheetRow`s with a selection haptic, with the same wording. The session group header, "Show more (N)", Changed files labels, composer mention chips, quick-task option pills, filter chips and the review remedy link are `text-sm`. The kit pin brings `Button` `sm` at 36 with a 14 label, 44-high inputs, 48-high dropdown items, radio choice questions and long-press haptics.

## Sessions sidebar: linked session groups follow the sidebar options

Date: 2026-11-11

WHY: Linked session groups ignored "Sort projects", "Sort threads" and "Visible threads". They always sat above every project, listed every member oldest first, and had no cap.

Architectural: `GlobalSessionsSidebar` sorts groups and repos as one `SidebarEntry` list through `sortAppsForSidebar`. A group sorts by `createdAt` (oldest member) or `latestAt`; a repo sorts by the rows it still shows, so a session that moved into a group no longer lifts its repo. Groups go in first, so "Manual" (input order) pins them on top. `LinkedSessionGroupSection` sorts members with `sortSessionsForSidebar` and caps them with `previewSessions` and `SessionListShowMore`, like `GlobalSessionGroup`. `members` stays oldest first because the oldest names the group.

## Phone: Documents, Drafts and Today

Date: 2026-11-11

WHY: Documents, Drafts and Today were web per-repo pages the phone lacked. The phone now reads a repo's documents, lists and opens or deletes drafts, and shows the Daily standup timeline, with the web's own queries and mutations.

Architectural: they are pills beside Projects in the Projects tab (`?section=docs|drafts|today`, a `Pager` swipe as the Sessions tab), sharing `?repo=` through a new `RepoSection` shell. Today shows while the standup is on or has history (the phone has no URL bar to reach a paused one). `/doc/[docId]?repo=` renders the doc's Markdown read-only, with Copy PRD and View Tests PR; editing, comments and the HTML tab stay web-only. A draft card opens its chat, or `/quick-task/new?draftId=` with the draft loaded. The draft list and card labels (`draftList.ts`), the chat source labels (`chatSourceLabel.ts`) and the standup heading (`standup.ts`) moved to `@eva/shared`; the web Drafts page, Today page and `chatSource.ts` use them. The kit `Markdown` takes `headings="label"` for the standup cards.

## Cached sessions: hidden shells pause in `<Activity>`

Date: 2026-11-11

WHY: Up to five cached session shells stayed mounted under `display: none` with all effects live. Their terminals kept sockets open and redrew on every line of output, which fed the page freezes.

Architectural: The sessions layout wraps each cached `CachedSessionShell` in React `<Activity>`. A hidden shell keeps its DOM and state, so Preview iframes stay loaded, but its effects are torn down: terminal sockets close and reconnect on show. Convex cache-hook queries survive the 5-minute cache expiry, so a quick switch back still paints at once. The opt-in reply chime no longer sounds for a hidden session. `KeepAlivePane` (Editor, Browser, Review, Files, docs, artifacts, custom tabs) uses the same `<Activity>` for hidden tabs. Terminal panes keep a `hidden` class because they must keep streaming; the WebGL renderer keeps them cheap.

## Terminals: WebGL renderer stops the page freezes

Date: 2026-11-11

WHY: The prod web app froze ("Page Unresponsive") in eva and carepulse sessions. A profile showed 12.9 s of style recalculation from xterm's DOM renderer. Background terminals stay mounted under `display: none`, so the renderer measured each glyph as 0px wide, never cached the width, and forced a full-page style recalc for every character on each redraw.

Architectural: `TerminalPanel` loads `@xterm/addon-webgl` (0.19, the xterm 6 release) after `terminal.open()`. The canvas renderer makes no DOM layout reads. Without WebGL2, or after a context loss, the addon is disposed and xterm keeps its DOM renderer.

## Phone: Projects tab, project page and new project

Date: 2026-11-11

WHY: Projects was the largest web section the phone lacked. The phone now lists a repo's projects, opens a project (overview, tasks, plan, project chat) and creates one with the web's own queries and mutations.

Architectural: a fourth bottom tab, Projects (a fourth Sessions pill did not fit at 390 pt), with `ProjectsSection` (repo picker, search, Options sheet, phase sections), `/project/[projectId]?repo=` (Overview | Tasks or Plan in `?tab=`, a Chat and Build bottom bar behind the web confirms) and `/project/new`. The list, task-section, progress, spec and interview-turn rules moved to `@eva/shared` (`projectMeta.ts`); the web projects list, task panel, progress bar, new-project dialog and plan tab use them, and `lib/utils/parseSpec.ts` is gone. Phone `FoldHeader` and `FilterChipsBar` replace the Quick Tasks copies. `/quick-task/new` takes `projectId`.

## Menus: Run Startup Commands removed; PR rows narrower

Date: 2026-11-11

WHY: Run Startup Commands can reseed a sandbox and reset its local data, which is too risky one click away in a general menu, and session menus never had it. The menus also looked wide.

Architectural: `SandboxCommandMenuItems` drops `startupCommands`; the task and project flags, handlers, busy state and `StartupCommandsConfirmDialog` go with it. The backend mutations stay: the Eva MCP `rerun_startup_commands` tool calls them. `PrActionsSubmenus` rows cap at `max-w-56` (was `max-w-64`).

## Quick task and project menus: one menu per card and header

Date: 2026-11-11

WHY: The card right-click menu and the header "…" menu showed different actions for the same task or project. The header menus had only sandbox commands, PRs and Copy link.

Architectural: `TaskCardMenuItems` and `ProjectCardMenuItems` now render in the card's right-click menu, the card kebab and the header (`TaskHeaderMenu`, `ProjectDetailHeaderActions`). The header passes its sandbox commands and Create PR as `leading`; the project header passes View Plan and View Interview History as `planItems`. New hooks `useTaskMenu` and `useProjectMenu` own the delete, move and edit dialogs for both surfaces; a delete or move from a header returns to the list. Tasks drop Model and Project (set on the task page); projects drop View Branch. Copy is a submenu (Title, Link, Branch name) as on sessions. Icon sizes follow the menu type (16 context, 14 dropdown). The headers no longer show the flagged, disabled View Preview hint or a legacy URL-only View PR. `QuickTaskCard` drops `model` and `providerAccountId`; `ProjectCard` drops `repoFullName`.

## Session menu: three groups, Copy is a submenu

Date: 2026-11-11

WHY: The session menu ran seven mixed items in one block and set Send for Review apart on its own. The owner asked for one Copy item instead of three.

Architectural: `SessionMenuItems` groups session actions (Rename, Regenerate title, Fork, then a Copy submenu with Title, Link and Branch name), PR actions (PR rows, Open PR, Send for Review), then Archive. A divider opens the PR group only when it has items (`hasPrGroup`). Applies to the sidebar row, session tab and chat header. The sidebar row and session tab also lead with Open in new tab (`showOpenInNewTab`); the chat header omits it, since it already is the session.

## PR menus: three or more PRs fold into one submenu

Date: 2026-11-11

WHY: A session with nine PRs filled its menu with PR rows and pushed the session actions out of view.

Architectural: `PrActionsSubmenus` shows up to `INLINE_PR_LIMIT` (2) PR rows inline; more fold into one "Pull requests (N)" submenu. Open and draft PRs sort first (stable sort keeps the query order within each half). Menu rows drop the branch line, since a chat's PRs mostly share one session branch; the stack popover keeps it. Every chat menu (sessions, quick tasks, projects) gets this. PR rows cap at `max-w-64` (was `max-w-80`) so the menus are narrower.

## Sessions: one menu for the sidebar row, the session tab and the chat header

Date: 2026-11-11

WHY: The chat header "…" menu and the sidebar right-click menu showed different actions for the same session. The header had only Summarise, the PRs, Send for Review and Copy link.

Architectural: `SessionMenuItems` takes `variant: "context" | "dropdown"` (same pattern as `PrActionsSubmenus`) and an optional `summary` item. The new `SessionHeaderMenu` renders it in the chat header with Rename, Regenerate title, Fork, Copy title, link and branch, PRs, Send for Review and Archive (Unarchive when archived). `SessionTabsDialogs` became `sidebar/SessionDialogs` with narrow target types; `GlobalSessionsSidebar` and the header use it, so the rename and archive dialogs have one home. `ChatPanel` takes the `session` doc and drops `prUrl` and `deploymentStatus`. The session header no longer uses `usePrLinkMenuItems`, so its flagged, disabled "View Preview" hint is gone.

## Mobile: no slide on tab switches, no fade on chat folds

Date: 2026-11-11

WHY: A remove-animations pass put every phone animation through the gate. Two failed. The tab bar pill slid for 200 ms on every tab switch, a surface used many times a day. The chat folds faded in each time a list mounted an open fold: on chat open, on a streamed step and on a virtualised row scrolled back.

Architectural: Both changes are in native-ui (changeset `remove-frequent-motion`): `FloatingTabBar` draws its pill at the tab offset with a plain `View`, and `CollapsibleContent` is a plain `View`. The chevron turn stays. Sheets, swipes, the section pager, the keyboard, push transitions, press scale, toasts, the bulk bar, skeletons and the live shimmer stay. Re-pin after the kit merges. No native module, so no new APK.

## Web on a phone: no input zoom, no pull-to-refresh, no drawer scroll bleed

Date: 2026-11-11

WHY: A mobile-native pass on the web app in a phone browser found five tells. The composer and about thirty fields are 12–14 px, so iOS Safari zooms the page on focus. A pull past the top can reload the app (Android pull-to-refresh). A scroll in the open sidebar drawer moved the page behind it (measured: 600 px on Settings). A long press selected button labels. Nothing kept the bottom of the shell clear of the home indicator in an installed app.

Architectural: All CSS-first, by capability, not by width or user agent. `globals.css`: an unlayered `@media (pointer: coarse)` rule sets editable fields to 16 px (fields at `text-lg` or larger keep their size); a base rule gives controls `touch-action: manipulation`, and buttons, tabs, options, menu items and switches `user-select: none` (links and fields stay selectable; opt back in with `select-text`); `html`/`body` get `overscroll-behavior-y: none`, except on the landing page (`#top`). Y only, so desktop trackpad swipe-back still works. The two drawer scrollers (`SidebarPanel`, `RepoRail`) get `max-lg:overscroll-y-contain`. `useSidebarContentOffset` adds `pb-[env(safe-area-inset-bottom)]`. `index.html` adds `interactive-widget=resizes-content`, so the Android keyboard shrinks the `h-dvh` shell the same way iOS does.

## Mobile: phone sizing on every list and control; worst-case data fixes

Date: 2026-11-11

WHY: The owner rule is the web's look, not its desktop density. Several phone lists and controls still had web sizes: 58 pt Reviews rows with 11 px meta, 28 pt PR summary rows, 48 pt Timeline rows with 12 px titles, Quick Tasks cards with 13/11/10 px text, 28 pt message actions at a 30 pt pitch, and 28 pt Inbox header pills and composer chips that relied on slop. A break-ui pass with worst-case rows found empty titles, a wall of tags, a squeezed tag icon and a wrapped message clock.

Architectural: Lists follow the Inbox and Sessions sizes: one-line rows 56, two-line rows 64, 14 px titles in the foreground, 12 px secondary text, dividers or 8 pt card gaps. `SegmentedTabs` (`src/ui`) is the one segmented list switch for Sessions and Reviews, with 32 pt triggers. `FOOTER_CHIP` holds every composer footer chip's shape (`size: "touch"`, 36 pt in a 44 pt bar). Message actions use the kit `size="touch"` (whole 44 pt squares, no slop) and the clock wraps whole. `displayTitle` (`ui/format.ts`) shows "Untitled" for an empty session, chat or task title; an empty inbox title falls back to its type label. Quick task cards show three tags and "+N". The PR diff line rows stay 22 pt on purpose. Needs native-ui with changeset `phone-touch-sizes`; re-pin after it merges. No native module, so no new APK.

## Single source of truth audit (split PRs)

Date: 2026-11-11

WHY: An audit found 37 facts with more than one home. Six copies had already drifted: wrong timeout text (2 h, 20 min), a smaller reserved tab list on the backend, "Done" vs "Merged", a violet merged PR, and broken repo links for an empty app name.

Architectural: The fix is split into eight PRs (#1228 drift, #1229 builders, #1233 and #1237 schema-derived types, #1235 constants, #1232 React state, #1231 chat send, #1230 sandbox panel). New shared homes in `@eva/shared`: `appTabSlug`, `sandboxOwnerKeys`, `sandboxPorts`, `sessionChats`, `terminalHistory`, `agentBrowsing`, `previewFrameMessages`, `entityHref`. Types come from Convex validators. Sessions, tasks and projects share one `useChatSend` and one `SandboxSurfaceProviders`. Preview path is stored per pane (`previewPanePaths`), and the server `devPort` owns the port.

## Composer: background work is one chip row; no vagueness warning on follow-ups

Date: 2026-11-11

WHY: Above the composer, the background processes list opened by default and took most of the space. The agents chip said its count twice. The "too vague" warning also fired on short follow-ups, which lean on the thread above them.

Architectural: `BackgroundProcessesPanel` is now `BackgroundProcessesChip` ("3 processes"), with the list and Stop in a popover, as `BackgroundAgentsChip`. Its 1-second clock runs only while the popover is open. `SandboxChatPreInput` gets a `chips` slot on one flex row with the agents chip. The agents chip drops its count badge ("7 agents"). `COMPOSER_CHIP_CLASS` (`chat/composerChip.ts`) is the shared pill style for both chips and the skill suggestions. `ChatComposer` judges draft readiness only when `messageHistory` is empty, so follow-ups also skip the `draftReadiness.assess` call. Status chips and skill suggestions share one row on the input: `SandboxChatStatusChips` goes through a new `ChatBody` `composerChips` prop to `ChatComposer` `statusChips`, and `SandboxChatPreInput` keeps only the banners, which now sit above that row. Stopping a background agent (chip popover, Agents tab, subagent thread) now asks first: `useStopBackgroundAgent` returns `requestStop` (opens a destructive `ConfirmDialog`) and `stopDialog` (rendered outside the popover, which closes when the modal opens). The dialog shows the stop's progress, so `AgentStopButton` and the chip lost their own spinners; the chip reuses `AgentStopButton`.

## Mobile: roomier Sessions rows, swipe between sections and toasts, placeholder rows

Date: 2026-11-11

WHY: The phone Sessions list copied the web drawer's 30 pt rows with 13 px muted titles, which were hard to tap; the owner chose to match the Inbox rows. The owner also asked for a swipe between Sessions, Quick Tasks and Reviews, a swipe to dismiss a toast, and list placeholders in place of the centred spinner.

Architectural: Session rows are 56 high (`min-h-14`) with a 14 foreground title, a 14 PR icon, the age in `text-xs` and the kit `ListDivider` between rows; group headers and "Show more" are 44 high, so the vertical-only slop (`ROW_SLOP`) and the 2 gap are gone. The Sessions tab wraps the three sections in the new kit `Pager`, linked to `PillTabs` through one shared `progress`; a swipe settles with `setParams`, as a pill press. Rule: a drag that starts on a session row and goes left is the row's Archive (the row needs 12 pt, the pager 24 pt); right, or anywhere else, it moves the section (inside a pager a row leaves directions it has no actions for to the pager). Toasts swipe up to dismiss and pause their timer while held (kit). Inbox, Sessions, Quick Tasks, Reviews and the PR Code file list show kit `SkeletonList` rows shaped like their rows while loading; `PrDiffGate` takes an optional `loading`. Needs native-ui with changesets `pager`, `toast-swipe` and `skeleton-list`; re-pin after it merges. No native module, so no new APK.

## Mobile: the keyboard and composer follow the finger (new APK)

Date: 2026-11-11

WHY: The composer rode React Native's `KeyboardAvoidingView`, which on Android pads in one step when the keyboard has finished moving, and a drag on the transcript dropped the keyboard at once on Android. The owner asked for the keyboard and composer to follow the finger, and approved `react-native-keyboard-controller`.

Architectural: `react-native-keyboard-controller` (1.21.9, the Expo SDK 57 version) is a new native module, so the change needs a new APK (README). The root layout adds its `KeyboardProvider` inside `GestureHandlerRootView`, and the kit's new `KeyboardControllerProvider` (`@vvedantb/native-ui/keyboard-controller`). With it, the chat transcript (`ConversationList`) keeps its size and scrolls in `KeyboardChatScrollView` (content lifts with the keyboard, `always`), inside `KeyboardGestureArea` (`ios` interpolator, offset at the composer's top); the dock and Scroll to end move with `KeyboardStickyView` (less the bottom inset the composer pads); `PromptInput` outside a dock, the overlays and the kit's new `KeyboardAvoidingView` pad frame by frame. The question card in the dock now pads the bottom inset, as the composer, and drops its own `KeyboardAvoidingView`; New quick task uses the kit `KeyboardAvoidingView`. Metro resolves keyboard-controller as a singleton (the kit reads the app's provider). Android 10 and below keep `on-drag`. The pnpm lockfile adds only this package; the other lines are pnpm's peer suffixes. Needs native-ui with changeset `keyboard-controller`; re-pin after it merges.

## Mobile: the composer says a send wakes Eva up

Date: 2026-11-11

WHY: With the sandbox asleep, the web composer says "Send a message to wake Eva up…"; the phone always said "Ask Eva anything...", so it did not tell the user that a send also starts the sandbox.

Architectural: `SANDBOX_CHAT_COPY` and `sandboxComposerState` moved from the web `chatBodyUtils` to the `@eva/shared` root barrel; the web imports them from there with no change. `mobile.getChat` now returns `sandboxActive` (a session's `status`, a task's or project's review sandbox status is "active", as the web reads it), tested in `mobileApi.test.ts`. The phone composer takes the asleep and account-switch lines from `sandboxComposerState`, keeps "Add a follow-up..." during a turn, and keeps its short "Ask Eva anything..." when awake (the web's longer line would wrap the one-row pill). The web's usage-limit line is not on the phone yet: it needs a ticking clock and the queue hold. Drag-to-dismiss on the transcript was already the kit `ConversationList` default (`interactive` on iOS, `on-drag` on Android); no change. The web has no Reply action on messages (only a Cite of selected text in a reply), so the phone gets no swipe-to-reply.

## Session chats: tabs only, and tabs no longer close

Date: 2026-11-10

WHY: Parallel chats showed as indented rows under their session in the Sessions sidebar, which looked noisy. Closing a chat tab cancelled its turn, killed its agent and hid it for good, with no confirm and no way back.

Architectural: The Sessions sidebar shows one row per session; parallel chats live only in the session's `ChatTabsBar`. Deleted `SidebarChatRow`, `SESSIONS_CHAT_ROW_X`, `selectedChatNumber`, and the two per-repo sidebar queries `sessionChats.listExtraForRepo` and `turns.listRunningChatIdsForRepo` (with the `sessionChats.by_repo_main_and_archived` index, its test and its loadtest case). Tabs lose the X and the "Close chat" menu item; the `sessionChats.archive` mutation and `closeChat` are gone. Chats closed before this change keep `archived: true` and stay hidden; their `?chat=N` link still opens Main.

## Mobile: swipe actions on Inbox and Sessions rows

Date: 2026-11-11

WHY: The web acts on a row from its hover controls and right-click menu. The phone had only a long press (Sessions) or select mode (Inbox), so a single archive or read toggle took three taps.

Architectural: the kit's new `SwipeableRow` (Gesture Handler worklets, under `GestureHandlerProvider`; no swipe without it) wraps `NotificationRow` and `SessionListRow`. Inbox: swipe right runs the web menu's Mark as read / Mark as unread, swipe left Archive (in Archived, Unarchive), which slides the row out and shows the web "1 archived" toast with Undo; a failed write brings the row back. The bulk Archive now shows the same toast, as the web. Sessions: swipe left is the row menu's Archive, through the web confirm and the existing Undo toast (Unarchive in the Archived tab). Screen readers get the same actions on each row (`swipeActionsAccessibility`). A scroll (`closeSwipeRows` on `onScrollBeginDrag`) or a tap on any row closes an open row. Quick Tasks rows get no swipe: Delete is destructive and rare, Run Eva starts an agent run, and Status needs a choice of five. Needs native-ui with changeset `swipeable-row`; re-pin after it merges.

## Mobile: sheet drags run on Gesture Handler (new APK)

Date: 2026-11-11

WHY: The sheet drag ran on `PanResponder`, so every touch move had to reach the JavaScript thread. With a reply streaming in behind a sheet, the sheet could lag the finger and catch up in jumps. The motion review (r14) recommended Gesture Handler; the owner approved the new dependency.

Architectural: `react-native-gesture-handler` (~2.32.0, the Expo SDK 57 version) is a new native module, so the change needs a new APK (README). The root layout wraps the app in `GestureHandlerRootView` and the kit's new `GestureHandlerProvider` (`@vvedantb/native-ui/gesture-handler`), so `SheetContent` and the compact `DialogContent` drag on `Gesture.Pan()` worklets on the UI thread. The body scroll runs together with the pan, and a drag re-renders nothing. Each overlay `Modal` adds its own root view (Android). Metro resolves Gesture Handler from the app as a singleton, as `react`: the kit imports it as an optional peer, and expo-router's drawer brings in a second (3.x) copy. The rules and the feel stay the same. Needs native-ui with changeset `sheet-drag-gesture-handler`; re-pin after it merges.

## Mobile: a teammate's message no longer shows as your own

Date: 2026-11-11

WHY: In a shared chat the phone drew every user turn as the viewer's own (right side, tinted bubble, no name), so a teammate's message looked like yours. The web already draws it on the left with their avatar and first name.

Architectural: `isOtherUserChatMessage`, `otherUserIdsInChat`, `firstNameFromUser` and the new `firstNameByUserId` (the web `ChatBody` name map) moved to the `@eva/shared` root barrel; the web re-exports them unchanged. The phone chat reads `api.auth.me` and `api.users.getMany` as the web and draws a teammate's turn with `TeammateTurn`: left side, a 16 initials disc (in place of the web face mark), the first name above, a `bg-secondary` bubble squared at the bottom left and the footer 24 in. The three initials discs on the phone now share `InitialsAvatar`. No kit change.

## Mobile: branch chip shows no sliver of its label

Date: 2026-11-11

WHY: At 390 the New session footer squeezed the branch chip's label to about 5 px, so a sliver of "m" showed between the icon and the chevron; the web shows only the icon and the chevron.

Architectural: the kit `PromptInputChip` measures its label with `onLayout` and hides it (opacity 0, so the layout and the next measure stay the same and state changes only when the threshold is crossed) below `PROMPT_INPUT_CHIP.labelMinWidth`, 24 (about two characters and the ellipsis at `text-xs`, times the system font scale). A wider slot shows it again; the accessibility label keeps the full name. Every footer chip gets this. Needs native-ui with changeset `prompt-input-chip-sliver`; re-pin after it merges.

## Mobile: layout choices (inbox bulk bar, Appearance row, footer chips)

Date: 2026-11-11

WHY: The owner chose fixes for three layout items the polish audit left open: the inbox bulk bar hid its Cancel (X) at 390, the Appearance tiles wrapped 2+1, and the New session footer cut the model trait while the branch kept its name.

Architectural: the inbox passes the new kit `BulkActionBar` `pinCancel`, so Cancel selection (X) sits outside the sideways scroll at the bar's right end; the count, Select all and the actions still scroll. The three Appearance tiles share one row evenly. `ComposerFooter` gives the leading control what the stash and the model leave (the web `max-sm:flex-1 basis-0`), never less than an icon and a chevron and never more than 40%, so the branch label truncates first and the model keeps its name and "· High"; the New session and chat composers share it. The kit `PromptInputChip` now holds its icon whole, so only the label shrinks. Needs native-ui with changesets `bulk-bar-pin-cancel` and `prompt-input-chip-icon-whole`; re-pin after they merge.

## Mobile: motion review (sheets, screen pushes, press, haptics)

Date: 2026-11-11

WHY: A review of every gesture and animation in the phone app against the `gestures` and `animate-expo` skills found sheets that slid in on one timing and faded out on another, a drag release on a fixed timing, no screen transition on a push, and haptics only on selection.

Architectural: every stack (`src/ui/stackOptions.ts`, used by the root, chat, session, settings and auth stacks) now pushes with the platform's own transition, and cross-fades with Reduce Motion; the root stack had `animation: "none"` while the nested stacks animated. Tabs still switch at once. The rest is in native-ui (changeset `sheet-motion`): sheets slide in and out on one spring-driven position that the drag, the backdrop and every close share, a released drag springs on at the finger's speed and can be caught mid-flight, the kit `Button` scales on press, success and error toasts and destructive confirms fire haptics, and the toast, bar, scroll button and fold motion ease out. Gesture Handler is still not a dependency: the drag runs on `PanResponder` and writes only shared values per move. Needs native-ui with changeset `sheet-motion`; re-pin after it merges.

## Mobile: polish audit (menu sheets, PR header, button alignment)

Date: 2026-11-11

WHY: A side-by-side audit of the phone app against the web at 390 wide found menus built three ways, a clipped base branch, buttons that sat off-centre in their rows and a tab row that jumped on Code.

Architectural: `MenuSheet` moved from `src/quickTasks` to `src/ui` and is now the one menu sheet: the session long-press menu, Diff options and the file ⋯ menu use it, so their rows are 56 apart as the Quick Tasks menus (they were 68), and the session menu has the web separator above Archive and Unarchive. The PR header keeps the base branch whole and truncates the head ref, as the web. The kit `Button` with `fullWidth={false}` and the kit `Badge` carry `self-start`, which beats a parent's `items-center`; the callers in rows or centred blocks now pass `self-center` (Comments sort, Run, the review composer's Comment, the recap controls and "Show more", the file diff "Show N more lines", Drafts, "Back to sign in", the Code tab status chip). The review tab row is as high as Code's ⋯ on every tab, so switching tabs does not move the content. The Quick Tasks Options button is a circle, as the web secondary pill. Left for the owner: the inbox bulk bar overflows 390, the Appearance tiles wrap 2+1, and the New session footer truncates the model trait where the web squeezes the branch.

## Mobile: repo logos, draggable sheets, grouped chat menu, docked scroll button

Date: 2026-11-11

WHY: The owner tested the phone app: it drew only the letter tile where repos have uploaded logos, the bottom sheets had no gestures, the chat ⋯ menu did not keep the web groups, and "Scroll to end" was not tied to the composer.

Architectural: `src/ui/RepoLogo.tsx` is the web `RepoLogo` (the uploaded logo at the place's size, `rounded-md`, a border unless `bordered={false}`, else the place's own fallback). It draws the logo in the Sessions group headers (18, `githubRepos.list`), the chat header (16, no border, the web `githubRepos.getLogoUrl`), New session's "what are we building for" (28), the per-repo picker of Quick Tasks, Reviews and New quick task (16) and the repo sheet rows (22, the sheet icon size); the inbox row (28) now uses it too. No backend change: both queries are the web's own. `sessionMenuActions` (`@eva/shared`) returns the web groups (`SessionMenuAction[][]`: the main block, then Archive or Unarchive alone); the long-press sheet draws a line between groups, and the chat ⋯ menu is Rename, Copy link, Open on web, then Archive / Unarchive, then Stop, each group parted by a divider. The chat's composer or question card now sits in native-ui `ConversationDock` inside `Conversation`, so "Scroll to end" rides 16 above it (as the web `bottom-4` over the dock), centred on the thread, and the question card rises with the keyboard. Every native-ui bottom sheet drags down to close (`SheetDragView`, a `PanResponder` driving Reanimated shared values; gesture-handler is not a dependency). Needs native-ui with changeset `sheet-drag-dock`; re-pin after it merges.

## Mobile: composer gaps (mention chips, model search and account, stash from the phone, quick-task model)

Date: 2026-11-10

WHY: The phone composer showed picks as plain text and sent messages as markdown links, its model sheet had no search and no Team / personal account choice, a phone could not stash a prompt (the web has only ⌘S), and a quick task chat had no model chip because the phone sent on `agentTasks.lastChatModel` while the web picks and sends `agentTasks.model`.

Architectural: Sent user messages render tokens as the web chips: `mentionTokensToChipLinks` (new in `@eva/shared`, beside `MENTION_HREF_REGEX`, `mentionChipHref` and `parseMentionChipHref`, which the web `remarkMentionChips` and `MarkdownMentionText` now use) turns `@[Label](id)` / `/[Label](id)` into `#mention:` links outside code, and native-ui `Markdown`'s new `renderLink` draws them as `bg-accent` chips (`UserMessageText`). A React Native `TextInput` cannot hold a chip, so the field keeps the readable `@Label` text and the picks show as removable chips above it (`ComposerMentionChips`, from `useMentionComposer().picks` / `removePick`). `ComposerHeader` holds the attachments and the chips for the chat and New session. The model sheet has "Search models..." and the web rail of instances (each provider's Team, then its accounts, with the initials badge); a row sets the model and its account. `useChatModelPick` wires it per chat kind with the web's own calls: session and project models through `mobile.setChatModel`, a quick task through `agentTasks.update` / `agentTasks.setTraits`, accounts through `sessionChats.setProviderAccountId`, `agentTasks.update` or `projects.update`, then the kind's prewarm action, and sends wait for the switch. `mobile.getChat` now returns a task's `model ?? repo.defaultModel` (as the web), `providerAccountId`, `accountOwnerId` and typed `session.chatId`, `task.id` and `project.id`; `mobile.startSession` takes `providerAccountId`. The account list and default (`toPickerAccounts`, `defaultAccountForProvider`, `carriedAccountForProvider`) moved to `@eva/shared`; the web wrappers keep their names. The stash sheet starts with "Stash this prompt" (`promptStash.add`, as ⌘S), and the stash chip shows while there is a draft. Not built: voice input (the web streams mic PCM to AI Gateway STT or uses the Web Speech API; the phone has no mic-capture module). Needs native-ui with changeset `markdown-render-link`; re-pin after it merges.

## Mobile: Quick Tasks search, filters, sort, row menu, Run All and drafts

Date: 2026-11-10

WHY: The phone Quick Tasks list showed one fixed view. The web list has search, the Options menu (sort and filters), "Filtered by" chips, a row menu and Run All on To Do, and the New quick task dialog saves drafts.

Architectural: The list's search, filters, sort, filter chips and the Run All plan moved from the web Quick Tasks route to `@eva/shared` (`quickTaskFilters.ts`: `applyQuickTaskFilters`, `quickTaskFilterChips`, `clearedQuickTaskFilter(s)`, `toggleQuickTaskStatus`, `runAllPlan`, `startAll`, the sort and time-range labels and the defaults); the web parsers, toolbar, chips bar, list and kanban Run All read them, and `defaultQuickTaskSections` is gone (`QUICK_TASK_LIST_DEFAULTS` replaces it). `draftVisibility.ts` and `repoBasePath` also moved to `@eva/shared` (the backend re-exports `repoBasePath`). On the phone, Quick Tasks has a search field and an Options sheet (`QuickTaskListOptions.tsx`, a page per web submenu in `MenuSheet`), the chips, the web "No matching quick tasks" state, "Run" on To Do with the web Run All dialog, and a long press on a row opens the web card menu as a sheet (`useQuickTaskActions`: Run Eva, Status, Code Reviewer, Project, Move to codebase with its confirm, Copy title, Copy task link, Delete with its confirm). The state is per screen and resets with the repo. New quick task saves a draft on any way out (`agentTasks.saveDraft`, from a `beforeRemove` listener) and has "Drafts (N)" (`DraftsMenu`) to load or delete the repo's drafts, so a draft from the web opens on the phone and the other way; Create on a loaded draft calls `agentTasks.activateDraft`, as the web. All writes are the web mutations; new tests in `mobileApi.test.ts` cover Run All through `startExecution` and the draft round trip. Not on the phone: Model and the PR items in the row menu, Open in new tab, Import from Linear, kanban, select mode and its bulk bar, draft attachments and `?draft=` links. The Inbox already had the web Group by (Day, Repo, Type, Urgency). Needs native-ui with changeset `surface-row-long-press`; re-pin after it merges.

## Mobile: chat visual parity (step rows, code colours, repo tile, table actions)

Date: 2026-11-11

WHY: The phone chat drew longer step labels than the web, other code colours (Prism, not Shiki), a grey repo tile, no table actions, and a few colours at the wrong strength.

Architectural: The phone trace now uses the web's own row text and grouping: `@vvedantb/native-ui/ai` carries byte-identical copies of the `@vvedantb/ui` timeline files (`deriveStepRowPresentation`, `deriveActionGroupSummary`, `buildActivityRows`, `groupActivityRows`) and the folded `ActivityTasks` rules (`foldedActivitySegments`, the 8-block and 8-child caps, per-step seconds). `@eva/shared/activityTrace` is now only the Zod reader `parseActivityLog`, which keeps every step kind and the fields the rows read (`toolUseId`, `parentToolUseId`, `todos`, `isError`, `durationMs`, `files`, `contentPreview`); `parseTraceSegments`, `summariseToolSteps`, `parseToolSteps` and `hasStepDetail` are gone. `AssistantMessage.tsx` draws the web rows: short verbs with file chips, git and search glyphs for shell steps, "Used <server>" for MCP tools, "ran hooks", per-step seconds, failed steps in red, subagent steps nested (up to 8, "+N more"), to-do lists and notices as their own lines, and "Show N more" past 8 blocks (the newest 8 while a turn runs). Code blocks take the web Shiki colours (native-ui `scriptTokens` for the JavaScript family, `shellTokens` for shell, no new dependency). The chat header tile takes the web repo colour: `repoTileSlot`, `repoDisplayLabel` and `appLeafName` moved to `@eva/shared` (the web `repoTileColor` and `repoGrouping` use them), the `--cat-*` ramp is in `EVA_THEME` (`cat1` … `cat8`), and the header reads the repo with the web `githubRepos.get`. Tables have Copy table (Markdown, CSV, TSV, in a sheet) and View fullscreen; Download table is left out (a phone saves files through a share sheet; the copy formats carry the same text). The header slash is muted at 50%, the composer placeholder muted at 90%, the ⋯ button on the secondary fill. Needs native-ui with changeset `chat-visual-parity`; re-pin after it merges.

## Mobile: Timeline, Recap, metadata edits, range comments and Close / Reopen / Revert on the PR review screen

Date: 2026-11-11

WHY: The phone review screen had Summary and Code, read-only metadata, one-line comments and Merge only. The web review page also has Timeline, Recap, editable title, description, reviewers, assignees and labels, multi-line comments, Close, Reopen, Revert, Stack a new session and the blocker fix sessions.

Architectural: The tab row is Summary, Timeline, Code (`?tab=`, set in place; Timeline and Code mount on first visit). Timeline (`src/reviews/ReviewTimeline.tsx`, a `FlatList` rail) reads the web event builder, which moved to `@eva/shared` as `buildPrTimeline` / `groupTimelineRows` (`prTimeline.ts`; the web imports it from there); a commit row opens the commit on GitHub, as the phone Code tab has no commit scope. Summary gains the web Recap section (`ReviewRecap.tsx`: `docs.getRecapByPrUrl`, Recap / Summary switch, walkthrough steps with each file's diff, failure and out-of-date banners, model chip and Generate / Regenerate through `docs.generatePrRecap`; no live activity trail, Ask agent or HTML recap), keyed by `githubPrUrl` (moved to `@eva/shared`). The web pencils are 44 squares at each row's end: reviewers, assignees and labels open searchable bottom sheets that save the whole set per tap (`github.setPullRequest*`, candidates from `github.listPullRequestCandidates`), and the description pencil opens a sheet (`github.updatePullRequest`). The header ⋯ adds Rename (a dialog; on the web it is the Reviews row menu), Stack a new session (opens New session with `stackOn` / `stackBase`; `mobile.startSession` takes `stackOnPrNumber`) and Close without merging (the web confirm). The blocker line has the web fix link (a session on the head branch). The bottom bar's primary action follows the state as the web `PrPrimaryAction` (`PrPrimaryAction.tsx`): Merge, Reopen, or Revert behind the web confirm, which starts a session on the base with `revertSessionRequest` (shared; the web uses it). Range comments: in a file's comment sheet "Select more lines" asks for the other end, a second tap sets it, and `lineRangeCommentTarget` (shared) gives GitHub's anchor (`startLine` / `startSide`) and the web label; ranges stay in one hunk. `storedRunTraits` / `toRunTraitArgs` moved to `@eva/shared`. Tests: `prReviewActions.test.ts` covers close, reopen, rename, description, reviewers, assignees, labels, candidates and range comments with a fake GitHub; `mobileApi.test.ts` covers the Revert, fix and Stack sessions; web tests cover the shared helpers.

## Mobile: the Code tab on the PR review screen

Date: 2026-11-10

WHY: The phone review screen had Summary only. The web review page has a Code tab with the changed files, each file's diff, Viewed ticks, Hide whitespace changes, a file menu and line comments posted with the review.

Architectural: The review screen has the web tab row (Summary, Code) at the end of its header. The tab is the `tab` route param, set in place with `setParams`, so a switch adds no history; Code mounts on its first visit and then stays mounted. Code is a `FlatList` of the changed files (name over folder, the web `FileStatusChip` as a `Badge`, pending comment count, +/- counts, Viewed tick); a row pushes `app/review/[repoId]/[prNumber]/file`, so Back returns to the list. The chat diff screen's file view moved to `apps/mobile/src/diff/PrFileDiff.tsx` (file bar, 400-line chunks, step bar, ⋯ file menu as a sheet with Copy path and View file on GitHub), now used by the chat diff and the review file screen. `src/diff/prDiffStore.ts` holds what the screens share: the `github.getPrDiff` read (reused for 2 minutes, the server cache TTL, so opening a file does not download the diff again), Hide whitespace (one device setting, as the web `localStorage` one), Viewed per pull request (device only, as the web keeps it in the browser), both in secure store, and pending line comments in memory. The web Code ⋯ (Hide whitespace changes, Refresh diff) is `DiffOptions`, a sheet, in the tab row and on both diff headers; it refuses the whitespace switch while comments are pending, as the web does. On the review file screen a tap on a line opens the web review comment box as a sheet; the composer opens on Review while comments are pending, shows their count and posts them with `github.submitPrReview`, the web mutation. `lineCommentTarget` (one row to a GitHub anchor and the web label) and `prNumberFromGithubUrl` (moved from the web) are in `@eva/shared`. Not on the phone: split view, wrap lines, fold all, the file tree and search, Load full file context, Open in Files, commit scoping from Timeline, and multi-line comments. Needs native-ui with changeset `unified-diff-line-press`; re-pin after it merges.

## Mobile: mobile-first pass (back, sheets, keyboard, touch targets, long lists)

Date: 2026-11-10

WHY: A checklist pass of every phone screen for back behaviour, sheets, keyboard, touch targets, accessibility, motion, long lists, light and dark, and states. The look is unchanged; it is matched to the web on purpose.

Architectural: The root layout is a `Stack`, not a `Slot` (`animation: "none"`, so screens still swap at once). A `Slot` unmounted the tabs under a pushed chat and dropped their state, so Back from a chat opened in Sessions landed on the Inbox. Every pushed screen's Back is native-ui `goBackOrReplace` / `RouterStackPageHeader`, so after a deep link it opens a parent (chat and diff: the Inbox and the chat; New session: Sessions; New quick task, also after Create Task: Quick Tasks; archive from a chat: Sessions); before, Back did nothing. The chat and diff loading states have the header. Android back leaves Inbox select mode first. Long lists are virtualised with React Native's own lists: the Inbox and Sessions are `SectionList`s (`SessionGroup.tsx` is now `useSessionGroups` plus header, row and footer parts), Quick Tasks a `SectionList`, Reviews a `FlatList`, the chat transcript native-ui `ConversationList`, and the diff screen draws 400 lines at a time with "Show N more lines". Sheets shrink to the room and scroll (native-ui), and the session menu and review composer bodies scroll in `SheetBody`; `FooterSheet` uses `SheetBody`. Rename and the review composer focus their field from `onShow`, not `autoFocus`. The New session repo picker is the repo sheet the other repo pickers use (`RepoSheet` in `RepoPicker.tsx`), not a dropdown, and New session with no repos shows "No repos". Return on the quick task title moves to the description. Touch targets: Sessions rows, their "Show more" and the group header slop no longer overlap the next target (rows stay at the web 32 pitch), the message actions slop only their height (native-ui), the Changed files fold and "View diff" reach 44 high, and a question option's whole card is its target (native-ui). The Sessions empty state has the web copy ("No sessions yet", "Press + to start one."; "Archive a thread from its menu."). Needs native-ui with changeset `mobile-first-pass`; re-pin after it merges.

## Mobile: Reviews (pull requests) list and review screen, in the Sessions tab

Date: 2026-11-10

WHY: Pull request review was web only. The phone could not list a repo's pull requests, read one, comment, review or merge it.

Architectural: The Sessions tab pills gain "Reviews" (`?section=reviews`; hidden in simple view, as the web Reviews route redirects away there), so no fourth tab. `apps/mobile/src/reviews/ReviewsSection.tsx` is the web Reviews sidebar: the repo picker (now `useRepoParam` in `RepoPicker.tsx`, shared with Quick Tasks, so both keep one `?repo=`), Open / Closed / All, and the rows (`github.listPullRequests`). A row opens `app/review/[repoId]/[prNumber]`: the web `ReviewHeader` (state pill, `head → base`, ⋯ with Refresh, Copy link and View on GitHub, the title linking to GitHub, the blocker line) and the web Summary tab read-only (reviewers, assignees, labels, previews, Description, Checks, Comments with bots folded), from `github.getPullRequestOverview`. A bottom bar holds the web Merge (`github.mergePullRequest`, behind the web confirmation, here a sheet that also holds the merge method) and the web composer as a sheet: Comment (`github.addPrComment`) and, on an open PR, Review with Comment / Approve / Request changes (`github.submitPrReview`). The phone calls the web actions directly (no `mobile.ts` wrapper) through `useActionResult`, one keyed action read with a forced reload. The overview readings (merge blockers, stacks, check roll-up, summary comments, verdict wording, review and merge gates, merge methods and list states) moved from the web review components to `@eva/shared` (`prReview.ts`, root barrel); the web reads them from there. New backend test `prReviewActions.test.ts` fakes GitHub and checks what each action sends. Not on the phone: the Code tab (needs the shared diff parser from the chat diffs PR; restack first), Timeline, Recap, line comments, editing the title, description, reviewers, assignees and labels, Close, Reopen, Revert, Stack a new session, the blocker remedy sessions, Rename and hover prefetch. No inbox change: no notification links to a review page today.

## Mobile: the web session menu (rename, archive, unarchive) and a "+" per repo group

Date: 2026-11-10

WHY: The phone could open a session but could not rename, archive or unarchive it, and could not start a session in one repo from the Sessions list. The web has these on the sidebar row menu and the group "+".

Architectural: A long press on a Sessions row opens the web row menu (`SessionMenuItems`) as a native-ui `Sheet` of `SheetRow`s: Rename, Regenerate title, Copy title, Copy link, Copy branch name, Open PR, then Archive (warning tone) or Unarchive. The order and the archived and simple-view rules are `sessionMenuActions` in `@eva/shared` (root barrel). `apps/mobile/src/sessions/useSessionActions.tsx` holds the sheet, the web "Rename session" dialog and the web "Archive Session" confirm, with the web toasts (Undo on archive). The chat header ⋯ adds Rename and Archive / Unarchive in a session chat; the web has them on the session's own tab. Writes are the web `sessions.update`, `sessions.unarchive` and `textGen.regenerateSessionTitle`. New `mobile.archiveSession` is the web stop-sandbox-then-archive in one call, because the phone does not know the sandbox id. `mobile.listChats` rows add `repoId`, `branchName` and `webPath` (`sessionWebPath`, shared with `getChat`). `mobile.getChat` adds `session` (id, title, archived) for session chats, and an archived session is read-only (`canReply` false), as on the web. Each group header has the web "+" (Active list only) that opens `/session/new?repo=<id>`; `new.tsx` preselects that repo. The web has no session delete, so the phone has none. Fork, Send for Review, PR submenus and Remove from group stay web-only. Needs native-ui with `warning` on `DropdownMenuItem` and `SheetRow` (changeset `menu-warning-tone`); re-pin after it merges.

## Mobile: the "Changed files" card and a read-only diff screen in phone chats

Date: 2026-11-10

WHY: The web shows "Changed files (N)" under an agent reply, and a row opens that file in the Review pane's Code tab (the pull request diff). The phone showed neither, so a phone reader could not see what a turn changed.

Architectural: The card logic moved from the web `ChangedFilesCard` and `changedFilesPresentation` to `@eva/shared` `changedFiles.ts` (root barrel: `collectChangedFiles`, `toRepoRelativePath`, the preview and repo-group helpers), and the web `sandbox/diffFiles.ts` moved whole to `@eva/shared` `diffFiles.ts` (`DiffFileStatus` replaces the `@pierre/trees` `GitStatus` import), with a new `unifiedDiffLines` for a phone diff view. Web behaviour is unchanged. The shared `activityTrace` step keeps `path`. `mobile.getChat` returns `prUrl` (session, quick task, or the task's project, as the web Review pane), and the phone calls the web's own `github.getPrDiff` action with it, so the diff is what is pushed to GitHub and does not need a live sandbox. Before a PR exists the phone shows the web "No pull request yet". `apps/mobile/src/chat/ChangedFilesCard.tsx` is the card (hidden in simple view, as the web); `app/chat/[target]/diff.tsx` is the screen, one file at a time with previous / next. `[target].tsx` moved to `[target]/index.tsx`. Needs native-ui `UnifiedDiff` and `DiffStat` (changeset `unified-diff`); re-pin after it merges.

## Mobile: `@` mentions and `/` skills in both phone composers

Date: 2026-11-10

WHY: The web composer lists teammates, docs, sessions, projects and quick tasks after `@`, and skills after `/`. The phone had neither, so a phone message could not mention a teammate or call a skill.

Architectural: The picker logic moved from the web `MentionEditor`, `mentionToken`, `skillToken`, `harnessSkills`, `mergeMentionItems` and the item hooks to `@eva/shared` (root barrel): `mentionText.ts` holds the wire format (`formatMentionToken`, `tokenizeMentionText`, `tokenizedToEditable`, synthetic skill ids) and `mentionComposer.ts` the trigger, filter, pick and the candidate builders (`peopleMentionItems`, `dataMentionItems`, `skillSlashItems`). Web behaviour is unchanged. The phone `useMentionComposer` loads the web's five queries and keeps the draft as display text with label → id maps; a send passes `tokenize(text)` to `mobile.sendMessage` / `mobile.startSession`, so the stored tokens are the web's and notify the same (no backend change). A stash restore now turns its tokens back into picks instead of showing raw tokens. `MentionMenu` draws the list with native-ui `PromptInputMenu` / `PromptInputMenuItem` in the new `PromptInput` `menu` slot, docked above the field (changeset `prompt-input-menu`); re-pin after it merges. Return with rows picks the first row, as the web on a touch screen.

## Mobile: Quick Tasks list and new quick task, in the Sessions tab

Date: 2026-11-10

WHY: Quick tasks were web only. The phone could open a quick task chat from the inbox but could not list a repo's quick tasks or file a new one.

Architectural: The Sessions tab has "Sessions | Quick Tasks" pills under the title (`?section=quick-tasks`); the title and "+" follow the pill, so no fourth tab. `apps/mobile/src/quickTasks/` holds the list (`QuickTasksSection`: a repo picker, `?repo=`, then a collapsible section per status), the row (`QuickTaskRow`, the web `QuickTaskCard` on the new native-ui `SurfaceRow`), the web option chips as bottom sheets (`OptionChips`) and the priority icon. A row opens `/chat/<taskId>`. `app/quick-task/new.tsx` is the web `QuickTaskModal` as a full screen: repo, title, description, priority, code reviewer, model and traits (`ModelChip`), base branch (`BaseBranchChip`, locked to a picked project's branch), tags and project, then "Create Task" calls `agentTasks.createQuickTask`, which files the task in To Do without a run. Reads are the web's queries (`agentTasks.getAllTasks`, `agentRuns.getTaskIdsWithLatestRunError`, `users.listAll`, `projects.list`/`get`); no `mobile.ts` wrapper. The task statuses, labels, workflow order, the web's default list (no project, newest update first, grouped by status), `formatEntityNumLabel` and the priority order and labels moved to `@eva/shared` (`taskMeta.ts`, root barrel); the web `TaskStatusBadge`, `priorityMeta`, `EntityNumLabel` and quick-task `_utils` read them. `EVA_THEME` gained the status text and bar colours. Not on the phone: search, filters, sort, kanban, select mode, drag, Run All, card menus, drafts, attachments, voice, mentions and the provider account. Needs native-ui with `SurfaceRow` (changeset `surface-row`); re-pin after it merges.

## Mobile: the web composer footer (branch, stash, model) under both phone composers

Date: 2026-11-10

WHY: The web shows a bar under the composer with the base branch (new session) or the live sandbox branch (a session chat), the prompt stash and the model with its reasoning level. The phone had none of it, so a phone session always started on the repo defaults and a phone reply could not change the model.

Architectural: `apps/mobile/src/chat/ComposerFooter.tsx` is the bar (Eva's `bg-muted/70` `rounded-b-surface` strip) and the stash chip; `BranchChips.tsx` holds the base-branch picker (`github.listBranches`, with search) and the read-only sandbox branch (tap copies); `ModelChip.tsx` the model picker (trait rows, provider tabs, `githubRepos.getProviderAvailability`). Each chip opens a native-ui `Sheet` in place of the web popover. Simple view hides the model and sandbox branch chips, as the web. Both phone composers are now controlled, so a stash restores into the draft; a stash with attachments is refused with the web's message. `mobile.startSession` takes optional `model`, traits and `baseBranch` and passes them to `createSession`. New `mobile.setChatModel` sets a session or project chat's sticky model and traits through the writes the web picker mutations now share (`setSessionChatModel`/`setSessionChatTraits`, `setProjectChatModel`/`setProjectTraits`); quick tasks are refused, because the web task picker sets `agentTasks.model`, not the `lastChatModel` a phone reply uses. `mobile.getChat` returns the sticky `traits`, the live `sandboxBranch` and the `intendedBranch`. The trigger summary moved to `@eva/backend` `modelTraitSummary` (web `ModelSelectWithTraits` uses it); `tokenizedToDisplayText` moved to `@eva/shared` (`mentionText`). Needs native-ui with `PromptInput` `footer`, `PromptInputChip`, `SheetRow` `leading` and `providerLabel` (changeset `composer-footer-chip`); re-pin after it merges.

## Mobile: inbox, sessions, settings and font match the web at phone width

Date: 2026-11-09

WHY: The phone drew Instrument Sans, a repo initial and a green play for failed runs, dates instead of ages, and its own header button, tab and tile sizes. The web draws Inter, the type icon in a tinted circle, a red alert for failed runs and compact ages.

Architectural: `apps/mobile` loads `@expo-google-fonts/inter` (Instrument Sans dropped). The four family names live once in `src/ui/fonts.js`, read by `tailwind.config.js` (`nativeUiPreset({ font })`) and `applyEvaTheme` (`configureTheme({ font })`). The notification type map (icon name, label, tone) and its title reads (old failures stored as `run_completed`, PR merge or close) moved from the web `notification-config.tsx` to `@eva/shared` (`getNotificationAppearance`, root barrel); the web and mobile map icons and tones locally. Mobile ages use native-ui `formatCompactRelativeTime` (the `@vvedantb/ui` `RelativeDateTime` formatter, calendar units). Inbox header controls are the web 28-high outline and ghost pills; session tabs use native-ui `TabsTrigger minHeight` for the web `h-8` list; settings use the web `bodyVariant="list"`, a 32 section gap and a two-column tile grid with the check badge over the swatch. `applyEvaTheme` sets the segmented pill colours from the web `.tabs-segmented`.

## Backend: fence two implicit state machines (run start, chat result)

Date: 2026-11-10

WHY: An audit found writes that ignored the current state. A run cancelled before its first workflow step could come back as `running` with no watchdog, which blocked new runs. A late result from a closed chat turn could write into the newer turn's reply, clear its slot, and let the queue start a third turn.

Architectural: `updateRunToRunning` now applies only to a `queued` run and returns `"not_queued"` otherwise. `taskExecutionWorkflow` calls it before its `try` and returns on that value, so the tail does not clear a newer run's `activeWorkflowId`. Journals from before this change replay `null` and continue. New pure `isSupersededChatResult(turn, activeWorkflowId)` in `_chat/turnStore.ts`: the turn is closed and another workflow holds the slot. The session, task and project chat `saveResult` mutations return early on it. `projects.update` still sets any phase: the Change Phase dialog uses it, and it already runs the PR sync.

## Web: composer links look like chat links (underline + favicon), not chips

Date: 2026-11-09

WHY: Figma, GitHub, Linear, Sentry and PostHog links showed as accent pills with brand icons in the composer and in sent messages, while every other chat link used `MarkdownLink` (underline plus the site favicon). Two link styles for one thing.

Architectural: Removed `LinkChip`, `linkProviderIcons` and the label logic. `linkChipUtils` is now `linkUrls` and only detects the five hosts (kept so a hand-typed URL does not become a link after `https://x`). `MarkdownMentionText` and `MentionText` render `MarkdownLink`. The contenteditable composer writes the same `markdown-link` markup (favicon `img`, GitHub glyph, `<wbr>` breaks) and hides a failed favicon through `onErrorCapture`. The composer shows the full URL, not the shortened host + path label. `escapeHtml` now also escapes `"` for attribute safety.

## Mobile: native-ui 0.11.2 drops the typecheck auth shim

Date: 2026-11-09

WHY: `@vvedantb/native-ui@0.11.2` fixes the `prepareFirstFactor` typing (TS2322 under `strictFunctionTypes`) that #1136 worked around. Eva no longer needs a typecheck-only copy of the auth types.

Architectural: `apps/mobile` now depends on `^0.11.2`. Removed `typecheck/native-ui-auth.d.ts` and `tsconfig.typecheck.json`. The `typecheck` script runs `tsc -p tsconfig.json` against the real package. No runtime or behaviour change. The #1138 guards remain: `EnsureUser` timeout, Retry and Sign out, the rejection logger and its test, `test:hermes-apis`, and the Hermes-safe sorts in `packages/shared`.

## Mobile: native-ui 0.11.1 owns sign-in (second factor, first-factor codes, errors, PasswordInput)

Date: 2026-11-09

WHY: `@vvedantb/native-ui@0.11.1` ships what Eva carried as temporary local code or patches. `SignInScreen` handles `needs_second_factor`, `needs_client_trust`, `needs_new_password` and `needs_first_factor` (email_code and phone_code). `SecondFactorScreen` is exported from `@vvedantb/native-ui/auth`. `AuthScreen` uses `KeyboardAvoidingView` behavior `padding`. `attempt.status` is typed `string | null` upstream. The package also times out each Clerk stage through `stageTimeoutMs` (default 20000 ms), so Eva has no timeout shim. Two copies of the same flow are a maintenance cost.

Architectural: `apps/mobile` now depends on `^0.11.1` (only mobile declares it). Removed `patches/@vvedantb__native-ui@0.10.0.patch` and its `pnpm.patchedDependencies` entry. The temporary types-only 0.11.1 patch is dropped too: no Eva pnpm patch remains for native-ui, and the lockfile has no native-ui `patch_hash`. Mobile typecheck uses `tsconfig.typecheck.json` with a typecheck-only `paths` shim for `@vvedantb/native-ui/auth` so Eva does not fail on package `SignInScreen` TS2322 (`strictFunctionTypes` vs Clerk `PrepareFirstFactorParams`); Metro still bundles the real package. Delete the shim when native-ui types that signature correctly. The 0.9.0 keyboard patch was removed earlier in this PR, with `components/auth/SecondFactorScreen.tsx`, `src/auth/signInFlow.ts` and its tests, the `test:mfa` script and the `components/` entry in `tsconfig.json`. `app/(auth)/sign-in.tsx` is `SignInScreen` with Eva chrome only: `EvaMark` header, copy, Google scheme and path, `signUpHref`, `errorDisplay="inline"`. native-ui owns incomplete statuses, including first-factor email and phone codes. Sign-in errors follow #1134: one structured `console.error` per failure, "Invalid email or password" only for `form_password_incorrect` and `form_identifier_not_found`, and a friendly message with the Clerk code otherwise. The package `PasswordInput` adds a show/hide eye button. Eva has no local password toggle. The #1138 hang fix stays for `EnsureUser`, the rejection logger and the Hermes guard; its local sign-in flow, `test:mfa` and `testIDPrefix` are replaced by the package (second-factor screen id is the package default, `sign-in-second-factor-screen`).

## Mobile: log unhandled promise rejections in release builds

Date: 2026-11-09

WHY: RN release builds swallow unhandled rejections, so the 0.1.4 sign-in hang left no logcat error.

Architectural: `src/logging/unhandledRejections.ts` enables the Hermes rejection tracker and wraps the `ErrorUtils` global handler; both call `console.error("[uncaught]", ...)` with name, message and a short stack (no secrets). `_layout.tsx` installs it first. Sign-in submitters now catch, show "Couldn't sign you in." and log, then clear loading in `finally`. Code step uses `testIDPrefix="second-factor"` (screen id `second-factor-screen`). Missing factor ids and unsupported strategies now log. Test: `pnpm --filter @eva/mobile test:logging`.

## Mobile sign-in: endless spinner after a correct password (Hermes `toSorted`)

Date: 2026-11-09

WHY: In 0.1.4 the sign-in button spun without end after a correct password. Clerk answered in about 0.6 s with `needs_second_factor` (totp), but `codeFactors()` used `Array.prototype.toSorted`, which Hermes release builds can lack. The `TypeError` escaped `advance()` and `PasswordForm.submit` had no `finally`, so loading never cleared. In 0.1.3 the same throw showed as "Invalid email or password."

Architectural: `signInFlow.ts` sorts with `[...items].sort`; so do `packages/shared` `notificationGroups.ts` and `taskTags.ts` (mobile imports both). `advance()` catches everything (stage `nextStep`, message with `code: nextStep`). Every Clerk call and `setActive` has a 20 s limit (`SIGN_IN_STAGE_TIMEOUT_MS`), giving `Sign-in timed out at <stage> (code: timeout_<stage>)`. `logFailure` cannot throw. `PasswordForm`, `CodeStep` and `NewPasswordScreen` reset loading in `finally`. `EnsureUser` times out after 20 s, logs the failure and whether Convex auth ever became authenticated, and shows Retry and Sign out. Guard: `pnpm --filter @eva/mobile test:hermes-apis` fails if the mobile bundle or the shared modules it imports use `toSorted`, `toReversed`, `toSpliced`, `findLast`, `findLastIndex`, `.with(`, `.at(`, `Object.groupBy` or `Array.fromAsync`. Tests: `test:mfa` adds the totp flow, a run with `toSorted` deleted, and fake-timer timeouts.

## Mobile sign-in: stop masking real failures as "Invalid email or password."

Date: 2026-11-09

WHY: Any throw from `signIn.create()` or `setActive()` showed "Invalid email or password.", and Clerk messages that named the provider were dropped. Users saw a wrong-password message for captcha, network and session errors, and nobody could find the cause.

Architectural: `src/auth/signInFlow.ts` now parses Clerk errors with Zod and logs one structured `console.error` per failure (stage, error name, Clerk code, message, longMessage, paramName, status, trace id; never the password or code). `startSignIn` and `submitCode` separate `create`/`attempt*` failures from `setActive` failures. `failureMessage` replaces `clerkErrorMessage`: "Invalid email or password." only for `form_password_incorrect`, `form_identifier_not_found` and `form_param_format_invalid` on the identifier; other Clerk errors show their message plus `(code: ...)`; network errors and session failures have their own messages; other errors show a short reason.

## Mobile sign-in: Eva owns the password result (MFA, client trust, email code) and the Android keyboard

Date: 2026-11-09

WHY: Accounts with a second factor saw "needs another step. Finish it on the web." Native-ui 0.9.0 `SignInScreen` calls `signIn.create()` itself and shows that message for any status but `complete`, with no app callback, so Eva's `useSignIn().status` check never ran. On Android, the keyboard also covered the password field and Sign in button: `AuthScreen` used `KeyboardAvoidingView` behavior `height`, which does nothing when the window does not resize (Expo 57 edge-to-edge), and its `justify-center` kept the form centred on the full screen.

Architectural: `app/(auth)/sign-in.tsx` now builds the email and password form from native-ui pieces (`AuthScreen`, `Input`, `Button`, `FieldError`, `OrDivider`, `GoogleSignInButton`) and owns the `create()` result. `src/auth/signInFlow.ts` (replaces `totp.ts`) reads the resource status as a plain string, because Clerk's `SignInStatus` omits `needs_client_trust`, and returns one of four steps: complete, code (first or second factor: totp, backup_code, phone_code, email_code), new password, or unsupported. Finish-on-web shows only for unsupported states, with a `console.warn` of the status and strategy names. `SecondFactorScreen` stays free of Eva and Clerk imports and gains a resend timer, a method switcher and free-text codes. Keyboard: `patches/@vvedantb__native-ui@0.9.0.patch` sets `AuthScreen` to behavior `padding` on all platforms, so the scroll view shrinks above the keyboard (sign-in, sign-up and second factor). Both are self-contained so they can be dropped when native-ui ships the same. Tests: `pnpm --filter @eva/mobile test:mfa` (mocked `signIn`, every status and strategy).

## Mobile sign-in: TOTP second factor

Date: 2026-11-09

WHY: Eva's Clerk instance uses an authenticator app as the only second factor. Native-ui `SignInScreen` stops at `needs_second_factor` and shows "needs another step", so an account with TOTP on could not sign in on mobile.

Architectural: `app/(auth)/sign-in.tsx` keeps `SignInScreen` for the first factor and shows `components/auth/SecondFactorScreen` when `useSignIn().status` is `needs_second_factor`. `SecondFactorScreen` imports only react, react-native and native-ui, so it can move into native-ui unchanged. All Clerk logic (`attemptSecondFactor({ strategy: "totp" })`, `setActive`, error mapping) stays in `src/auth/totp.ts`, tested with a mocked `signIn` (`pnpm --filter @eva/mobile test:mfa`). Back uses the sign-in attempt id, not an effect, so a new attempt shows the code step again. `tsconfig.json` now includes `components/`.

## Fix Android blank screen on cold start (Clerk Native API off)

Date: 2026-11-09

WHY: Release APK eva-0.1.1 opened to a blank white screen. Clerk rejected the native client (`The Native API is disabled for this instance`), `ClerkLoaded` rendered nothing, and fonts returned `null` with no timeout. Nothing told the user what failed.

Architectural: `apps/mobile/app/_layout.tsx` now exports an expo-router `ErrorBoundary`, waits at most 3 s for fonts, and gates the app on `useAuth().isLoaded`. It also probes Clerk `/v1/environment` so a disabled Native API shows `StartupFailure` (native-ui `EmptyState`) with the real cause instead of a blank screen; a 15 s timeout covers other load failures. `scripts/check-clerk-native-api.sh` fails the release if `native_settings.api_enabled` is not true. Owner must enable Native applications in the Clerk Dashboard (see `apps/mobile/RELEASE.md`). Also removes a computed `ObjectPattern` in `usePresentationSync` that newly bailed out React Compiler on main.

## Fix Android release Metro bundle (missing Babel JSX plugin)

Date: 2026-11-08

WHY: `:app:createBundleReleaseJsAndAssets` failed with `Cannot find module '@babel/plugin-transform-react-jsx'`. `nativewind/babel` (via `react-native-css-interop`) names that plugin as a string, and Babel resolves it from `apps/mobile`. pnpm isolation did not link it there.

Architectural: `@babel/plugin-transform-react-jsx` is now a direct devDependency of `@eva/mobile`, so pnpm links it where Babel looks. The monorepo stays on the isolated linker.

## Fix main CI gate (lint / compiler / design)

Date: 2026-11-08

WHY: The required `typecheck / lint / compiler / design / schema` check was red on main (28 oxlint errors, 15 new stageshow React Compiler bailouts, design baseline drift), which blocked rebased PRs from going green.

Architectural: Real lint and try-block bailouts were fixed in place; stageshow motion modules that intentionally read refs during render opt out with `"use no memo"` instead of growing the compiler baseline; the design baseline was shrunk for fixed violations only (SVG mask white kept via a targeted ignore).
