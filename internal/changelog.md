# Changelog

## Single source of truth audit (split PRs)

Date: 2026-11-11

WHY: An audit found 37 facts with more than one home. Six copies had already drifted: wrong timeout text (2 h, 20 min), a smaller reserved tab list on the backend, "Done" vs "Merged", a violet merged PR, and broken repo links for an empty app name.

Architectural: The fix is split into eight PRs (#1228 drift, #1229 builders, #1233 and #1237 schema-derived types, #1235 constants, #1232 React state, #1231 chat send, #1230 sandbox panel). New shared homes in `@eva/shared`: `appTabSlug`, `sandboxOwnerKeys`, `sandboxPorts`, `sessionChats`, `terminalHistory`, `agentBrowsing`, `previewFrameMessages`, `entityHref`. Types come from Convex validators. Sessions, tasks and projects share one `useChatSend` and one `SandboxSurfaceProviders`. Preview path is stored per pane (`previewPanePaths`), and the server `devPort` owns the port.

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
