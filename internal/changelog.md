# Changelog

## Schema: drop projectCoordinatorWakes.heldAt

Date: 2026-11-25

The hourly coordinator wake cap is gone (#1494), and `dataMigrations:clearCoordinatorWakeHeldAt` cleared `heldAt` on prod. This drops the field and that migration. Deploy only after the migration has finished on prod.

## Chat: no Changed files card; coordinator replies without "Worked for"

Date: 2026-11-25

The "Changed files" card under an agent reply is gone on web and phone, everywhere: the PR, Diffs tab and Review pane already show what changed. Removed with it: web and phone `ChangedFilesCard`, `useChangedFilesExpansion` (its localStorage state), `findLastAssistantMessageId`, the `showChangedFiles` / `isLatestAssistantTurn` / `onOpenDiff` props, and the shared `collectChangedFiles` and its grouping helpers. The path helpers stay, renamed `@eva/shared` `sandboxFilePath.ts`. The phone diff screen stays (the hold menu and the branch row open it).

In the coordinator chat (Eva's bubbles, main chat and reply threads, web and phone) a finished reply shows its text only, with no "Worked for" fold of steps.
## Archive replaces delete for quick tasks and projects

Date: 2026-11-25

Quick tasks and projects are never deleted now: Archive hides them, and an Active / Archived switch on the Quick tasks and Projects lists (web and phone, the sessions sidebar control) shows them with Unarchive. `agentTasks.remove`/`restore` and `projects.remove` are now `archive`/`unarchive`, plus `listArchived`; the MCP tools are `archive_task` and `unarchive_task` (no confirm flag, it is undoable). Archiving a project keeps its tasks in it, retires the coordinator session and stops the scheduler; it is still refused while a task runs. Unarchive brings both back. Archived items leave lists, counts, Needs you, search, mentions and the fleet list (with an archived project's tasks), but their pages still open read-only with an "Archived" state. Tasks and projects read `archivedAt` (new indexes); `deletedAt` stays on them until a later PR drops it. After deploy run `npx convex run --prod dataMigrations:archiveDeletedEntities`.

## Session follow-ups send only the guard rails

Date: 2026-11-25

`buildEditPrompt` takes `followUp`. When an earlier assistant turn in the chat finished and there is no model handoff (`hasDeliveredTurn`), the turn sends the message, branch and commit guard rails, linked repos, custom and repo instructions only. The dev server, preview, browser, recording, runtime, chat log and style sections ride the first turn and stay in the resumed provider session. Measured with the default runtime facts: 12,734 → 705 characters per follow-up (about 3,180 → 175 tokens). After 20 turns the repeated instructions in history drop from about 254,700 to 26,100 characters. `prependModelHandoffContext` now takes the detected handoff, so the history is read once.

Claude chats also get Eva's static chat rules (`CHAT_STATIC_INSTRUCTIONS`: browser, recordings, chat log, panels, reply length, style, visual rules) as the launch-time system prompt (`chatSystemPrompt`), passed by `prewarmSessionDaemon`. Then `buildEditPrompt({ staticInSystemPrompt })` leaves them out of every message, and a fresh provider session still has them. Codex, Cursor and OpenCode prepend `SYSTEM_PROMPT` to each turn, so they keep the first-turn path. The daemon options signature carries a hash of the system prompt, so a daemon started with other text respawns. Claude first turn: 14,175 → 6,033 characters in the message, plus 8,140 cached system-prompt characters. Readable repos go back after the repo system prompt (fixes `readableReposPrompt.test.ts`).
## Inbox badge counts Needs you; no hourly coordinator cap

Date: 2026-11-25

The Inbox rail badge, the favicon count and the tab title count now show how many rows wait in Inbox → Needs you (`needsYou.list`, the same cached subscription as that view), not unread notifications, which are often only for information. The unread count stays on the Unread filter.

The coordinator's cap of 10 automatic turns an hour is gone, with its "Coordinator paused" chat banner (web and phone), list label, `getCoordinatorState` and the "a person's message releases held wakes" path. Key dedupe and the 2-minute batch window stay. Each delivery logs `coordinator_wake project=… reasons=…`, so the turn rate is measured before any limit is set. The one coordinator retry of a failed task stays: it ends the failed → retry → failed loop. After deploy run `npx convex run --prod dataMigrations:clearCoordinatorWakeHeldAt` (it delivers any held rows).

## Text generation: gpt-5-nano → gpt-6-luna

Date: 2026-11-25

`textGen` (session titles, title regeneration, inline completion, next-message prediction, transcript polish) now uses `openai/gpt-6-luna`, the same model as Ave and arena drafts. Luna rejects gpt-5's `reasoningEffort: "minimal"`, so the three low-latency calls send `"none"` through one shared `NO_REASONING` option. Gateway list price, standard tier: input $0.05 → $0.10, output $0.40 → $0.50 per 1M tokens. Task tags (Jev) and chat recaps (Haiku) are unchanged.
## Projects v2 D: reply threads in the coordinator chat

Date: 2026-11-25

Any message in a project's coordinator chat takes replies (web + phone). A reply is a `messages` row of the same chat with `replyTo` = the root; the root carries `replyCount`, `lastReplyAt` and up to 3 `replierIds`. The transcript reads `by_parent_and_reply_to` with `replyTo` unset (also `hasMessagesBefore`, the jump rail and find), and `messages.listReplies` reads a thread through `by_reply_to`. `sessionWorkflow.addReply` stores the reply, notifies the thread's people (`comment_reply`) and @mentions, and wakes Eva only when it @mentions her: the reply goes through the chat queue with `queuedMessages.replyTo`, the dequeue skips the user row, and her placeholder row carries `replyTo`, so her answer lands in the thread. Web: Reply in the message actions, "N replies" with the latest repliers' avatars, and the thread as a Replies tab in the coordinator's sandbox rail (only while `?thread=` is set; opening selects it and expands the rail; ✕ or Escape anywhere drops it and returns to the tab before it; ↑/↓ between threads via `messages.listThreadRoots` on the new `by_parent_and_last_reply_at` index). In the coordinator chat (and its threads) the footer row is gone: a floating toolbar sits on each bubble's top-right corner on hover or focus (`MessageToolbar`: 👍 👎 on Eva's replies via `TurnFeedbackActions`, then Reply, Copy, and a ⋯ menu with link, fork and checkpoints), the clock time is the bubble's tooltip, and "N replies" sits under the bubble. Phone: "N replies" in the message footer line. Other chats keep their footer. Phone: Reply in the hold menu, "N replies" under a message, and a pushed `chat/[target]/thread/[rootId]` screen. A thread turn stores `turns.replyTo`, so what follows it lands in the thread too (`insertTurnFollowUp`: stall and system alerts, the retry placeholder, `/loop` continuations; queue start errors, handoff alerts, the empty-stall retry and the usage-limit retry carry it as well). `queuedMessages.listByParent` reads the new `by_parent_and_reply_to_and_order` index with `replyTo` unset, so a queued thread reply stays out of the chat's queue panel on web and phone. While Eva's open turn answers in a thread (`messages.openThreadTurn`), the main chat shows no running state for it: a muted line over the composer says "Eva is replying in a thread on …" with the root's first words (`threadRootPreview` in `@eva/shared`) as a link that opens the thread (web: with the typing dots); Stop and queued sends work as before. The thread shows her turn streaming like a chat turn (web `ReplyThreadView`, phone thread screen). Her question in a thread turn (blocking `pendingQuestions` or streamed) docks in the thread in place of its composer, not in the chat; the chat's line then reads "Eva has a question in a thread on …" (`openThreadTurn.hasQuestion`, no dots). A blocking answer resumes her turn; a saved question's answer goes as an `@Eva` reply (`threadAnswerContent`).

## Projects v2 (A): quiet comments, @Eva, mentions in Needs you

Date: 2026-11-25

In a project's coordinator chat, a message that `@`-mentions only teammates is a quiet comment: it is stored and the teammates are notified, but no Eva turn starts (`routePersonChatMessage` returns `posted`; `startExecute` returns `"posted"`; `sendSessionChatMessage` does not queue). `@Eva` (new picker row "Eva · Coordinator", token id `eva_coordinator_mention`, web and phone) or no mention still wakes Eva; `@Eva` with teammates wakes her and the coordinator rules tell her to answer only her part. Rule: `chatMessageRoute` in `@eva/shared`. Inbox → Needs you now lists your unread chat `@`-mentions under Questions; posting in that chat marks them read (`notifyChatMentions`). Plan: `internal/plans/todo/projects-v2-chat.md`.
## Projects v2 B: the coordinator chats in short lines and shows "Eva is typing"

Date: 2026-11-25

`COORDINATOR_RULES` ask for 1-3 short plain lines, no headings, lists only for tasks. In the coordinator chat a running turn shows "Eva is typing" with the dots of the teammate `TypingIndicator` inside Eva's bubble (web `EvaTypingLine`, phone `EvaTypingText`) instead of the live activity timeline and streamed text; a blocking question card still shows, and the finished message keeps its steps. Other chats are unchanged.
## Projects v2 C: approved Triage goes to the coordinator

Date: 2026-11-25

Approving Triage items (web, phone, Inbox) no longer starts them. `approveProjectTasks` stamps `approvedAt` and new `agentTasks.handedToCoordinatorAt`, and requests one coordinator wake (new reason `triage`, delivered at once) listing the items and who added them. The scheduler never starts a handed task (`ProjectTaskFacts.withCoordinator`). New coordinator-only MCP tools: `start_task` (starts a handed item as its own task) and `merge_task_into` (cancels a handed item into an open task of the same project, stored in new `agentTasks.mergedIntoTaskId`; refuses itself, a finished or merged target and other projects). `COORDINATOR_RULES` tell the coordinator to group handed items by area, add each to an open task or start it, and reply with where each went. Task rows show "With Eva" while handed and "Added to #N" once merged.

## Projects: old project PRs become threads

Date: 2026-11-25

`migrations:convertLegacyProjectThreads` (dry run first) finishes the move from the old one-PR projects. A project whose old PR is still open or draft gets one thread, "Earlier work (PR #n)", that takes over the old branch (`agentTasks.branchName`) and the `pullRequests` row (owner moves from the project to the task, so a merge marks the thread done); its old review tasks with no PR of their own are cancelled and listed in the thread's description. A merged old PR marks those tasks done, a closed one cancels them. The coordinator moves to a fresh project branch (`branchVersion` + 1, `syncProjectSessionBranch`) in every case. Draft and todo tasks stay in Triage.

## Inbox: a project task needs review only with its own open PR

Date: 2026-11-25

`projectTaskNeedsYou` returns `review` only when the task's stage is in review and its own PR is open. Tasks from before the coordinator sit in `code_review` with no PR of their own (their work went into the project PR), so 166 of them filled the Inbox's To review on production; they no longer show there or as "Needs you" in the project task list.

## Mobile: compress native libs in the release APK

Date: 2026-11-25

The sideload APK is smaller because JNI `.so` files are stored zip-compressed instead of page-aligned (legacy packaging). Android extracts them at install; runtime is unchanged.

`expo-build-properties` now sets `android.useLegacyPackaging: true` (maps to Gradle's `jniLibs.useLegacyPackaging`). The existing arm64-only arch, R8 minify and resource shrinking stay as before. `@vvedantb/config` 0.14.2 does not ship a legacy-packaging default yet, so Eva sets it locally.

## Inbox: Needs you and Updates

Date: 2026-11-25

The Inbox (web and phone) opens on "Needs you": what waits for a person, derived from live state, so a row leaves when someone acts on it. Groups: Questions (a project task's ask the coordinator handed to a person; a blocking agent question on an open turn), To review (an open, non-draft PR of a project task, your quick task or your session), Triage (unapproved project tasks), Failed (a project task out of retries; your quick task whose last run failed). Each row has a source chip and one action (Reply, Open PR, Reject/Approve, Retry). "Updates" is the notification feed as before. New `needsYou.list` (optional `repoId`: a repo's inbox shows that repo) and `@eva/shared/needsYou`; web view in the `view` URL param.

## Projects: legacy schema dropped (PR 3b)

Date: 2026-11-25

Drops what the clearing migrations emptied: `projects.phase`, `planningMode`, `build`, `interview`, `lastBuildError`, `codeReviewer`, `sessionChats.taskId`, the `projectDetails` and `taskDependencies` tables, and the `by_repo_and_phase`, `by_repo_and_build_state` and `sessionChats.by_task` indexes; `projectBuildValidator`, `projectInterviewValidator` and `clientProject` go with them. Deletes `clearLegacyProjectFields`, `clearTaskDependencies` and `clearProjectCodeReviewer`. Deploy only after `clearLegacyProjectFields` ran on production.

## Projects: legacy interview, plan and build code removed (PR 3a)

Date: 2026-11-25

Removed the old project interview and spec workflows (`projectInterviewWorkflow`, `_projects/interviewState`), the project build (`_projects/buildState`, the build wrappers in `buildWorkflow`, `executeScheduledBuild`, `releaseProjectSessionForRetire`), the project PR phase sync (`_projects/prSync`, `applyProjectPrEvent`), `projects.startDevelopment`/`addMessage`/`clearMessages`/`updateLastConversationMessage`/`countBuilding`/`getActive`, the legacy task chat in a project session (`findProjectTaskChat`, `chatOwner`'s task branch; callers use `sessionOwner`), `convertProjects` and the old phase/interview migrations. `recomputeProjectPhase` is now `onProjectTasksChanged`: it only schedules ready tasks; nothing writes `projects.phase` (now optional). `projects.get` drops `conversationHistory`/`generatedSpec`; `projects.update` drops `phase`/`generatedSpec`; MCP `stop_agent` and `get_agent_state` drop `buildRunning`. Web and phone: the Plan/Interview views (`ProjectTabs`, `ProjectChatTab`, `ProjectPlanTab`, phone `ProjectPlan`), View Plan / Interview History, the building badge and beam, and every stored-phase badge are gone; projects show the derived stage only. New `dataMigrations:clearLegacyProjectFields` (legacy project fields), `deleteProjectDetails` (every `projectDetails` row) and `clearSessionChatTaskIds` (`sessionChats.taskId` on every chat); PR 3b narrows the schema after it runs on production.

## Projects: parallel reads on hot project paths

Date: 2026-11-25

`/parallel-awaits` on this branch: the scheduler loads tasks and facts context together; `createCoordinatorTasks` checks repo access for all tasks at once; chat recaps read task chats and messages in parallel; `list_entities` derives each project's stage and sandbox status in parallel.

## Projects: coordinator sandbox drops task-only tabs

Date: 2026-11-25

The coordinator's sandbox rail (web) no longer shows Preview, Browser, Review, Computer, Editor or Files (`COORDINATOR_HIDDEN_TABS` in `ProjectSandboxPanel`); an old link to one lands on Tasks. A task's own sandbox keeps every tab. The phone coordinator screen never had them.

## Projects: the coordinator groups and routes feedback

Date: 2026-11-24

`COORDINATOR_RULES` now tell the coordinator to sort a dump of items by area, put related small items in one task (one PR per area), send items to an open task that already covers the area (`send_chat_message`) instead of creating a new one, and reply with where each item went.

## Projects: no cap on running or created tasks

Date: 2026-11-24

The scheduler starts every approved project task at once (`MAX_PARALLEL_PROJECT_TASKS` is gone), and one coordinator call may create any number of tasks (`MAX_TASKS_PER_COORDINATOR_BATCH` is gone); the coordinator's prompt and `create_tasks_batch` note say so.

## Chat: coordinator replies in bubbles; grouped bubble runs

Date: 2026-11-24

In the project coordinator chat, Eva's replies sit in a left-side bubble with her mark, as a teammate's message (web `assistantBubbles` on `ChatBody`, phone `EvaBubble`); task and session chats keep the flat reply. In every chat, a run of bubbles from one sender groups (`findBubbleGroups` in `@eva/shared`): 4px apart, one name, the avatar and action row on the last bubble only.

## Projects: "+" replaces Feedback; no header status badge

Date: 2026-11-24

The project header loses its status badge and Feedback button (web and phone; `agentTasks.createFeedbackTask` and the phone feedback screen are gone); a project task added with "+" waits in Triage ("Added by <name>") unless "Start now" approves it, and the phone composer gains attachments.

## Projects: no Code Reviewer field

Date: 2026-11-24

The project Code Reviewer field is gone (web and phone) and `projects.update` drops its `codeReviewer` arg; `dataMigrations:clearProjectCodeReviewer` clears stored values before the field leaves the schema.

## Projects: no Extra repos setting

Date: 2026-11-24

The coordinator may create a project task in any repo the acting user can access (default the home repo); `projects.extraRepoIds`, `projects.setExtraRepoIds` and the Repos picker (web and phone) are gone.

## Projects: project context is the always-read text; project tasks leave Quick Tasks

Date: 2026-11-24

The project description ("Project context", now editable on phone) replaces the Instructions field in every coordinator and child-task prompt (`projects.setInstructions` and `projects.instructions` are gone), and `agentTasks.getAllTasks` drops project tasks, so Quick Tasks lose the Project filter and project badges (web and phone).

## Projects: flat Tasks list like Amp and Capy

Date: 2026-11-23

The project Tasks list has flat rows (status icon, title, one plain line from `projectTaskSummaryLine`, age), muted group headers on a soft band, a thin bar with one counts line, hover-only Approve / Reject, and a Pull requests group; the task badges are gone (web and phone).

## Projects UI: role and dependency gates removed, phone Documents tab and model picker

Date: 2026-11-23

Everyone gets the full project UI plus Feedback; the Blocked badge is gone; phone projects gain a Documents tab and a model/account picker; a child task links to the project summary; a refused delete toasts its reason (web and phone).

## Projects: no roles, no dependencies, the coordinator starts its tasks

Date: 2026-11-23

Project roles and task dependencies are gone, the coordinator's tasks start at once (Triage holds feedback), `delete_task` refuses a started task, and a project delete is refused while a task runs and keeps its tasks as quick tasks (`projects.remove`; `projects.deleteCascade` and `agentTasks.deleteCascade` are gone).

## Projects: Overview | Coordinator, Tasks on the rail, Triage

Date: 2026-11-23

Projects open on the Coordinator (Sandbox renamed; the Tasks tab moved to the coordinator rail's first item), unapproved tasks sit in a new Triage group with Approve / Reject / Approve all, a task opens its own chat and sandbox in place, and the chat's proposed-task cards and `projects.listTaskBatches` are gone (web and phone).

## Projects: three stages, task counts by display status

Date: 2026-11-23

Projects show To Do, In Progress and Done only (In Review is gone), and project task counts and progress bars use Working / Blocked / Idle / Archived (web, phone, `listStatusesForRepo`).

## Project tasks: Working / Blocked / Idle / Archived, compact rows, no build controls

Date: 2026-11-23

Project task lists group child tasks as Working, Blocked, Idle and Archived (`projectTaskDisplayStatus`) in compact rows, and drag-to-reorder, Run Eva, Stop Build, Schedule build and the five `*_project_build` MCP tools are gone (web and phone).

## Projects UI: coordinator always open, read-only menus, viewer gaps

Date: 2026-11-23

WHY: The UI still tied the coordinator chat to the stored phase and offered git actions the read-only coordinator cannot do.

What users see:

- A contributor can always open, wake and message a project's coordinator chat, whatever the old phase (web Sandbox tab and Start, phone Chat and Wake).
- The project page has no Commit & push, Create PR or Resolve Conflicts (web and phone). Child tasks keep them.
- A child task's or coordinator's account picker lists the project's account first.
- Viewers: no long-press menu on the phone projects list, no comment or reply composer on a project's tasks (web and phone), and they see the "Coordinator paused" line without "Send a message to continue".

Architectural: `isProjectPreviewPhase`, `projectCanCreatePr` and `projectCanResolveConflicts` are gone from `@eva/shared`. `reviveCoordinatorSession` (`_sessions/ownedSession.ts`) un-archives a live project's session on `ensureWorkSession` and on every person's chat send. `withProjectAccountFirst` backs `listForSessionOwner`, `listForTaskOwner` and `listForProjectOwner`. `projects.list` rows carry `callerRole`.

## Projects backend: read-only coordinator, clean asks, old project conversion

Date: 2026-11-23

WHY: The coordinator must not be able to push, a task that asks a question must not look failed, and old projects must move to the new model without losing work.

What users see:

- A task that asks its coordinator a question now waits quietly: no error row, no failed state, no retry. Stop on a waiting task closes its question.
- Chatting directly in a project's task runs on the project's model and account, like its runs.
- The coordinator chat is always reachable: a new project, or one whose tasks are all done, no longer loses its chat or sandbox.
- New projects skip the interview whatever an older phone sends.

Architectural: every GitHub token a coordinator sandbox gets is read-only (`mintSandboxGitToken`, `isReadOnlySandboxOwner`, the `evaReadOnlyGit` VM token claim). A run that ended on its ask is recorded as `RUN_WAITING_FOR_ANSWER`. `_projects/runSettings.ts` holds the decision 20 rules for runs and chat turns. `projects.phase` is written only by `recomputeProjectPhase` (derived) and the legacy project PR webhook. `agentTasks.branchName` (new, optional) keeps an old project branch. `migrations:convertProjects` converts old projects (runbook in the plan). A coordinator's Recap reads each child task's Main chat in the task's own session (`chatRecaps.recapChats`), and a coordinator sandbox stays at `COORDINATOR_VCPUS` whatever the app's sandbox size.

## Projects run by a coordinator chat, with parallel child tasks

Date: 2026-11-23

WHY: Big work does not fit in one session or one quick task. A project now holds it: one coordinator chat plans the work and proposes tasks, and each task runs on its own like a quick task, so people see what is launched, in progress and still to do.

What users see:

- A new project opens straight on its coordinator chat. There is no interview or plan step; the New Project dialog no longer asks for one. Old projects that still have an interview or a plan keep those tabs.
- The coordinator never edits code. It proposes tasks in batches; each batch is a live card in its chat with the task's number, title, stage, repo (when it is not the home repo), PR, phase label and why it needs you. One Approve starts the batch; a task's ✕ rejects it. A click opens the task in the project's task pane.
- Child tasks run in parallel (at most 3 at a time), each with its own sandbox, branch and PR to main, and they wait for their dependencies to launch. A task can target another repo of the project.
- A task can report to the coordinator or ask it a question. The task list and the card show the open question and the task's reports; "Waiting for coordinator" shows until the coordinator answers, "Question for you" once it passes the question on. Answer in the task's own chat.
- The coordinator wakes by itself at most 10 times an hour. At the cap its chat shows one line and the project needs you until someone sends a message.
- Roles: devs are contributors (chat, approve, run, change settings); everyone else is a viewer who reads everything, including child tasks, and files feedback tasks.
- The project Overview shows the summary document the coordinator keeps, with live task counts above it.
- A project's stage is derived from its tasks: the Change Phase bulk action and the card's Phase menu are gone, and the timeline shows launched tasks out of all tasks.

Architectural: `ProjectTaskBatchCard` (rows are `ProjectTaskRow`, data from `listByProject` plus `listTaskBatches` for grouping) reaches `ChatBody` through a new `inlineCards` prop and the existing `placeChatUiPanels` placement; only `ProjectSandboxChatPanel` passes it, so session and quick task chats are unchanged. `CoordinatorPausedBanner` (`getCoordinatorState`) sits in `SandboxChatPreInput`. The projects list reads `listStatusesForRepo` in one subscription (`useProjectListStatuses`) instead of one `listByProject` per project. Task rows read the server's `facts` (`projectTaskFactsFromRow`), so usage limit, cancelled dependency and question reasons show; open asks and reports come from `listTaskReports` (`projectTaskNotesByTask`). `@eva/shared/projectView` gains the copy and helpers (additive). A viewer's child-task pane disables text edits, properties, file removal and sandbox start.
## Sandboxes get an allowlist of env vars, not prod's secrets

Date: 2026-11-24

WHY: The Eva seed copied every prod env var into each sandbox. Sandboxes then sent real email (`EMAIL_ENV=production`), held the prod GitHub app key, and rejected the dev Clerk sign-in.

Architectural: `.eva/sandbox-env.json` lists, per Convex app, every env var a sandbox gets, each with one rule: `copy` from the source, `eva` (the sandbox's Eva env var of the same name, for test keys), a fixed `value`, or a `generate`d secret or ES256 key pair. `sync-to-local.mjs --sandbox-env` sets those, removes every other var on the local backend, and reports source vars not in the file and `eva` vars Eva does not provide. The loader, `scripts/sandbox-env.mjs`, and the env block of `sync-to-local.mjs` are shared word for word with carepulse-ts. Name listing now asks for `--names-only` on Convex CLI 1.42+, as carepulse-ts already did. `.eva/config.json` seeds with `--sandbox-env`.

## Mobile: smaller release APK (R8, shrink resources, arm64 only)

Date: 2026-11-24

WHY: The release APK was about 62 MB. About 50 MB of the contents was unminified dex, and a large part of `res/` was unused icon fonts.

Architectural: `expo-build-properties` in `app.config.ts` sets `buildArchs: ["arm64-v8a"]`, `enableMinifyInReleaseBuilds` and `enableShrinkResourcesInReleaseBuilds`, with keep rules in `PROGUARD_RULES` for Hermes, React Native, Expo modules, Reanimated, worklets and Clerk. `x86_64` stays out because CI never runs the release APK on an emulator. The first release with R8 needs a device smoke test.

## Web: fix main CI, React Compiler bailout in KanbanBoard

Date: 2026-11-24

WHY: `compiler-check` failed because React Compiler cannot compile a `finally` clause, and the kanban drop glide added one.

Architectural: `KanbanBoard.handleDragEnd` clears `droppedId` once after the try/catch (the catch swallows), so it runs on success and error with no `finally`.


## Web: review tabs, logs views, sidebar rows, kanban cards and stats load motion

Date: 2026-11-24

WHY: The last places that still swapped at once now move: review tabs and logs views slide like other tabs, sidebar rows fold in and out, kanban cards glide to their new column, and Stats fades in after its spinner.

Architectural:
- `useKeepAliveTabSlide` + globals.css `data-tab-pane`: the tab slide for keep-alive panes (`ReviewTabsPanel` keeps Summary, Timeline and Code mounted with `invisible`). The new pane plays `t-tab-pane-in`; the old one plays `t-tab-pane-out`, whose `visibility: visible` keyframes hold it on screen over `invisible`. Gated on `data-tab-dir`, set only after the first switch, so mount does not slide.
- Settings → Usage views (Overview, Type, Project) use `TabsTransition` (`LOG_VIEW_ORDER`) in place of an opacity fade.
- `sidebarRowPresence`: session, automation and review rows open their height on arrive and fold it on archive or delete (220 ms). They clip only while moving (`transitionEnd: overflow visible`), so focus rings stay. Review rows gained an `AnimatePresence` (`initial={false}`).
- `kanbanCardGlide`: quick task and project cards carry `layoutId`, so a status or phase change glides the card between columns (320 ms). The new column clips it while it travels. A card the user just dropped skips it (`droppedId`, cleared when the mutation resolves).
- `useLoadedFade`: Stats fades its content in when it replaces the spinner; cached data shows at once. Lists, empty states (`EmptyState.enter`) and `PageWrapper animated` pages already animated in, so they are unchanged.

## Web: sandbox panel tabs slide like tab content

Date: 2026-11-24

WHY: Switching tabs in the sandbox panel (sessions, quick tasks, projects) played a small scale settle. It now slides the content in from the side of the picked tab, matching the tab-content and rail slides.

Architectural: `@vvedantb/ui` 0.63.0 replaces `dockNudge` with `dockSwitch(panel, fromTab, toTab)`. `SidePanelTabs.Frame` calls it on a tab switch: each card child slides 24px with a fade over 240 ms, on the axis between the old and new tab (vertical on the rail, horizontal on the phone strip). Enter only: the panes are keep-alive (`hidden` / `<Activity>`), so the old pane cannot leave without remounting iframes and terminals. The card dispatches `DockMotionEvent`, so the preview iframe host steps aside during the slide.


## Web: side-panel links slide the page like the rail

Date: 2026-11-23

WHY: The side panel's links (Projects, Quick Tasks, Stats and so on) are a vertical list like the rail, so moving between them now slides the page up or down the same way.

Architectural: `railNavDirection.ts` also tracks `.vt-panel a[href]` clicks against the panel's `aria-current="page"` link (`nav` source) and returns `{ source, direction }`. The router adds `nav-down` / `nav-up` to the `page` type only when the click is already a page swap, so moving from one session or project to another stays instant. globals.css slides only the page for `nav-*` (24px, 240 ms in, 144 ms out, no delay); the panel stays put.

## Web: switching apps from the rail no longer swaps the panel early

Date: 2026-11-23

WHY: Clicking an app in the rail changed the side panel at once, while the page waited about 300 ms for the app's route to load. The rail slide then moved only the page, and the panel header flashed "eva / web" before "Eva".

Architectural: `Sidebar` reads two locations. The rail (`RepoRail` props, `showSearch`) uses the pending `useLocation()`, so its pill still answers the click at once. The side panel and everything derived from it (flags, panel key, mode, repo data) use the router's `resolvedLocation`, so the panel changes with the page inside the same view transition.

## Web: rail page switches slide in the rail's direction

Date: 2026-11-23

WHY: Switching pages from the vertical rail only faded the content; sliding the side panel and page up or down with the rail shows where you went, like the tab slide does sideways.

Architectural: `lib/railNavDirection.ts` records a rail click's direction (the clicked `[data-rail-tile]` below or above the `[data-active]` one, by position). The router's `defaultViewTransition.types` adds `rail-down` / `rail-up` to the `page` type for that navigation, even between apps on the same leaf route. globals.css names the side panel (`.vt-panel` on `SidebarPanel`) `panel` for those types and slides both 24px: 240 ms in (the page 40 ms behind), 144 ms out. Other page swaps keep the plain rise. "Disable page animations" still stops it.

## Web: view switchers slide (quick tasks, projects, testing arena)

Date: 2026-11-23

WHY: The quick tasks Kanban/List switch, the projects Kanban/Timeline/List switch and the testing arena Code/Browser tabs now slide from the side of the picked view, like the other tab sets.

Architectural: `QuickTasksClient` and `ProjectsClient` replace their per-view `AnimatePresence` fade-ups with `TabsTransition`. Quick tasks keep one fade-up branch for entering from loading or empty, with the board/list slide inside it. The orders are `QUICK_TASK_VIEWS` (now also the toolbar's type guard), `PROJECT_VIEW_ORDER` (from `VIEW_OPTIONS`) and `ARENA_TABS`. Each project view keeps its own layout via `PROJECT_VIEW_PANEL_CLASS`. List filters (active/archived and the like) and the timeline range stay instant.

## Web: quick task Task/Sandbox and project tabs slide (@vvedantb/ui 0.62.1)

Date: 2026-11-23

WHY: The quick task's Task/Sandbox switch and the project's Overview/Plan|Tasks/Sandbox tabs crossfaded; they now slide from the side of the picked tab, like the team page.

Architectural: packages #340 adds `TabsTransition` `panelClassName`, so full-height panels keep their flex classes. `TaskDetailInline` and `ProjectDetailMainContent` replace their `AnimatePresence` fades with `TabsTransition`; the orders are the new `SANDBOX_SURFACES` and `PROJECT_MAIN_TABS` constants, which the tab components' type guards now use too. `@vvedantb/ui` 0.62.0 → 0.62.1 in every workspace.

## Web: composer action cards match the composer footer width

Date: 2026-11-23

WHY: Matching the composer card still read too wide; the cards should line up with the narrower footer bar (branch, stash, model) under it.

Architectural: The `ComposerActionCards` row inset goes from `px-3 md:px-4` to `px-6 md:px-8`: `ChatComposer`'s wrapper padding plus the footer's own inset. The cards are also compact: `xs` button (28px), 16px icon, `py-1.5 pr-1.5 pl-3` over the `tight` Surface's `p-3`, and an 8px gap between cards. Follow-up: the two numbers live in two files; a shared inset class would stop them drifting.

## Web: composer action cards match the composer width

Date: 2026-11-23

WHY: The Today and last-session cards spanned the full landing column, wider than the composer card above them.

Architectural: The row in `ComposerActionCards` takes `px-3 md:px-4`, the same inset `ChatComposer` puts around its card.

## Web: action cards under the landing composer (Today + last session)

Date: 2026-11-23

WHY: The Today card sat above the greeting and could be dismissed, but it is a standing suggestion of what to do next, not a notice.

Architectural: `TodayStandupCard` became `ComposerActionCards`, rendered under `ChatComposer` in `NewSessionComposer`. Today shows whenever `standupStatus.enabled` ("New standup · <day>" + "Open Today" while unread, else "Today" + "View Today"); the dismiss button and its `markStandupsRead` call are gone, so only opening Today marks standups read. The second card links the user's most recently updated session, from the cached `sessions.list` + `auth.me` through the shared `filterSessionsStartedBy` / `sortSessionsForSidebar`. Two cards sit side by side from `sm`, stacked below it; one card takes the full width.

## Web: neutral greys no longer tint red (oklab colour mixing)

Date: 2026-11-23

WHY: In the dark neutral theme the sessions sidebar rendered faintly red (rgb 37 34 35) beside the page (34 35 37) after the full-colour token switch.

Architectural: Tailwind's `v()` (and 47 other `color-mix(..., transparent)` sites in web and `@eva/ui`) mixed in oklch. Chrome sets a near-grey's hue to `none` there but keeps its small chroma, which then renders at hue 0. They now mix in oklab, which has no hue; the result is otherwise the same. Follow-up: five package token mixes (`--focus-ring`, `--danger-ring`, base.css) still use oklch.

## Web: env variables, snapshots and PR recap tabs slide too

Date: 2026-11-23

WHY: Extends the team-page tab slide to the other pages whose tabs swap the page content.

Architectural: `EnvVariablesPageClient` (Repo/Team) and `SnapshotsClient` (Configuration/Status/Builds) replace their own `AnimatePresence` opacity fades with `TabsTransition`, and `PrRecapPanel` (Recap/Summary) wraps its views. The orders are the exported `envVarScopes`, `snapshotSettingsTabs` and `PR_RECAP_VIEWS`. Left out: list filters (sessions, reviews, feedback, quick tasks, projects) and form toggles stay instant; the review panel keeps every tab mounted; route-outlet tabs (project, sandbox surface, review nav, logs) would slide the new route out with the old panel; the testing-arena panels need a full-height option in `TabsTransition`.


## Recap on a revisit after 4 hours

Date: 2026-11-23

WHY: A recap started only when a reply finished while you were away, so reopening a session whose last reply you had seen showed nothing, however long you were gone.

Architectural: `useChatReadState` now calls `markRead` on every open, not only when a reply is unread. `chatReads` rows gain `lastVisitedAt` (written at most once a minute). `maybeStartRecap` measures the absence from the later of the read and the visit: a missed turn after 30 minutes gives the "away" recap; nothing new after `RECAP_REVISIT_MS` (4 hours) gives a "full" ("Recap") one. One more mutation per chat open. While a chat is on screen, `touchVisit` moves `lastVisitedAt` every 5 minutes and once on leaving, so watching a long turn no longer reads as being away (the old rule measured from the open or the last read, so a watched 30-minute turn showed "Since you've been gone"). Recaps now start only on an open (`markRead({ opened: true })`), never when a reply lands on a watched chat, and an open deletes the recap from an earlier visit (`expireRecap`): prod held 5 recaps, one 73 hours old with nothing after it, shown again on every open.
## Web: team tab content slides from the picked tab's side (@vvedantb/ui 0.62.0)

Date: 2026-11-23

WHY: Switching tabs on a team page swapped the content at once; a short slide from the side of the picked tab shows where the new content came from, as a phone swipe does.

Architectural: packages #336 adds `TabsTransition` (`"none"`, `"slide"`, `"push"`; `value` plus `order`, built on Motion `AnimatePresence` with a custom direction) and `UiConfig.Tabs.transition`. `@eva/ui` `controlsConfig` sets `transition: "slide"` (32px plus fade, 240 ms in, 140 ms out). `TeamDetailClient` wraps its panels in `TabsTransition` with the exported `teamDetailTabs` order. Other tab pages opt in by wrapping their panels the same way. `@vvedantb/ui` is now 0.62.0 in every workspace (it was a mix of 0.55.0, 0.57.0 and ^0.60.0).

## Callback tests: pruned, repaired, type-checked, security gaps covered

Date: 2026-11-23

WHY: Devs found the tests low-value. An audit of `callback-src/tests` showed 81% sound, but duplicates, assertions that could not fail, test-only seams, and no tests on secret redaction or the media-upload guard.

Architectural: Duplicate and vacuous tests are merged into one keeper per contract or deleted; weak assertions now fail when behaviour breaks (each new or repaired test was proven by a deliberate code break). New tests cover redaction of tool output and turn completions, the symlink/hard-link media guard, non-Claude `extractResultEvent`, session resume after restart, `enforceTurnLease` and the deposition fence. Test-only seams and dead code are removed (`fetchFn`/`env` on `ensureGithubToken`, `isRival`, `waitMs`, `buildTurnCompletion`, `resolveResumeId`, `setActiveId`, `stopBranchWatcher`, background-shell test helpers, null-lease branches). `typecheck:callback` now also type-checks `callback-src/tests` (`callback-src/tests/tsconfig.json`).
## Web: `globals.css` imports `@vvedantb/ui/tokens` with full colours

Date: 2026-11-22

WHY: Eva kept shadcn-style `R G B` channel variables and `compat-shadcn-rgb.css` because the full tokens import sets oklch colours. That forced a hand-copied radius scale (#1458) and a second colour system next to vhub and Verve.

Architectural: Eva now takes light, dark and neutral surfaces, brand, `--segment`, `--danger`, `--success`, `--warning`, `--radius` and the radius utilities from the package. Eva keeps only its own tokens (`--status-*`, `--cat-*`, `--warning-bg`, `--accent-soft`, …) as full `rgb()` values.
- Tailwind: `bg-primary` is the brand `--accent`; `text-muted-foreground` is `--muted`; `bg-muted` is `--surface-secondary` (`@theme` in `globals.css`). `bg-accent` is now the brand fill, so eva's soft hover fill moved to `bg-accent-soft` / `text-accent-soft-foreground` (`--accent-soft`). `tailwind.config.js` keeps only eva's own colours and uses `color-mix` for opacity.
- Theme picker: `ACCENT_COLORS` hold `rgb()` values. `applyCustomThemeVars` sets `--accent`, `--accent-foreground`, `--accent-soft` and `--accent-soft-foreground`. Focus, chart-1 and sidebar primary follow `--accent`.
- Every `rgb(var(--x))` call site now uses `var(--x)` or `color-mix`. The HTML-render frame maps the shadcn names a page reads to the package tokens (`PAGE_TOKEN_SOURCE`).
- Package `markdown.css` 0.60.0 still reads `rgb(var(--foreground))`; a colour-only shim in `globals.css` overrides it. Delete it when the package ships full colours.
- Dark and neutral surfaces now match the package (light `--background` #F5F5F5, dark #060606). `SHELL_COLOR`, `index.html` and `manifest.json` follow. The extension config gains an `accent-soft` alias for shared `@eva/ui` classes.

## Web: rail groups get their rounded corners back

Date: 2026-11-22

WHY: `@vvedantb/ui` 0.60.0 `railGroupClass` uses `rounded-[calc(var(--radius-lg)+0.25rem)]`. Eva does not import `@vvedantb/ui/tokens`, so `--radius-lg` was undefined, the `calc()` was invalid and the corners were square.

Architectural: `globals.css` now defines `--radius-lg`, `--radius-md` and `--radius-sm` in `@theme inline`, copied from the package tokens. The full tokens import stays skipped because it sets oklch colours that clash with `compat-shadcn-rgb.css`. No className overrides on `RailGroup` or `RepoRail`.

## Skills: commit, push and ship are vendored in-repo

Date: 2026-11-22

WHY: Stop depending on the public external skills repo before it goes private. `commit`, `push` and `ship` now live as local files in `.agents/skills/` and their `skills-lock.json` entries are gone.

Architectural: these three skills are edited here and no longer overwritten by a skills update. `README.md`, `AGENTS.md`, `CLAUDE.md` and the `audit` skill say so.

## Web: Appearance tiles come from the package (@vvedantb/ui 0.60.0)

Date: 2026-11-21

WHY: The package now ships eva's theme tiles as `ThemeModePicker`, so the local copy only repeated it.

Architectural: Theme settings and the onboarding theme step render `<ThemeModePicker value onChange compact? />`; `AppearanceSection.tsx` is deleted. The account menu keeps eva's `toggleTheme`: it resolves `system` to the live appearance before it cycles, and the package's `nextThemeInCycle` does not. `@vvedantb/ui` ^0.59.2 → ^0.60.0 in web only.

## Web: rail, side panel and mobile header tones come from the package (@vvedantb/ui 0.59.2)

Date: 2026-11-21

WHY: The package now draws eva's trough, pill, side panel card and page-tone mobile header by default. eva's local copies only repeated it.

Architectural: one token remap stays in `globals.css`: `@theme inline { --color-segment: rgb(var(--segment-active)) }`. Compat maps `bg-segment` to `--card`, which in dark and neutral is the trough itself, so without it the pill would vanish. Removed: the `.rail-track` rules, `railGroupThemeClass`, the `rail-track` hooks on `RepoRail`, `ButtonTrack`s and `CHAT_HEADER_ACTIONS_CLASS`, `listClassName="tabs-segmented"` on the sandbox `SidePanelTabs.List`, the `SandboxPanelFrame` card and arrow tones, and `bg-background` on `Sidebar.MobileHeader`. Kept: `.tabs-segmented` (eva's own opt-in look for eva `TabsList`s), `.t-side-panel-arrow` and `[data-dock-slide]`. `@vvedantb/ui` 0.57.0 → ^0.59.2 in web only; Vite dedupes it, so `@eva/ui`'s 0.57.0 pin does not ship a second copy.

## Android release builds in parallel with Check; @vvedantb/config 0.12.0

Date: 2026-11-20

WHY: A releasing merge ran three boat-large jobs in a row (check, release paths, release), so the APK waited for Check and an extra runner start. The build now starts with Check and only publish waits.

Architectural: `ci.yml`'s `release` job (push only, no `needs`) calls the shared `release-android-apk.yml@main` directly. Its `pathspecs` input is the path gate (soft skip when no changed file matches), and `wait_for_check_job: Check` makes the shared workflow wait for the Check job before Publish, so a failed Check publishes nothing. There is no local wrapper: `release-android-ci.yml` is deleted and `scripts/build-android-release.sh` has no `WAIT_FOR_CI_CHECK` polling. Manual `release-android.yml` runs do not wait. `@vvedantb/config` 0.11.0 → 0.12.0 (release APKs are arm64-v8a only).

## Web: rail shell, dock motion and sandbox side panel come from the package (@vvedantb/ui 0.57.0)

Date: 2026-11-20

WHY: Other apps can now use eva's layout with one prop (`AppShell` `variant="rail"`). eva kept its own copies of the dock motion, the sandbox tabs and the button tracks, so the two would drift.

Architectural: `Sidebar.tsx` sets `variant="rail"` on `AppShell.Root`. `SidebarContext` calls the package `popOutShellPanel` / `popInShellPanelNextFrame`; `RepoRail` spreads `shellDockTileProps`. The sandbox pane is `SidePanelTabs.Frame`, its rail `SidePanelTabs.Rail` and `.List`, and each tab `SidePanelTabs.Tab`; `ResizablePanelLayout` closes the card with `popOutSidePanel`. Tool and header groups use `ButtonTrack` / `buttonTrackClass`. eva's tones stay: `rail-track` and `tabs-segmented` in `globals.css` still win over the package tokens, and the arrow transition (`.t-side-panel-arrow`) and dock-slide rules stay there because eva does not import the package CSS. Removed: `lib/dockMotion.ts`, `sidebarPanelMotion.ts`, `sandboxCardMotion.ts`, `sandboxRail.ts`. `@vvedantb/ui` 0.55.0 → 0.57.0 (web, `@eva/ui`, extension; the `@eva/shared` dev pin stays, so no APK release).

## Phone update check asks V Store

Date: 2026-11-20

WHY: The check read GitHub releases, which works only while this repository is public. V Store knows the newest release either way.

Architectural: `UpdateDialog` passes `vStore` (package name and the APK link) to `UpdateChecker` in place of `source`. `@vvedantb/native-ui` goes to 0.34.0. The prompt and its buttons are unchanged.

## Web: menu and popover zoom comes from the package (@vvedantb/ui 0.55.0)

Date: 2026-11-20

WHY: The 40% grow-from-trigger motion for menus and popovers lived only in eva's config; the package default still zoomed from 95%, so other apps did not get it and eva kept its own copy.

Architectural: packages #312 adds `triggerZoomAnimateClass` (fade plus `zoom-*-[0.4]` at `--radix-popper-transform-origin`, open 150 ms, close 100 ms) and uses it for dropdown, context menu and popover defaults. `@eva/ui` `config/overlays.ts` imports it instead of its own `triggerZoomClass` and drops the per-primitive `origin-*` classes. That also fixes the dropdown origin: it read as the menu centre (104px 104.5px), and now it is the trigger corner (208px 0px). `@vvedantb/ui` 0.54.1 → 0.55.0.

## Web: menus and popovers grow from 40%, like modals

Date: 2026-11-20

WHY: Compared side by side (80%, 60%, 40%), 40% reads most clearly as growing out of the trigger and matches the modals.

Architectural: `@eva/ui` `config/overlays.ts` `triggerZoomClass` goes from `zoom-in-[0.8]` / `zoom-out-[0.8]` to `[0.4]`. Timing is unchanged (open 150 ms, close 100 ms).

## Phone update prompt: shared component and Install from V Store

Date: 2026-11-20

WHY: Other apps need the same "Update available" prompt, and the phone app can now also be updated from V Store.

Architectural: The check and the dialog moved to `@vvedantb/native-ui` (`UpdateChecker`). `src/update/UpdateDialog.tsx` only passes Eva's values: the `eva-apk-` releases, the installed version (0.1.0 skips the check), SecureStore under the same `eva.updateDismissed` key, and the same text. `src/update/updateCheck.ts` is gone. New: "Install from V Store" only opens V Store (`vstore://updates`); when V Store is not installed the button is replaced by a notice and Download stays.

## Web: menus and popovers grow from their trigger

Date: 2026-11-20

WHY: Modals grow out of what opened them; dropdowns, right-click menus and popovers only scaled from 95%, which barely read as coming from the trigger.

Architectural: `@eva/ui` `config/overlays.ts` adds `triggerZoomClass` (fade plus `zoom-in-[0.8]` / `zoom-out-[0.8]`, open 150 ms, close 100 ms) at the Radix transform origin: the trigger, or the cursor for a context menu. Dropdown and context menus (`menuContentClass`, sub-menus too) and Popover use it; Popover drops its 8px side slide so it moves like the menus. Hover card and Select keep `floatingMotionClass`. 80%, not the modals' 40%, because these open constantly.

## Web: modals close with the same zoom (@vvedantb/ui 0.54.1)

Date: 2026-11-20

WHY: Modals grew out of their trigger on open but vanished at once on close; the shrink back into the trigger never played.

Architectural: Radix Presence reads the animation in the same commit that sets `data-state="closed"`, but the package keyed its closing styles (and the `t-modal-presence-wait` animation Presence waits on) only on `.is-closing`, which a MutationObserver adds a moment later, so Presence unmounted at once. packages #308 keys them on `[data-state="closed"]` too. `@vvedantb/ui` 0.54.0 → 0.54.1; Eva's `html[data-page-motion="off"]` rule in globals.css covers the new selector.

## Web: @vvedantb/ui 0.54.0, the package patch is gone

Date: 2026-11-20

WHY: Eva carried a pnpm patch of `@vvedantb/ui` (from #1395) that made the bulk action bar icon-only with tooltip labels. It edited the package source and its built JS, so every upgrade had to move it and any upstream change to the file could break it.

Architectural: packages #307 adds `BulkActionBar labels` (`"inline"` default, `"tooltip"`) and the `UiConfig` entry `BulkActionBar: { labels }`. `@eva/ui`'s `controlsConfig` sets `labels: "tooltip"` for every bar (inbox, projects, quick tasks). `patches/@vvedantb__ui@0.53.0.patch` and its `patchedDependencies` entry are deleted; `@vvedantb/ui` 0.53.0 → 0.54.0 in web, the Chrome extension, `@eva/shared` and `@eva/ui`.

## Web: @vvedantb/ui 0.53.0, reduced-motion setting covers the package

Date: 2026-11-20

WHY: Eva passes `MotionProvider reducedMotion="never"`, but the package's own dialogs, sheets and `motion-reduce:` classes still read the OS setting, so OS reduced-motion users lost modal motion against Eva's rule.

Architectural: `@vvedantb/ui` 0.52.0 → 0.53.0 (packages #306). `MotionProvider reducedMotion` now stamps `html[data-reduced-motion]` and provides context; the package's `prefersReducedMotion()`, the Dialog zoom, the `motion-reduce:` variant (`utilities.css`, which Eva imports), `motion.css` and the landing CSS follow it. Eva needs no code change beyond the upgrade. The pnpm patch moves to 0.53.0 unchanged.

## Web sidebar: main content slides with the panel

Date: 2026-11-20

WHY: Hiding or showing the sidebar slid the package aside's width, but the main content jumped to its new margin, so the two moved out of step.

Architectural: `dockMotion.slideWith(follower, leader, property)` copies the leader's transition timing onto the follower for one change and fires `DOCK_MOTION_EVENT` on it, so a preview iframe inside steps aside. `sidebarPanelMotion` slides `<main>`'s `margin-left` with the shell aside (280 ms, out-quint, read from the aside) on hide, after the pop out, and on show.

## Web: @vvedantb/ui 0.52.0, modals grow from their trigger

Date: 2026-11-20

WHY: Modals should open like the sandbox card does, out of what you pressed; they also replayed their entrance about 300 ms after opening when the content re-rendered.

Architectural: `@vvedantb/ui` 0.51.0 → 0.52.0 (packages #303) in web, the Chrome extension, `@eva/shared` and `@eva/ui`. The package's `modalTransition` aims each Dialog at the press that opened it (within 500 ms) or the focused control, starting at 40% scale; with neither it keeps the centred zoom, and the command palette stays instant. Eva's pnpm patch of the package (icon-only bulk action bar) moves to 0.52.0 unchanged.

## Web preview iframe steps aside during dock motion

Date: 2026-11-19

WHY: The preview iframe glitched when the sandbox card popped in or out. It lives in the root `PreviewIframeHost` overlay, not in the card, so it could not follow the card's scale and lagged the chat-pane width slide by a frame.

Architectural: `dockMotion` fires `DOCK_MOTION_EVENT` on the panel with the motion's length (pop in 380 ms, switch 220 ms, pop out 660 ms with the hold). `previewIframeHost` hides any overlay whose anchor is inside that panel (`opacity-0`, no pointer events), then re-measures it at the end and fades it back over 150 ms. The listener checks the event type and its `ms` field, not `instanceof`, so a hot-reloaded module still matches.

## Web sandbox split: chat pane slides with the card

Date: 2026-11-19

WHY: The card popped in and out smoothly, but the chat pane beside it jumped to its new width, so the two read as out of step.

Architectural: `dockMotion.slideNextResize` marks the `react-resizable-panels` group (`data-dock-slide`) for one toggle, and globals.css transitions the panels' `flex-grow` with the pop's timing (380 ms open, 260 ms close, out-quint). `ResizablePanelLayout` calls it before the toggle's resize, before the collapse after the pop out, and on the expand signal. A drag never sets it, so it stays 1:1 with the pointer.

## Web sidebar panel: dock pop on hide and show

Date: 2026-11-19

WHY: The sandbox card docks into its rail tab; the left panel should hide and show the same way, so both rails share one motion.

Architectural: The motion moves to `lib/dockMotion.ts` (`dockPopIn`, `dockNudge`, `dockPopOut`, with a left or right rail edge); `sandboxCardMotion.ts` is now a thin wrapper. `SidebarContext.setCollapsed`, which the rail tile, the shortcut and search all call, pops the panel out into the `data-sidebar-dock-tile` tile before it collapses, and pops it in on the next frame after it shows. App switches do not move the panel. The aim checks height, not width, because the package's aside slides its width open from 0. The docked frame now holds for 400 ms (past that 280 ms slide) or until the next pop in, so a hiding panel never flashes back at full size.

## Design check bans reduced-motion gates

Date: 2026-11-19

WHY: The app has no reduced-motion mode, but a new gate still slipped in (sandbox card) and hid motion for readers with the OS setting.

Architectural: `scripts/design-check.mjs` adds the `reduced-motion` reason: `prefers-reduced-motion` (now also in `.css` files), `useReducedMotion`, and a `reducedMotion` config of "user" or "always". Comment lines are skipped. The vendored stageshow gates (7 CSS media blocks and the bubble `matchMedia`) are gone, so the baseline holds none. CLAUDE.md has a one-line rule.

## Web sandbox card: motion ignores OS reduced motion

Date: 2026-11-19

WHY: The dock motion checked `prefers-reduced-motion`, which the app does not support, so readers with that OS setting saw no motion.

Architectural: `sandboxCardMotion.motionOff` reads only `html[data-page-motion=off]`.

## Web sandbox card: dock pop in and out, active tab toggles it

Date: 2026-11-19

WHY: The card appeared and vanished with no link to the rail; growing out of the tab and shrinking back into it shows where the panel lives. Pressing the active tab now does the collapse button's job, so the button is gone. The arrow painted over content at the card's edge.

Architectural: `sandboxCardMotion.ts` holds the Web Animations: `popInSandboxCard`, `nudgeSandboxCard` (both from `useActiveTabArrow`'s observers, after it measures) and `popOutSandboxCard`, which `ResizablePanelLayout.handleToggle` runs before `panel.collapse()` (found through the right panel's `elementRef`). The shortcut and the active tab share that path. `SandboxTabTrigger` reads the reselect on mouse down or Enter/Space, since Radix selects on mouse down; the rail `Tabs` use `activationMode="manual"`, because mouse down plus focus fired two changes before the URL updated and a closed panel opened then closed. The active tab's tooltip says "Hide panel (shortcut)". The arrow renders before the now `relative` card. Empty rails keep `SandboxPanelToggleButton`.

## Session summary: schema field and turn lane removed

Date: 2026-11-19

WHY: `dataMigrations:retireSessionSummaries` ran on prod, so nothing stores a summary any more.

Architectural: `sessions.summary` and the `"summary"` turn lane leave the schema (`turnLaneValidator` is now only `"interview"`, and `laneOwner` drops its lane argument). The PR body no longer adds a Summary section. The three retire migrations are deleted; the schema-narrowing markers name them from the base revision.

## Session summary retired; "Recap chat" on every chat

Date: 2026-11-19

WHY: The summary woke the sandbox and ran an agent to write bullets the away recap and the Log already cover; it existed only on sessions.

Architectural: `summarizeWorkflow.ts`, the web summary accordion and modal, the phone `SessionSummary`, the session-level workflow watchdog (`trackSessionWorkflow`, `handleStaleSession`) and the `summary:` stream prefix are gone. `chatRecaps` rows gain `kind` ("away" | "full"); `chatRecaps.requestFull` starts a whole-chat recap from "Recap chat" in the session, quick task and project "…" menus (web `useRecapChat` + `RecapChatMenuItem`, phone chat menu). Card titles come from `RECAP_TITLE`. `sessions.summary` and the `"summary"` turn lane stay in the schema until `dataMigrations:retireSessionSummaries` runs on prod. `check-apk-compat.sh` now warns in CI instead of failing: old APKs may break, and prod Convex deploys with the next phone release.

## Chat recap: "Since you've been gone" (web and phone)

Date: 2026-11-19

WHY: Coming back to a long-running chat meant scrolling the transcript to learn what happened. Amp's Recap (Spaces and threads) solves this with a short summary only you see; we copy it.

Architectural: `chatReads.markRead` now returns the read time it replaced; when that is 30+ minutes old and a turn finished since, `chatRecaps.maybeStartRecap` writes a per-user `chatRecaps` row and schedules `textGen.generateChatRecap` (flex tier, `RECAP_MODEL` = Claude Haiku 5.5: faster than GPT-6 Luna and the only one that used task chips; nano echoed prompt labels). `recapContext` reads the transcript and Log since the read time (newest 16k characters); a project's Main chat reads every chat in the project session and offers task chats as `@[Title](taskId)` chips, and unknown ids are stripped. `useChatRecap` (`@eva/shared/chatReadState`) feeds `ChatRecapCard` (web `ChatBody`) and `RecapCard` (phone chat screen), inside `ChatLastTurn` under the newest message (after it, the viewport padding pushed it a screen down); × deletes the row, and the card hides once you send a message after it. No backfill: recaps start on the next long absence.

## Web sidebar: repo banner inset with rounded corners

Date: 2026-11-19

WHY: The uploaded repo banner was the last full-bleed, square-cornered piece of the app chrome; everything else sits on rounded tracks or cards.

Architectural: `SidebarPanelHeader` wraps the banner image and its fade in `absolute top-2 right-2 bottom-0 left-1 overflow-hidden rounded-t-surface`. The header content, the panel width and panels without a banner are unchanged. `docs/eva-ui.md` notes the rule.

## Web sidebar panel: no edge line

Date: 2026-11-19

WHY: The rail and the sandbox panel lost their dividers; the sidebar panel still drew a 1px right edge, the last resting line in the app chrome.

Architectural: `SidebarPanel` drops `border-r border-sidebar-border`; the panel stays on the page tone. `docs/eva-ui.md` now says neither the rail nor the panel has an edge line.

## Web sandbox panel: content card with an arrow to the active tab

Date: 2026-11-19

WHY: The sandbox content ran edge to edge beside the rail; as a card with an arrow at the active tab it reads as part of the rail's segmented groups and shows which tab owns it.

Architectural: `SandboxPanelFrame` (session, task and project panels) gives the content `md:my-2 md:mr-1.5 md:rounded-surface` and renders a `size-4` `bg-card` arrow. `useActiveTabArrow` measures the rail's active tab (scoped to the rail, not tab lists inside the card) and writes the transform to the node; it re-measures on resize, scroll, `data-state` changes and when animations end, snaps the first placement and hides when the tab is outside the card. `.sandbox-tab-arrow` (globals.css) slides with the tabs pill timing. The review panel and the diff file tree no longer paint the page tone, so the card shows through.

## Web chat header: actions on one track, flat buttons

Date: 2026-11-19

WHY: The chat header's usage, sandbox and menu buttons sat loose next to the title; the rails now group buttons on a trough.

Architectural: `CHAT_HEADER_ACTIONS_CLASS` (`ChatPageWrapper`) puts the header actions on a `rail-track` trough for session chats and for the task and project header (`SandboxChatHeaderActions`); it hides itself when empty. A `globals.css` rule makes any button on a `rail-track` flat, so the round secondary start and menu buttons lose their own fill and hover at half the pill.

The project header (`ProjectDetailHeaderActions`) and the quick task header (`TaskFooter` header layout) put their secondary controls (usage, menu, commit and push, start and stop) on the same `CHAT_HEADER_ACTIONS_CLASS` track; Build, Stop Build and Run stay outside as filled primary actions, and the task header drops its divider next to Run.
## Web: no hairline under tab strips and panel headers; UI guide covers rails

Date: 2026-11-19

WHY: After the rail redesign, the UI guide still told agents to divide the sidebar edge with a hairline, and tab strips kept a line that the rail no longer uses.

Architectural: `docs/eva-ui.md` now says icon rails have no edge, separators or resting split divider, and group buttons on troughs (`Sidebar.RailGroup` + `railGroupThemeClass`, `SANDBOX_RAIL_GROUP_CLASS`); tab strips and panel headers have no bottom hairline. The Plan and Recap viewers and the PR recap panel pass `border-b-0` to the package `TabsBar`; the file viewer header drops its `border-b`.

## Web rail: segmented-tab groups with a sliding pill

Date: 2026-11-19

WHY: The app rail and the sandbox tab rail should read like the tab component: a shared trough per group, the active item on a lighter pill, and no border or dividers.

Architectural: the rail moves to `@vvedantb/ui` 0.51.0 (packages #299), which adds `Sidebar.RailGroup`: one trough per group and one pill that slides to the active tile with the tabs motion. `RepoRail` wraps its top, repo and bottom sections in groups, centres the repo group (`justify-center-safe`), and drops the rail border and separators. `railGroupThemeClass` (`rail-track` in `globals.css`) gives the groups eva's segmented-tabs tones, which also fixes the package's compat tokens drawing a darker pill on a lighter trough in dark. The sandbox tab rail puts its tabs on the same `tabs-segmented` trough and centres them. The `@vvedantb/ui` patch moves to 0.51.0 unchanged.

The sandbox rail's collapse toggle and tools (new preview, terminal, labels) sit on their own troughs (`SANDBOX_RAIL_GROUP_CLASS`), and the session, task and project splits drop the resting divider line (`ResizablePanelLayout` `seamlessSeparator`); the line and grip show on hover and while dragging.

## Phone: find in chat, session summary, edit and download a proposed plan

Date: 2026-11-18

WHY: The web finds text in a thread, summarises a session and edits or downloads a proposed plan; the phone had none of these.

Architectural: the chat ⋯ menu gains "Find in chat", which opens a find bar under the header (the web count, up and down, Return for next). The matching moves to `@eva/shared/threadFind` (the web re-exports it); each match scrolls the inverted list to its message with the kit's new `ConversationList` `scrollToIndex` (`@vvedantb/native-ui` 0.29.0, packages #291), which reaches rows not drawn yet, and a primary tint marks the message. Session chats gain the web "Summarise Session" / "Regenerate Summary" item (awake sandbox and a message needed) with its confirm, and the folded "Session summary" block above the chat, open with the live step while it writes. The plan card gains Download (the web `.md` file through the share sheet, `expo-sharing`) and Edit (a sheet that saves with `sessions.updatePlanContent`, as the web; the phone has no Plan tab, so once the saved plan matches no card, the newest card shows it and its actions use it). Kit 0.29.0 also draws sheets, dialogs and dropdown menus in the app's window (packages #290), so opening or closing one over a scrolled-up chat no longer throws it to its newest message on Android.

## Phone chat composer: background processes, review comments and skill suggestions

Date: 2026-11-18

WHY: The web session composer lists and stops the agent's background shell processes, sends diff comments with the next prompt, and suggests skills for the draft. The phone had none of the three.

Architectural: `BackgroundProcessesChip` sits after the agents chip on the composer bar (`backgroundProcesses.listRunning`, `sandbox.killBackgroundProcess`, a 15 s `reconcileBackgroundProcesses` while it shows). The chat's diff is now commentable; its comments share `usePendingLineComments` with the review screen (as the web sandbox shares them between Review and chat), show as chips in the composer header, and go out as `<review_comment>` blocks (`appendReviewCommentsToPrompt`, moved to `@eva/shared` with the new `reviewCommentExcerpt`). `useSkillSuggestions` asks `skillSuggestions.suggest` after 700 ms idle; its chips join "Paste image" in one kit suggestion row (`ComposerSuggestions`) on the chat and new-session screens. The pick rules (`skillSuggestions`) and the elapsed format (`formatDurationMs`) are shared with the web.

## Old-APK shims removed: `sessions.getOwned` and project `activeWorkflowId`

Date: 2026-11-18

WHY: Both existed only for APK 0.1.96. The app built after #1391 reads `sessions.getOwnedWithSeed` and `projects.interview`, so once that APK is published the shims have no caller.

Architectural: `sessions.getOwned` and the derived `activeWorkflowId` on `projects.get` / `getByNumId` are removed. `check-apk-compat.sh` passes only against an APK built after #1391.
## Phone: attach files, and quote part of a reply

Date: 2026-11-18

WHY: The web composer's + attaches files (HTML, Markdown, text) as well as images, and a text selection in a reply can be cited into the next prompt. The phone's + only picked photos, and it had no way to quote.

Architectural: the phone's + (`AttachButton`, chat and new session) opens a kit `DropdownMenu` with the web's "Attach files" and "Add photos". Files come from `expo-document-picker` (new native module) and go through `useAttachments`, which now applies the web's checks (5 files, 10 MB, images and text files, same toasts). Those rules (`isAllowedAttachmentFile`, `contentTypeForUpload`, `chatAttachmentErrorMessage`, the limits) move from the web's `attachmentMeta.ts` to `@eva/shared`. A long press on a reply gains "Select text": a sheet shows the reply in a field that selects but does not edit, and "Quote" adds a chip over the composer (`src/chat/Quotes.tsx`). A send appends the quotes as `<cited_assistant>` blocks; a sent message draws them as quote cards. `assistantCitation.ts` moves from the web to `@eva/shared/assistantCitation` for both apps.

## Phone: live tasks, /goal and publish recovery above the composer

Date: 2026-11-18

WHY: the phone chat lacked three web rows above the composer: the running turn's to-do list, Claude's `/goal` with Clear, and the one-tap force-push after a rewritten branch blocks publishing.

Architectural: `@eva/shared/composerTasks`, `agentGoal` and `publishRecovery` now hold the logic and copy; the web panels read them. Phone `ComposerTasksPanel` (reads `streaming.get`), `GoalBanner` (`sessionChats.get`, Clear sends `/goal clear`) and `PublishRecoveryBanner` (session chats that can reply; `sessions.listRepos`, `sessions.forcePushBranch`) are built by the chat screen and handed to `ChatDock` as `banners` and `panels`.

## Project interview fields and project-keyed turns removed

Date: 2026-11-18

WHY: `migrateProjectInterviewState` ran in prod and the gate reported 0 (no project-keyed turns, no project on the legacy fields). Keeping the old fields and the project branch of the turn owner kept two ways to file one interview.

Architectural: `projects.activeWorkflowId` and `projects.interviewSandboxClaim` leave the schema, and `projects` leaves `turnEntityIdValidator`. Interview turns resolve only through the project session (`interviewTurnSessionId`); the project fallback in `laneOwner`, `turnOwnerId` and the completion and stop paths is gone, with the migration and its gate query. `projects.get` still returns `activeWorkflowId`, derived from `interview`, because installed APKs (0.1.96) read it as "interview running"; remove it once no supported APK does. The phone's project plan now reads `interview`, like the web, so its running state works again.

## Project interviews have one explicit state; their turns sit on the project session

Date: 2026-11-12

WHY: Two fields described one interview lifecycle: `projects.activeWorkflowId` and `projects.interviewSandboxClaim`. The save step cleared the workflow before the release step stopped the VM. A build or the chained spec could claim the session in that gap, and the release then stopped their VM. The stale and stall teardowns left the claim behind, so the claimed start never failed and the prepared VM never stopped.

Architectural: The new `projects.interview` (`started` | `claimed` | `prepared`; absent = idle) is written only by `_projects/interviewState.ts`, through a pure transition table fenced by `workflowId`. `releaseInterview` ends the interview, releases the VM and chains the spec in one mutation. Every stop uses `stopProjectInterview`. Interview turns now open with `entityId` and `sessionId` set to the project session (lane `interview`), so the session's open-turn reads see them. The legacy fields stay optional and nothing writes them. Run `dataMigrations:migrateProjectInterviewState`. Before the narrowing PR, `migrations:projectEntityTurnsLeft` must report 0.
## One Stop for web, mobile and MCP

Date: 2026-11-12

WHY: Stop did different things per surface. Mobile left a project task's run going. MCP `stop_agent` on a project stopped every task chat too. Only MCP refused a sandbox Stop mid-turn on the server; web Stop during a build killed the build's VM, and a task or project sandbox Stop could create a session.

Architectural: `_sessions/stop.ts` holds the two Stops. `sessions.stopChatTurn({ chatId } | { taskId })` cancels the chat's turn and its task's run, never a build or interview. `sessions.stopWorkSandbox({ sessionId } | { taskId } | { projectId })` refuses while a turn, run, build or interview holds the session, and never creates one. `sessionWorkflow.cancelExecution` and `taskWorkflow.cancelExecution` are gone; `sessions.stopSandbox` stays for archive teardown only.
## One owner-to-session lookup

Date: 2026-11-12

WHY: The rule "a project and its tasks share the project's session; a quick task owns its own" was spread over about ten helpers and inline copies. A caller could pick the wrong one.

Architectural: `_sessions/owner.ts` holds the rule (`workSessionOwner`) and the read path (`findWorkSession`, over the raw `findOwnedSession`). `ownerState.findWorkChat` resolves the chat. `ownedSession.ensureWorkSession` is the one create path; a project task always gets its project's session. Removed: `taskSessionOwner`, `projectSessionOwner`, `taskUsesOwnedSession`, `taskWorkSessionOwner`, `findTaskSession`, `findProjectSession`, `findQuickTaskSession`, `findTaskWorkSession`, `findOwnerChat`, `ensureOwnedSession`, `ensureTaskWorkSession`, and the `ownedSession.ts` re-exports. Behaviour is unchanged.
## MCP: send messages and start sessions on a teammate's shared account

Date: 2026-11-18

WHY: `send_chat_message` and `create_session` could not pick a provider account. A send ran on Team and reset the chat's account; a new session always used the caller's own account, so a teammate's shared account was out of reach.

Architectural: both tools take `account` (owner's first name, account id, or "team"; `mcpAccountArg` in `mcp/toolShared.ts`). `mcp.queries.resolveMcpProviderAccount` resolves it against `listSelectableAccountsFor` (the web picker's pool: own accounts plus teammates' shared ones), filtered to the model's provider; an unknown or ambiguous name returns the usable choices. An omitted `account` on a send keeps the chat's current account, as the composer does. `buildChatMessageCalls` forwards the id to `addMessage`, `startExecute` and `enqueueMessage`, which still check usability.

## Phone: archive a linked session group

Date: 2026-11-18

WHY: The web archives a whole linked group from its menu (#1370); on the phone each session had to be archived one by one.

Architectural: the group header's menu (a long press in the Sessions tab) gains "Archive group" in the active list only, as the web sidebar; a confirm with the web copy counts the active members from `sessions.listGroup` and calls `sessions.archiveGroup`. `sessionCountLabel` ("1 session", "3 sessions") moves to `@eva/shared` for both dialogs.

## Phone: holding a message or opening an image no longer throws the chat to its end

Date: 2026-11-18

WHY: On Android, opening an image over a scrolled-up chat (and, now and then, closing the hold menu) moved the chat to its newest message.

Architectural: `@vvedantb/native-ui` 0.28.0 (packages #289) draws `MessageContextMenu` and `ImageViewer` in the app's window through `WindowLayerHost`, which wraps the root `Stack`. A React Native `Modal` is a window of its own on Android and moved the focus as it opened and closed; `react-native-keyboard-controller`'s chat list scrolled to its end on each. A layer never moves the focus. The kit's `chatHold` and `chatImage` Android scenarios reproduced both jumps and pass with the layer. Layers close on Android back and hide the app from screen readers while shown.

## Phone chat parity: system rows, stopped turns, answered questions, holds and states

Date: 2026-11-18

WHY: The phone chat hid what the web shows: handoff and refusal rows, a stopped turn's marker, the record of an answered question, the composer's usage-limit hold, why a session is read-only, and the sandbox's state in an empty chat.

Architectural: `visibleChatMessages`, `isSandboxLifecycleAlert`, `collectQuestionSteps` and `getSessionReadOnlyMessage` move to `@eva/shared` (`chatRows.ts`; the web re-exports them), so both apps draw the same rows. The phone draws system rows with `SystemAlertRow` (the web `SystemAlertMessage`: hairlines, tone icon, time, detail dialog), a "Stopped" line under a stopped turn, and the kit `ActivityQuestionCard` (0.27.0, packages #286) for answered questions; `activityTrace` keeps a question step's `questions` and `answers`. The composer reads the usage-limit hold (`findUsageLimitHold`, a one-minute clock in the composer only); a closed session names its reason; the empty chat follows the sandbox (`SANDBOX_CHAT_COPY`), and a send parked while every run slot is taken says "Waiting for a free slot".

## Phone: the agent's question stays after the sandbox stops; the hold menu pops in

Date: 2026-11-18

WHY: A question the agent saved on its reply vanished from the phone once the turn (and the sandbox) stopped; the web kept it. The hold menu and the paste chip appeared with no motion.

Architectural: the chat screen reads the last reply's `pendingQuestion` (as the web `ChatBody`) and docks it in the composer's place when no blocking question is open; its answer is sent as a chat message (which wakes the sandbox) in the web's text, now one shared helper (`formatQuestionAnswers` in `@eva/shared/pendingQuestion`, used by the web `MultipleChoiceQuestion` too). `@vvedantb/native-ui` 0.26.1 (packages #285): `MessageContextMenu`'s pill and card grow 0.96→1 and the held message lifts to 1.02 in 150 ms. `PasteImageChip` fades in (`FadeIn` 150 ms). Reduce Motion skips both.

## Phone: paste an image straight into the text box

Date: 2026-11-18

WHY: The "Paste image" chip needed a copied image; long-press Paste and the keyboard's image insert (Gboard's clipboard) still did nothing, as React Native's `TextInput` takes no image.

Architectural: `@vvedantb/native-ui` 0.26.0 adds `PromptInput` `onPasteImages` and the `/paste-input` entry (`PasteInputProvider`, packages #284) on `expo-paste-input` (native: `OnReceiveContentListener` on Android). The root layout wraps the app in `PasteInputProvider`; both composers pass `useAttachments().pasteFiles`, which reads each pasted cache file with `expo-file-system` `File.base64()` and uploads it as a picked photo. Needs the new APK (native module). The chip stays.

## Phone: paste an image into the composer

Date: 2026-11-18

WHY: The web composer takes a pasted image; on the phone, a screenshot had to be saved to the gallery first and then picked.

Architectural: React Native's `TextInput` takes no pasted image, so a "Paste image" chip (the kit `Suggestion`, user choice) shows over the chat and new-session composers while the clipboard holds one. `src/chat/clipboardImage.ts` is an external store over `expo-clipboard`: `hasImageAsync` reads only the clip's MIME types (no Android "pasted" notice), rechecked on clipboard changes (native only; the web module throws on `addClipboardListener`) and when the app comes back. A tap reads the image as PNG (`getImageAsync`) and `useAttachments().paste` uploads it like a picked photo. The kit 0.25.3 fix makes the chip round with its fill.

## Typecheck runs on tsrs, oxc's Rust port of TypeScript 7

Date: 2026-11-18

WHY: `tsrs` checks the same programs 2.4–3.5x faster than `tsc-rs` here (web 9.1 s → 2.7 s, backend 6.2 s → 2.0 s, mobile 7.0 s → 2.0 s) with the same diagnostics.

Architectural: one root devDependency, `tsrs` 7.1.0-beta.tsrs2, replaces the three per-package `tsc-rs` 0.1.0 pins; every `typecheck` script runs `tsrs --noEmit --fast -p <tsconfig>` (`--fast` adapts checker counts and adds caches; options such as `strict` are unchanged). `video/` (its own npm project) moves from `tsc` too. `pnpm-workspace.yaml` exempts `tsrs` and `@tsrs/*` from the 7-day release soak until 2026-11-23.

## Phone typecheck runs on tsc-rs, as web and backend do

Date: 2026-11-18

WHY: The phone was the last package on plain `tsc` (about 42 s); `tsc-rs` checks it in about 7 s.

Architectural: `apps/mobile` `typecheck` is `tsc-rs -p tsconfig.json` (0.1.0, the version web and backend pin). `tsc-rs` checks side-effect imports, so `nativewind-env.d.ts` declares `*.css` for `app/_layout.tsx`'s `import "../global.css"`.

## Phone: holding an older message no longer throws the chat to its end

Date: 2026-11-18

WHY: On Android, a hold on an older message moved the chat to the newest message, which closed the menu; closing the menu did it again.

Architectural: `@vvedantb/native-ui` 0.25.2 (packages #279). The hold menu's `Modal` window takes the focus as it opens and as it closes, and `KeyboardChatScrollView` scrolled the list to its end on each keyboard event. `Conversation` now has an `overlay` state, and `ConversationList` passes `freeze` from the hold until the close settles. Pressed hold menu rows now show the sheet's pressed fill. No Eva code changes.

## Phone: hold a message for an iMessage-style menu; menus come from the kit

Date: 2026-11-17

WHY: The hold menu on chat messages and task comments was a bottom sheet; the user wanted iMessage's, with the message lifted in place, the reactions above it and the actions below it. The phone's menu sheet and reaction row were also Eva-only copies that other apps could use.

Architectural: `@vvedantb/native-ui` 0.25 adds `MessageContextMenu` and `Message`'s `menu` prop, `MenuSheet`, `SubmenuRow`, `MenuDivider` and `ReactionRow` (packages #277, #278). The phone's `src/ui/MenuSheet.tsx` is removed and its 19 users import the kit's. Chat rows pass `menu` to the kit `Message` (`useMessageMenu` in `src/chat/MessageHoldMenu.tsx`: thumbs in the pill; Copy text, Copy link, Fork, Retry, Diff this turn and Restore in the card). Task comments and the task description use the same menu through `ReactableMenu` (`measureHeld` reads where the held item is), with the quick emoji and "More reactions" in the pill.

## Web: archive a linked session group

Date: 2026-11-17

WHY: Clearing out a finished group meant archiving each of its sessions one by one.

Architectural: new `sessions.archiveGroup` archives every active, standalone member the user can reach (same 50 cap as `listGroup`). `chats.archive` and the group archive now share `stopAndArchiveSession` in `_sessions/mutations.ts`. `SessionGroupArchiveDialog` confirms with the server's active count and is opened from the sidebar group's right-click menu (active list only) and the session header's linked chip.

## Phone: a message's actions open on press and hold

Date: 2026-11-17

WHY: Every message carried a row of six buttons (copy, link, fork, thumbs), which doubled the chat's height on a phone and made long chats noisy.

Architectural: `MessageFooter` keeps only the model mark and the time; the actions move to `src/chat/MessageHoldMenu.tsx`, one sheet for the chat screen that a press and hold on a message opens (with a haptic; the message shrinks a little while held; screen readers get it as an action): the reply's thumbs, Copy text, Copy link, Fork from here, Retry on a failed turn, and Diff this turn and Restore on a reply that changed code. The Changes chip stays; its rows and restore confirm are now `TurnChangesRows` and `useTurnRestore`, shared by both.

## Phone: automations, with their runs, Run now and an On switch

Date: 2026-11-16

WHY: Automations and their reports lived only on the web, so checking last night's run or starting one meant opening the web.

Architectural: the trigger and schedule wording (`automationTriggerOf`, `describeTrigger`, `describeCron` and the UTC-local cron shift) moved from the web's `trigger.ts` and `CronScheduleCard.tsx` to `@eva/shared/automations`, with `cronstrue` as a shared peer and a phone dependency (the version the web already uses; no lockfile version changes). The phone's Projects tab gets an Automations section (`src/automations/AutomationsSection.tsx`, the web sidebar group for the chosen repo), and `app/automation/[automationId].tsx` shows when it runs, an On switch (`automations.update`), Run now (`automations.runNow`), the prompt and the last 50 runs, each opening its report, error and pull request, marking it read (`acknowledgeRun`) and, while running, offering Stop (`cancelRun`).

## Phone: read, reply to and resolve a doc's comments

Date: 2026-11-16

WHY: Teammates and Eva comment on docs on the web, but the phone showed no comments, so a question on a PRD could not be answered from the phone.

Architectural: the thread split (open, resolved, replies by parent) and the failure toasts moved to `@eva/shared/docComments`; the web panel and thread read them. The phone doc screen gets a Comments button with the open count (`src/docs/DocCommentsButton.tsx`), which opens `app/doc/comments.tsx`: Open and Resolved threads with the quoted text, "For Eva", the comments and replies, Resolve or Reopen, and Reply (`docComments.create` with `parentId`). A new thread starts from a text selection, which stays on the web.

## Phone: sort and filter the Sessions list

Date: 2026-11-16

WHY: The web Sessions sidebar can sort projects and threads, show only your own sessions and choose how many show per project; the phone list had one fixed order and three rows.

Architectural: the option labels, the visible-threads limits and clamp, and `filterSessionsStartedBy` moved from the web's `sessionsSidebarSettings.ts` to `@eva/shared` (`sessionList.ts`); the web re-exports them. The phone's `src/sessions/SessionListOptions.tsx` keeps the options on the device and adds a header button on the Sessions section with a sheet (Sort projects, Sort threads, Only my sessions, Visible threads); the list applies them through `sessionListEntries`, `useSessionGroups` and the "Show more" row.

## Phone: search across teams and repos

Date: 2026-11-16

WHY: The web's ⌘K spotlight finds any session, task, project, doc, pull request or page; the phone had no search, so finding older work meant scrolling lists or opening the web.

Architectural: the result groups, their order and labels moved from the web's `spotlightGroups.ts` to `@eva/shared/spotlight` (the web keeps its icons), and `repoForHref` joins `@eva/shared/appHref`: the repo whose base path a link starts with, as `spotlight.search` hits carry a link and no repo id. The phone has `app/search` (a magnifier in the Sessions tab header): a field, Recent before you type (on the device), then the grouped results; a result opens through `openAppLink`, so a session, task, project, doc or pull request opens its phone screen, a section page its tab, and the rest the web.

## Phone: diff a turn, or restore to before it

Date: 2026-11-16

WHY: On the web a session reply that changed code offers "Diff this turn" and "Restore to before this turn" (its checkpoints); the phone had neither, so undoing a bad turn needed the web.

Architectural: the restore copy, the blocked-restore reasons, the labels and `turnCheckpoint` (the reply's before/after commits, or null) moved to `@eva/shared/turnCheckpoint`; the web hook and dialog read them. The phone puts a "Changes" chip under such a reply (`src/chat/TurnChangesChip.tsx`; the footer row is full on a phone): a sheet with Diff this turn, which opens a new turn diff screen (`app/chat/[target]/turn-diff.tsx`: the files, then one file, read only), and Restore, behind the web confirm (`sandbox.revertSessionToTurn`). The phone diff store and views now take a `DiffRef` (a pull request or two commits; commits read `github.getCompareDiff`), so the turn diff reuses the PR Code tab's list and file view.

## Phone: see and stop a chat's background agents

Date: 2026-11-16

WHY: When the agent sent subagents off to run in the background, the web showed them in a chip with Stop, but the phone showed nothing, so a runaway subagent could only be stopped from the web.

Architectural: the visibility rule, the row text and the stop confirm's copy moved to `@eva/shared/backgroundAgents` (the web chip and `useStopBackgroundAgent` read them; `backgroundAgentVisibility.ts` removed). The phone's `src/chat/BackgroundAgentsChip.tsx` reads the chat's `sessionChats.get` doc and sits on the composer bar (a new `status` slot on `ComposerFooter`): "Agents N" opens a sheet of the agents with Stop, behind the web confirm (`sessionWorkflow.requestStopBackgroundAgent`). Not on the phone: View (the subagent's own thread).

## UI copy rule in CLAUDE.md — 2026-11-16

### Changes

- `CLAUDE.md` has a new `## UI copy` section: subtext is the exception, not the default

### Why

Sections and rows had helper text that repeated the title or value. The rule is shared across the apps through `@vvedantb/config`.

## Phone: the agent's proposed plan shows as a card in the chat

Date: 2026-11-16

WHY: A plan the agent proposed in a session chat showed on the web as a card with Implement, but the phone showed nothing, so a plan could only be read and acted on from the web.

Architectural: the web `proposedPlanLogic.ts` and `planExport.ts` moved to `@eva/shared/proposedPlan` (the web card, Plan tab and tests read it; `toSorted` and `.at` dropped for Hermes). The phone's `src/chat/ProposedPlanCard.tsx` has `useProposedPlans` (`proposedPlans.listBySession`) and the card, which the chat screen puts under the message that proposed the plan (a new `after` slot on `ChatMessageRow`, the web `afterMessage`): badge, title, Copy, a folded preview with Expand plan, Save as Document (`docs.createFromSession`, then the doc screen), Implement (`chats.send` with the web prompt, then `proposedPlans.markImplemented`) and Implement in new session (`chats.start` on the chat's model and account, `sessions.updatePlanContent`, `markImplemented`). Not on the phone: Edit and Download.

## CI: the daemon kill test no longer fails at random under load

Date: 2026-11-16

WHY: `killEntityDaemonTreeContract` failed about 1 run in 7 under CPU load (it failed CI on two phone PRs that touched no backend code): the kill command waits for the daemon only, and the test checked the daemon's child at the same instant, before that child had gone.

Architectural: the test now waits up to 1s (the gap before the relaunch) for the child to go, and counts a zombie as gone, since a zombie has closed the flock fd. The kill command is unchanged. Under load: 2 of 15 runs failed before, 0 of 30 after; with the child-kill removed from the command, the test still fails.

## Settings: no explanatory sub-text under titles

Date: 2026-11-16

WHY: Every settings section, toggle and field had a line of explanation under its title. It was too much text to read.

Architectural: static `description` props are removed from `SettingsSection`, `SettingsToggleRow` and `SettingsField` across global and repo settings. Kept: live data (counts, sandbox status, time zone, daily stop time, shortcut keys), input format hints (cron, Grok webhook URL, Tabler icon name), "never injected" secret warnings, instructional empty states and experimental flag descriptions. `isMonorepoCodebase` and the `listSiblingApps` query in `ConfigClient` are gone, because only the removed "Applies to every app" hint used them.

## Phone: a chat with several PRs lists them all in its "…" menu

Date: 2026-11-16

WHY: The phone menus of a session, quick task or project showed one "Open PR" or "View PR" row, so a chat's other PRs (stacked or linked ones) could not be reached from the phone.

Architectural: with two or more PRs (`pullRequests.listForOwner`) the row reads "Pull requests (N)" and opens a bottom sheet (`src/reviews/PullRequestsSheet.tsx`): one row per PR, open and draft first, and a page per PR with the web `PrActionsSubmenus` actions (Open PR on the phone's PR screen, View on GitHub, Copy link, Stack a new session, Close without merging). One PR keeps the direct row. `orderPrsLiveFirst` and `pullRequestsMenuLabel` moved to `@eva/shared` (`prState.ts`) and the web menu reads them; the close confirm is one phone `PrCloseDialog`, also used by the PR screen; `useOpenPr` replaces the session menu's and the task and project pages' own copies.

## Automations Hub: "New" in the header, one `+` in the sidebar

Date: 2026-11-16

WHY: The sidebar had two buttons per app (hub, new) and the hub page repeated its own title and a long blurb.

Architectural: the page title is now "Automations Hub" with a "New" header button (`automations/_components/NewAutomationButton.tsx`, the create dialog moved from `GlobalAutomationsSidebar`). The "Automations Hub" subheading and its blurb are gone; the "n of m installed" count stays. In `GlobalAutomationGroup` the grid hub link is removed and `+` links to that app's hub.

## Snapshot seed settles live state from the prod export

Date: 2026-11-16

WHY: A sandbox seeded from a prod export showed sessions as running, turns in flight and task runs pending, because the export is taken while they are live.

Architectural: `scripts/sync-to-local.mjs` rewrites the root tables during its existing python zip pass (`settle()`): sessions not closed → `closed`; turns that are live or open → `done`, `open: false`; agent runs queued/running → `cancelled`; `agentTasks.run` removed; `projects.activeWorkflowId` and `interviewSandboxClaim` removed. No rows or tables are dropped. The seed prints a count per table.

## Web: hover cards on GitHub pull request and Eva links in chat

Date: 2026-11-15

WHY: A PR link in chat showed only its URL or label; to see its state, title or size the reader had to open GitHub.

Architectural: `ChatMarkdownLink` (`apps/web/src/lib/components/chat/ChatMarkdownLink.tsx`) is the chat `a` renderer: a link that `@eva/shared` `parseGithubPrLink` reads as `github.com/owner/name/pull/n` gets a hover card with state, `owner/name #n`, updated time, title, author, `+/−` and file count (reusing the review page's `statusMeta`, `PrAvatar`, `PrDiffStat`); other links stay `MarkdownLink`. Agent replies (`ChatMessage`) and user messages (`MarkdownMentionText`) use it. The card fetches only when open, through the new `github.getPullRequestCard`, which resolves the owner/name to a repo the caller can read (`githubRepos.findAccessibleIdByOwnerAndName`) and returns null otherwise. It shares the PR header cache with the Reviews page; the header payload gained `status`, `draft`, `authorAvatarUrl`, `additions`, `deletions` and `changedFiles` (cache renamed `prHeaderV2`).

Links to an Eva session, quick task, project or doc (`/owner/name[/app]/<section>/<numId>`, as a path or a full URL on this app's origin; `@eva/shared` `parseEvaEntityLink`) get the `@` mention chip's card: the new `mentions.getEntityByPath` resolves the path to the repo and entity id, and `DataMentionHoverCardBody` renders it. The repo-by-path rule moved from `githubRepos.getByOwnerAndName` into `findRepoByPath` so both pick the same row.

## Phone: retry a usage-limit failure on another account

Date: 2026-11-15

WHY: When a turn hit the provider's usage limit, the phone showed only the error, so the only way to keep going was to switch accounts and resend by hand, or open the web.

Architectural: the recovery card's logic moved from the web (`usageLimitBanner.ts`, `utils/credentialSourceLabel.ts`, the headroom maths in `UsageLimitAccountOption`) to `@eva/shared/usageLimitRecovery` (`isUsageLimitFailure`, the reset text and subtitle, the title and copy, `usageLimitRetryCandidates`, now generic over the account id type, `usageLimitHeadroom` and `resolveCredentialSourceLabel`); the web banner and row read it. The phone's `src/chat/UsageLimitRecovery.tsx` shows the card above the chat composer while the newest message is a usage-limit failure, for whoever may change the chat's account: one row per other account of the provider with its headroom, and a tap switches the account (the new awaitable `switchAccount` of `useChatModelPick`) and then calls `sessionWorkflow.retryLastTurnWithAccount`.

## Phone: select quick tasks and act on them together

Date: 2026-11-15

WHY: The web Quick Tasks list has a select mode and bulk bar (status, assign, run, labels, project, delete); the phone could only act on one task at a time.

Architectural: "Select" leads a quick task row's long-press menu (`useQuickTaskActions` `onSelect`) and starts select mode: rows show the inbox's checkbox (`QuickTaskRow` `selection`), Android back leaves it, and `QuickTaskBulkBar` (`src/quickTasks/QuickTaskBulk.tsx`, the kit `BulkActionBar`) takes the tab bar's place with Status, Assign and Run, then More: Assign to Me, Add Labels, Move to project and Delete All. Each runs the web's per-task writes (`updateStatus`, `update`, `startExecution`, `assignToProject`, `remove`); Run and Delete ask with the web's words, and Delete offers Undo (`restore`). The status, reviewer, tags and project sheets are the existing `OptionChips` sheets.

## Phone: answer a project's interview and accept or reject its plan

Date: 2026-11-15

WHY: The phone's Plan tab only showed the interview and the plan, and said to answer and approve on the web.

Architectural: `@eva/shared` `projectMeta.ts` gains `parseInterviewQuestion`, `currentInterviewQuestion`, `formatInterviewAnswer` (the web's `Q: … A: …`), and the web's `isInterviewTransitionContent` / `isSpecContent`, which the web utils now re-export. The phone `ProjectPlan` runs the web Plan tab: "Start Interview" (`projectInterviewWorkflow.startInterview`), the open question as the kit `ChoiceQuestion` (with "Other"; the answer goes through `projects.addMessage`, then the next question is asked), "Thinking…" while the workflow runs, "Continue interview" when a run stopped early, and on the generated plan Accept Plan (`projects.startDevelopment`) and Reject with a reason (back to Draft, the interview restarting with `rejectionReason`), as the web. Clear transcript stays on the web.

## Phone: Commit & push, Send for Review and the PR screen from a session's menu

Date: 2026-11-15

WHY: The web session header pushes the sandbox's work (Commit & push), sends the PR for review and opens PRs; the phone menu stopped at Open PR, which went to the browser.

Architectural: `sessionMenuActions` (`@eva/shared`) gains the web's git group after the main block: Commit & push while the awake sandbox has uncommitted files or unpushed commits ("Save to GitHub" in simple view), Open PR, and Send for Review under `canSendSessionForReview`, which moved there from the web (`sessionReadOnly.ts` re-exports it). The phone's `useSessionActions` runs `sandbox.commitAndPushSandbox` (the web's toasts) and `github.createSessionPr` behind the web "Send for Code Review" confirm, and Open PR opens the phone's PR screen (`prNumberFromGithubUrl` in the session's repo), else the browser. The chat reads `sessions.get` for the PR state and git sync; the session rows pass theirs.

## Phone: the agent's secret requests and session proposals in chat

Date: 2026-11-15

WHY: When the agent asked for a secret (`request_env_var`) or proposed a session (`propose_session`), the phone showed nothing, so the agent waited until someone opened the web.

Architectural: `useChatCards` also reads `envVarRequests.listByParent` and `sessionProposals.listByParent` and places them with the panels, as the web `ChatBody`. `src/chat/cards/AgentRequestCards.tsx`: `EnvVarRequestCard` (the key, the reason, a masked field kept out of autofill, "Save securely" through `envVarRequestsActions.save`, "Decline"; the value is never logged or shown; answered, one line) and `SessionProposalCard` ("Suggested for a new session", "New session" through `sessionProposals.start`, "Do it here" through `keepHere`; answered, one line, a started one opening its session).

## Phone: schedule a task's run or a project's build

Date: 2026-11-15

WHY: The web's Run and Build buttons can schedule instead of starting now; the phone could only show "Scheduled for …".

Architectural: `src/ui/ScheduleSheet.tsx` is the web `SchedulePopover` as a bottom sheet on the kit `DateTimeField` (native date and time pickers, so the phone now depends on `@react-native-community/datetimepicker` 9.1.0, the Expo SDK 57 version): it opens on the current schedule or the next full hour, and offers Schedule, or Remove and Update, as the web; a passed time cannot be scheduled. The task overview has a calendar square beside Run Eva (To Do only, as the backend allows) and the "Scheduled for" chip opens the same sheet (`agentTasks.scheduleExecution` / `updateScheduledExecution` / `cancelScheduledExecution`); the project page has one beside Build, whose label shows a scheduled build (`buildWorkflow.scheduleBuild` / `updateScheduledBuild` / `cancelScheduledBuild`).

## Phone: sandbox and git actions on a task's and a project's page

Date: 2026-11-15

WHY: The web task and project pages wake and sleep their sandbox, commit and push, create the PR, resolve conflicts and open the PR; the phone had none of these.

Architectural: The rules moved into `@eva/shared` (`ownedSandboxRules.ts`: `taskCanStartSandbox`, `taskCanResolveConflicts`, `taskCanCreatePr`, `projectCanCreatePr`, `projectCanResolveConflicts`, `PREVIEW_SANDBOX_ALLOWED_STATUSES`); the web's `deriveSandboxFlags`, `getMoreMenuVisibility`, `useTaskDetail` and `projectDetailHelpers` call them. `src/sandbox/OwnedSandboxActions.tsx` drives the owner's own session (`sessions.getOwned`, `ensureOwned` on a first wake, `useSessionSandbox`, `sandbox.commitAndPushSandbox`) and gives `useTaskGitActions` / `useProjectGitActions` rows that lead the "…" sheets (`extraRows` on `useQuickTaskActions` and `useProjectActions`): Wake or Sleep Eva (sleep says to stop Eva first mid-turn), Commit & push, Create PR (`taskWorkflowActions.createTaskPr` / `createProjectPr`), Resolve Conflicts behind the web confirm (`agentTasks.startExecution` "resolve_conflicts" / `projects.resolveProjectConflicts`) and View PR on the phone's PR screen.

## Phone: switch between a session's chats and start a parallel one

Date: 2026-11-15

WHY: The web session has a chat tab bar (parallel chats on one sandbox); the phone opened only the Main chat and could not start another.

Architectural: `src/chat/SessionChatTabs.tsx` is the web `ChatTabsBar` under a session chat's header: one tab per open chat from `sessionChats.listForSession`, Main first, the open one tinted, a working mark from `turns.listSessionChatStatuses`, and "+" (`sessionChats.create` from the open chat; hidden when archived) that opens the new chat in place. A long press offers Rename (`sessionChats.rename`) and, on a parallel chat, Delete behind the web confirm (`sessionChats.remove`, moving to Main when it was open). The phone already opens a session chat by its own id.

## Phone: a failed turn shows as a failure, with Retry

Date: 2026-11-15

WHY: On the phone a failed turn ("Error: …", a usage limit) read as Eva replying with an error in the text, with no way to re-send it.

Architectural: `stripErrorPrefix` and `turnErrorTitle` moved to `@eva/shared` (`turnError.ts`; the provider is named by each app's kit, `getProviderLabel` / `providerLabel`). The phone's `AssistantMessage` takes `failure`: `TurnErrorNotice` (the web's: a destructive 10% panel, warning icon, "This turn failed" or "<Provider> usage limit reached", the provider's own text) in the prose's place, with Retry re-sending the prompt the turn answered and its attachments, set only on a failed turn in a chat that can reply.

## Phone: wake or sleep a session's Eva, and retry a failed wake

Date: 2026-11-15

WHY: The phone could not start or stop a session's sandbox, so a sleeping Eva woke only when a message was sent, and a failed wake showed nowhere.

Architectural: `sandboxDisplayStatus`, the status types, the control labels and `MID_TURN_SLEEP_HINT` moved from the web (`sandboxStatusStyles.ts`, `SleepControlTooltip.tsx`) to `@eva/shared` (`sandboxStatus.ts`). The phone's `src/chat/SandboxControl.tsx` has `useSessionSandbox` (`sessions.get`, `startSandbox` / `stopSandbox`, a pending action as the web `useSandboxLifecycle`), `SandboxControl` in the session chat header (a green play to wake, a red stop to sleep, a spinner while either runs; mid-turn it stays dimmed and says to stop Eva first; in simple view only where nothing else wakes Eva) and `SandboxErrorBanner` under the header ("Eva couldn't wake up", the error, "Try again").

## Phone: chats are marked read, with the "NEW" divider and unread dots

Date: 2026-11-15

WHY: Reading a chat on the phone never told the server, so the web kept its unread dot set, and the phone showed no unread state at all.

Architectural: The web's `useChatReadState` and `findNewMessageIds` moved to `@eva/shared/chatReadState` (the web wrapper adds tab visibility; `findNewMessageIds`' tests now test the shared code). The phone chat calls it while the screen is focused and the app is in front (`useAppActive`, `src/ui/appState.ts`), so opening a chat (or a reply landing while it is open) marks it read for both apps, and draws `NewDivider` (the web `ChatNewDivider`) above the first reply you had not seen. Session rows show the web's unread dot (primary, 6) when `hasUnread` and Eva is not working.

## Phone: notifications open their phone screen, not the browser

Date: 2026-11-15

WHY: A notification without a chat (quick task done, PR merged, a doc or project comment) opened the web in the browser, and a push tap opened only chats, though the phone has screens for tasks, projects, sessions, docs and pull requests.

Architectural: `@eva/shared/appHref` `parseAppHref` reads what a repo link names (`/<owner>/<name>[/<app>]/<section>/<n>`, a project task's `/projects/<p>/<t>/activity`; anchors and queries ignored). `src/push/openLink.ts` `openAppLink` opens a chat, else a PR at once, else `/open` (`app/open/index.tsx`), which looks the item up by number (`getByNumId`) and replaces itself with its phone screen, or says it is gone with "Open on the web"; drafts, automations and settings still open the web. The inbox and push taps both use it, and pushes now carry `href` and `repoId` when there is no chat (older builds read `target` only).

## Phone: "someone is typing" in chats

Date: 2026-11-15

WHY: The web chat composer shows teammates typing; the phone chat did not.

Architectural: The chat dock uses `useTypingPresence` (`src/chat/useTypingPresence.ts`, the react-native presence hook with the `@eva/shared/typingPresence` rules) in the web's room, `chatTypingRoom(parentId)` (the session chat; before a task or project chats, its own target). Each keystroke flags typing and a send stops it; `TypingIndicator` sits above the composer. The dock now mounts once `auth.me` is known, since a presence heartbeat with no user id is rejected.

## Phone: task comment drafts, "someone is typing" and the full emoji search

Date: 2026-11-15

WHY: The phone task overview lacked three things the web task page has: comment and reply drafts kept on the server, the "X is typing" indicator, and reactions beyond the six quick ones.

Architectural: `src/chat/useChatDraftSync.ts` became `useDraftSync(target)` for any `drafts` target (a session chat, a task comment, a reply), with `lastKnown(target)` for a composer that switches targets; the task comment box keeps one draft for a new comment and one per reply, as the web. "Typing" rules moved to `@eva/shared/typingPresence` (`typingUsersFrom`, `typingLabelParts`, `createTypingSignal`, the room ids, `TYPING_TIMEOUT_MS`); the web hook and indicator use them, and the phone adds `@convex-dev/presence` (its react-native hook) with `src/chat/useTypingPresence.ts` and `TypingIndicator`. The comment box mounts once the user is known, since a heartbeat with no user id is rejected. "More reactions" in the reaction menus opens `EmojiPickerSheet`: a typed emoji is offered as is, a word asks `emojiSuggestions.suggest` after 400 ms (as the web picker's search). Phone files touched here are now prettier-formatted (the repo's lint-staged style).

## Web: pages load again (app shell under strict LazyMotion)

Date: 2026-11-15

WHY: Since the move to the `@vvedantb/ui` AppShell (#1327), every web page showed "Something went wrong": the shell's drawer was a `motion.aside` (and its backdrop a `motion.button`), which throws inside Eva's strict `LazyMotion`.

Architectural: `@vvedantb/ui` 0.50.2 (vvedantb/packages#261) renders both as `m.*` in their own `LazyMotion features={domMax}`; web, the chrome extension, `@eva/shared` and `@eva/ui` move to it. The phone moves from the 0.21.0 `next` snapshot to the published `@vvedantb/native-ui` 0.21.0 (same code).

## Phone: zoom into images in the full-screen viewer

Date: 2026-11-15

WHY: An opened image could not be zoomed.

Architectural: `@vvedantb/native-ui` 0.21.0-next-c9211cd (packages#260): under `GestureHandlerProvider` (already in the app root) each `ImageViewer` page pinches up to 5x about the fingers, double-taps to 2.5x on the tapped point and back, and pans while zoomed instead of turning the page.

## Phone: context and plan usage from the chat header

Date: 2026-11-15

WHY: The phone had no way to see a chat's context use or the Claude plan limits, which the web shows in its chat header (the context ring and the plan-usage chip).

Architectural: The rules moved out of the web into `@eva/shared/usageLimits` (the old `usage-limits/_utils.ts`: snapshots, tones, chip summaries, reset labels, the empty copy, and now the refresh failure copy) and `@eva/shared/contextUsage` (`aggregateUsage`, `contextUsedRatio`, `CONTEXT_OVERLOAD_RATIO`, `contextCompactsAutomatically`); the web imports them, keeping only its Tailwind tone classes (`usage-limits/toneClasses.ts`), and its tests now test the shared code. On the phone, `src/chat/UsageSheet.tsx` adds `UsageButton` to `ChatHeader` (the context % and ring, red past 90%; hidden in simple view): a tap refreshes every account (`usageLimitsActions.refreshAll`, failures as toasts) and opens a sheet with the context card (used of the window, the token rows, tokens left, total cost) and plan usage per Claude account (each window's %, bar and reset). The context reads the session chat's logs, a task's, or a project's (`logs.getByProjectId`), as the web. `src/ui/clock.ts` (`useNow`) is a shared ticking clock; `TimeAgo` now uses it.

## Phone: the chat Stop button is red, and the composer lost its extra top padding

Date: 2026-11-15

WHY: The chat composer's Stop was a grey ghost button, where the web's is red, and the composer had extra space above the field.

Architectural: `ComposerHeader` (a component) became `composerHeader()` in `src/chat/ComposerFooter.tsx`, which returns `undefined` when there are no attachments or mention chips. `PromptInput` pads a header row (`pt-1.5`) for any `header` element it gets, and a component that renders null is still an element, so every composer had 6 extra above the field. The chat Stop is `PromptInputButton variant="destructive"` with the outline `IconPlayerStop`, as the web `Button variant="destructive"`.

## Phone: the keyboard no longer covers the composer on New session and the task overview

Date: 2026-11-15

WHY: On New session the composer sits in a centred column, and the keyboard covered it while typing. The composer's own keyboard lift (react-native-keyboard-controller's `KeyboardAvoidingView` inside `PromptInput`) measures itself relative to its parent, not the screen, so in the middle of a column it decided the keyboard did not reach it and added no lift.

Architectural: `app/session/new.tsx` wraps the centred column in the kit `KeyboardAvoidingView` (as New quick task and New project), so the column shrinks to the space above the keyboard and the composer stays centred in it. The task overview (`app/quick-task/[taskId].tsx`) uses react-native-keyboard-controller's `KeyboardAwareScrollView` (`bottomOffset` 16) in place of a `ScrollView` in a `KeyboardAvoidingView`, so the focused comment box, description or title scrolls into view above the keyboard.

## Phone: comments on a task can be replied to, edited, deleted and reacted to

Date: 2026-11-15

WHY: The phone task overview (#1334) could post comments but not take part in a discussion, as the web task page does.

Architectural: `src/quickTasks/TaskDiscussion.tsx`: `ReactableMenu` (a comment's "…" or long press: the six quick reactions, Reply, Edit, Copy text, Delete behind `DeleteCommentDialog`; the description gets reactions, Edit and Copy text by long press), `useCommentMutations` (optimistic delete to the web placeholder and optimistic edit), `CommentMode` with `CommentModeChip` (the comment box at the end replies with a `ReplyQuoteChip` and edits your comment in place, then goes back to a new comment), and `TaskSubscribers` (Subscribe/Subscribed, initials, Manage subscribers sheet). Not here from the web: the full emoji picker and its suggestions, comment drafts on the server, and typing presence.

## Phone: a quick task opens on its overview

Date: 2026-11-15

WHY: On the phone a tap on a quick task went straight to its chat, so there was no way to read or change the description, the fields or the comments, as the web task page does.

Architectural: The task page rules moved from web-only files into `@eva/shared/taskDetail` (who may edit the text, comment threads, the activity timeline and its wording, reaction grouping and the optimistic toggle); the web task detail now imports them, and `_utils/commentThread.ts` is gone. The phone route `app/quick-task/[taskId].tsx` shows the number and title (tap to edit), the description (tap to edit with the mention composer), attachments, the Properties rows (Status, Priority, Code Reviewer, Labels, Project, each a sheet), the Activity timeline with comments, replies and reaction chips, and a comment box; the bottom bar holds Chat and Run Eva and the header "…" is the row menu. Project task rows open it too. The field sheets are split out of the option chips (`PrioritySheet`, `ReviewerSheet`, `TagsSheet`, `ProjectSheet`, `TaskStatusRows`), `FieldGroup`/`FieldRow` moved to `src/ui/FieldRows.tsx`, and `src/ui/TimeAgo.tsx` keeps relative times current. Still to come: replies, comment edit and delete, the reaction picker and subscribers.

## Phone: settings you change stay after the app closes

Date: 2026-11-15

WHY: The web keeps per-person UI choices in localStorage; on the phone they were React state, so a restart reset them (the repo picked for Quick Tasks, folded session groups, and more). An audit of every web localStorage key against the phone found the phone kept only Hide whitespace, the Viewed ticks and the theme.

Architectural: `src/storage/persistedStore.ts` (moved out of `prDiffStore.ts` and shared): `persistedStore`, `persistedIdSet` and `jsonParser` (zod), in secure store on a phone and in localStorage on the web preview build (which has no secure store, so a value used to last one session). Now kept: the repo last picked (`useLastRepoId` / `rememberRepo`: Quick Tasks, Projects, Reviews, Docs, Drafts and Today fall back to it with no `?repo=`, and the new session, quick task and project screens start on it), session group folds (the web's app and linked group open state), quick task status folds, project phase and project task folds, the section each tab last showed, the new-session prompt draft per repo (the web's `new-session-composer`, cleared on send), the changed-files card open state per reply, and the pull request comment order. Not kept, as on the web, where they live in the URL: filters, sort, Active/Archived and Open/Closed.

## Phone: artifacts open live in the chat

Date: 2026-11-15

WHY: On the phone an artifact card only linked to the web viewer. The web shows the artifact in the chat, live: it calls Eva's read-only tools and keeps its own state through the cowork bridge.

Architectural: The phone `ChatArtifactCard` opens the artifact under the card on a tap (480 high, as the web preview) and closes it on the next tap; Fullscreen fills the screen (a modal with its name and Close); the other icon opens the web viewer in the in-app browser. The page is the kit `HtmlView` (native-ui 0.21.0-next-90c9e82, vvedantb/packages#258: `onPageMessage` and a `postMessage` handle). The bridge is shared: `@eva/shared/artifactBridge` (a subpath, so the backend's root import stays React-free) holds the shim (`buildArtifactSrcDoc`, which posts through `window.ReactNativeWebView` on the phone and takes JSON-text replies), `loadArtifactHtml`, and `useArtifactBridge(artifactId, target)`; the web `ArtifactFrame` uses it too, and its own copies are deleted. Metro keeps `convex` a singleton, so the shared hook sees the app's `ConvexProvider`.

## Phone: composer drafts are saved, as on the web

Date: 2026-11-15

WHY: Text typed in a phone chat's composer was lost when the app closed or the chat was left. The web keeps it on the server (`drafts`), so it also follows the person between devices.

Architectural: `useChatDraftSync(chat)` (session chats, as the web; quick tasks and projects have no draft row) reads `drafts.getForTarget` and returns `save` and `pull`. `save` is the composer's new `onChange` (`useMentionComposer` calls it after the person's edits only: typing, picks, chip removal, stash restore, the clear after a send), coalesced to one `drafts.set` in flight per chat, and skipped until the saved draft has loaded so opening a chat never overwrites it; an empty composer deletes the row. `pull(composer)` runs in render when the saved draft changes (its first load, or a write from the web) and applies it with `composer.load` by the web's rules: `decideDraftPull` and `rememberOwnSave` move from `apps/web` to `@eva/shared` (web unchanged). No effects. Also adds the `_generativeUi/catalog` entry #1321 left out of `api.d.ts`.

## Phone: agent cards stay with their turn in long chats

Date: 2026-11-15

WHY: In a long chat, a turn's agent report ("Feedback sent"), artifacts, panels and pages fell to the bottom of the chat on the phone. The phone transcript loads in pages (newest 30 first), but `useChatCards` told `placeChatUiPanels` the whole history was loaded, so a card whose turn was above the first page went to the "after everything" list.

Architectural: `useChatCards` takes `hasOlderHistory` (the screen passes `transcript.hasOlder`) and gives it to both placements, as the web `ChatBody`. A card above the loaded rows now waits for its page and then sits under its turn. Reproduced and checked in the phone web export with 40 extra messages on the seeded mock chat: before, the cards sat at the bottom; after, nothing at the bottom, and the cards appear under their reply once the older page loads.

## Web shell comes from the kit `AppShell`

Date: 2026-11-14

WHY: Eva carried its own sidebar shell (rail width, tile size, panel layout, resize, mobile drawer). The kit now owns these, so every app has the same shell and Eva has no shell CSS of its own.

Architectural: `Sidebar` renders `AppShell.Root` (`scroll="document"`, `resizable`) with the kit `Sidebar` parts (`Root`, `MobileHeader`, `Backdrop`, `Aside`, `Rail`, `RailItem`, `Panel`, `ResizeHandle`); `@vvedantb/ui` is 0.50.0. The rail is 3.5rem and the tiles are the kit `railTileClass`; Eva adds only its themed active tone. The shell breakpoint moves from `lg` (1024px) to the kit `md` (768px): the drawer, the mobile header and the Ave launcher follow. The stored width moves once from `eva-sidebar-width` (rail plus panel) to `eva-sidebar-panel-width` (panel only) in `shellLayout.ts`; the total widths stay 240 / 320 / 480. Routes take their height from `SHELL_VIEWPORT_ROUTE_CLASS` / `SHELL_DOCUMENT_ROUTE_CLASS`. Deleted: `useSidebarContentOffset`, `useMobileSidebarDrawer`, `SidebarResizeHandle`, the width state in `SidebarContext`. Differences from before: the drawer closes on the kit drag rule (offset or velocity, no projected velocity), the keyboard resize step is 16px, a double-click on the handle resets the width, and the mobile header has the kit look.

## Phone: chats show attachments, agent media, generative UI panels and turn outputs

Date: 2026-11-14

WHY: The phone chat drew none of the rich content the web chat draws: user attachments, the agent's screenshots and recordings, `render_ui` panels and `render_html` pages, and artifact and agent-report cards. Revives #1292 on today's main.

Architectural: The screen's own `ChatMessageRow` (on the paged transcript) gains the content: a user bubble shows `messageAttachments` (`UserAttachments`: 96 pt thumbs into the native-ui `ImageViewer`, text chips into a read-only sheet, as the web); a reply shows `message.media` (`AgentMedia`: `InlineVideo` from `@vvedantb/native-ui/video` with `expo-video`, and `ImageGallery`). `useChatCards` reads `chatUi.listByParent`, `chatHtml.listByParent` and `artifacts.listForChat` once per chat and places them, and the agent reports, with `placeChatUiPanels` (moved to `@eva/shared`; the web imports it from there). Panels use the kit `GenerativeUiPanel` (`@vvedantb/native-ui/generative-ui`, on json-render's React Native renderer) behind the web's UI and Text tabs; links open in the in-app browser, code copies with `copyText`, and a type this version does not know is a card that opens the chat on the web. Pages use `HtmlView` (`react-native-webview`), mounted once the row is seen. A panel button replies through `chats.send`, as the composer. The attachment labels and `splitAgentMedia` move to `@eva/shared` (web unchanged). The PR's own 419-line panel renderer is not used: the kit replaces it. New native modules `expo-video` and `react-native-webview`: a new APK.

## Chat panels (`render_ui`) render from the kits

Date: 2026-11-14

WHY: The panel catalog and renderers now live in the shared kits (vvedantb/packages#236, #240), so any app, and Eva's phone, draws the same panels from one definition.

Architectural: Web `ChatBody` renders `GenerativeUiPanel` from `@vvedantb/ui/generative-ui`; Eva's renderer, layout, content and tone files are deleted (`ChatUiPanelTabs` and panel placement stay). The backend builds `chatUiCatalog` in `_generativeUi/catalog.ts` from `generativeUiCatalogDefinition` (`@vvedantb/server/generative-ui`) on json-render's React schema, so the `"use node"` composer loads no React; the request schema uses the kit tones and styles, and tests use `parseGenerativeUiSpec`. `@eva/shared/generativeUi` is deleted. Every package pins `@vvedantb/ui` 0.47.0-next-7db4f19 and `@vvedantb/server` 0.16.0-next-bf81bce, so the web app loads one copy.

## Eva moves to zod 4

Date: 2026-11-14

WHY: The shared kits (`@vvedantb/server`, `@vvedantb/ui`, `@vvedantb/native-ui`) publish zod 4 types, and json-render (chat panels) requires zod 4. On zod 3, the kit's generative UI props resolved to `unknown` in Eva, so Eva could not use the kit panels.

Architectural: web, backend, shared and mobile pin zod 4.6.7. Four code changes: `_evaConfig/config.ts` uses `.prefault({})` (zod 4's `.default` no longer runs the inner schema, so inner defaults would be lost) and the two-argument `z.record`; `jsonValue` is `z.ZodType<JsonValue, JsonValue>` (zod 4's second type argument is the input, `unknown` by default); `search_tools` uses zod's own `z.toJSONSchema` (`toolInputJsonSchema`), and `zod-to-json-schema` is removed; the mobile `exit-info` module checks `lastExit` is a function and parses its result (zod 4 removed `z.function().args().returns()`). Follow-up: about 20 deprecated `.strict()` / `.passthrough()` calls still work and can move to `z.strictObject` / `z.looseObject`.

## Phone: crashes report themselves to Axiom

Date: 2026-11-14

WHY: A phone crash was known only when the user pasted Copy details from the crash dialog. Now each crash reaches the logs on the next signed-in launch, with no action from the user.

Architectural: New mutation `crashReports.report` (phone-only, listed in `check-shared-backend.mjs`). It has no table: for a signed-in user it writes one `[phone-crash] {json}` console.error line, which Convex's log stream sends to Axiom (dataset `eva`, `data.message`). Signed-out calls are dropped, so it is not an open log sink. `useReportLastCrash` (in `SignedInEffects`) sends the crash `LastCrashDialog` shows (JS fatal, native crash, ANR or Java crash) once, keyed by `eva.lastCrashReported`; a failed send retries on the next launch. The report holds the error and stack only, never chat content. The dialog and Copy details stay.

## Quick tasks: a chat push opens the task PR

Date: 2026-11-13

WHY: A quick task worked on only through its sandbox chat never got a PR. The chat pushed `eva/task-<id>`, but only a task run opened the task PR, and the agent was told Eva would open it.

Architectural: `_sessions/workflow.ts` calls the new `taskWorkflowActions.ensureTaskChatPr` after a quick-task turn pushes or commits onto a published branch. It and the manual `createTaskPr` share `openTaskPr`. The PR is ready in code_review and draft otherwise; a cancelled task is skipped, and a branch level with base is ignored. `getTaskPrCreationData.existingPrUrl` now reads the live PR on the task branch, not any run's old `prUrl`, so commits after a merge get a fresh PR. Project chats still rely on a task run for the project PR.
## Phone: fix the Sessions/Projects tab crash; Java crashes show their stack

Date: 2026-11-13

WHY: Changing tab closed the app on the compiled native-ui kit (0.1.56–0.1.60). The stack from 0.1.60: "[Worklets] Tried to synchronously call a Remote Function" in `tabIndicator`'s `useAnimatedStyle`. React Compiler hoisted the arrow functions inside that worklet (`box => box.x`) to module-level `_temp` functions, which the UI thread cannot call.

Architectural: The kit's `build-dist.mjs` puts compiler-hoisted `_temp` functions back inline inside worklet callbacks (vvedantb/packages#226); `apps/mobile` pins `@vvedantb/native-ui@0.18.2-next-10a55be`, compiled again. `ExitInfoModule.kt` installs a default uncaught-exception handler that writes the Java stack to `filesDir/eva-java-crash.txt`, since Android keeps no trace for `REASON_CRASH`; `lastExit` returns it, and the dialog shows the exception line.
## Web, backend and mobile: adopt more shared exports from @vvedantb packages

Date: 2026-11-13

WHY: More code was still copied into eva from the shared packages. One source means one place to fix and one behaviour across apps. This round bumps `@vvedantb/ui` to `^0.43.0`, `@vvedantb/server` to `^0.15.0` and `@vvedantb/config` to `^0.5.0`.

Architectural: `apps/web` adopts the stale-deploy reload from `@vvedantb/ui`; the local `staleDeployReload.ts`, `isChunkLoadError.ts` and their tests are deleted, and `main.tsx` plus `DeploymentErrorFallback.tsx` use the package. In the backend, `convex/_shared/hmac.ts` re-exports `hmacSha256Hex` from `@vvedantb/server` (a shim keeps the Convex module registry stable), `convex/http.ts` uses the package `verifyGithubStyleSignature` for the GitHub webhook, and `convex/functions.ts` builds the six auth function wrappers from `createAuthFunctions`. On mobile, `plugins/withReleaseSigning.js` wraps the package `withReleaseSigning` (eva's signing marker kept, because `scripts/build-android-release.sh` greps for it), and `metro.config.js` uses `defineExpoMetroConfig`; all four resolver singletons are kept. The `@vvedantb/native-ui` git pin is unchanged. Not adopted: the Convex admin API client (the JWT-authed runAsUser stack must stay, and listTables output differs); the shared oxlint plugin (the package `no-source-text-in-tests` widens the test-file match, and the other rules drop eva's curated CLAUDE.md messages).

## Phone: native crashes show on the next launch too

Date: 2026-11-13

WHY: The Sessions/Projects tab crash is native: it closes the app before JavaScript can save anything (0.1.56's JS crash report never showed). Android 11+ keeps why the last process ended, with the tombstone for a native crash.

Architectural: Local Expo module `apps/mobile/modules/exit-info` (`ExitInfoModule.kt`, autolinked) returns the last `ApplicationExitInfo`: reason, time, description and the trace (ANR text, or the printable parts of a native tombstone: signal, abort message, libraries, functions; 6 KB max). `loadLastCrash` shows a crash, native crash or ANR newer than the last one shown (`eva.lastExitSeen`) in the same "Eva closed after an error" dialog, with Copy details.

## Web and backend: adopt shared pieces from @vvedantb packages

Date: 2026-11-13

WHY: Several components and helpers were copied into eva from the shared packages. One source means one place to fix and one behaviour across apps.

Architectural: `apps/web` moves `@vvedantb/server` from `^0.10.0` to `^0.14.0`, so web and backend share one installed copy. The local `ConfettiBurst` is deleted; `PrMergeConfetti` imports `ConfettiBurst` from `@vvedantb/ui` (the package adds an optional `colors` prop; the rest is the same). `SettingsPage` now wraps the kit `SettingsPage`, giving it eva's `PageWrapper` as the `layout`. In the backend, `_auth/currentUser.ts` builds `userAuth` with `createClerkUserAuth<DataModel>()`, and `getCurrentUserId`, `requireCurrentUserId` and `auth.ts`'s `getUserByClerkId` delegate to it; `userAuth` stays in the leaf `currentUser.ts` to keep the module-cycle workaround. `ensureUserExists` is unchanged: the package `ensureUser` has no verified-email rebind. `textGen.ts` uses `FLEX_GATEWAY_PROVIDER_OPTIONS` from `@vvedantb/server/ai` for both title calls.

## Web: the `scrollbar` utility comes from @vvedantb/ui

Date: 2026-11-13

WHY: vibot and eva each had their own copy of the same thin-scrollbar utility. One shared copy stops the two from drifting.

Architectural: `apps/web/src/globals.css` imports `@vvedantb/ui/tokens/css/scrollbar.css` and the local `@utility scrollbar` block is gone. The shared utility reads `--scrollbar-base`; eva sets it to `rgb(var(--muted-foreground))` for `:root`, `.dark` and `.dark.neutral`, so the colours stay the same. `@vvedantb/ui` moves from the `0.41.1-next` pre-release pin to `^0.42.0` in web, chrome-extension, `packages/shared` and `packages/ui`.

## Phone: back to the uncompiled native-ui while the tab crash is found

Date: 2026-11-13

WHY: Since 0.1.53 the Sessions and Projects tabs close the app at once (native crash, no JS error). The app code changed only in action handlers since 0.1.51; the kit became React Compiler output. The kit's Android e2e opens every component those tabs use, compiled, without a crash, so this build tells the two apart.

Architectural: `apps/mobile` pins native-ui to `github:vvedantb/packages#a6d0b28` again (0.1.51's kit: the same source, not compiled; it still has the hand-written `TabBarItem` memo). Web keeps the compiled `@vvedantb/ui`.

## Phone: an error that closes the app is shown on the next launch

Date: 2026-11-13

WHY: The Sessions and Projects tabs close the release app with no message, and a phone has no log the user can read. Render errors already show "Could not start Eva"; this covers fatal errors outside render (handlers, effects, Reanimated worklets).

Architectural: `installUnhandledRejectionLogging` takes `onFatal`: on a fatal error it saves `{ name, message, stack }` (`src/logging/lastCrash.ts`, expo-secure-store, under 1.8 KB) for at most 1 s, then calls the previous handler as before. The next launch shows `LastCrashDialog` (the `UpdateDialog` pattern): the error, and Copy details (version, time, message, 15 stack lines).

## Web and phone: both kits from npm, compiled with React Compiler

Date: 2026-11-13

WHY: `@vvedantb/ui` now ships React Compiler output like native-ui (packages#213, #217). Eva web compiled the ui source itself; the package build does it once, for Eva and vmem.

Architectural: Every Eva package pins `@vvedantb/ui@0.41.1-next-14f3254` (web, @eva/ui, shared, chrome-extension; one version, so `dedupe` keeps one copy and `UiConfigProvider` context reaches it; it includes 0.41.0's shared chat and page pieces). The phone pins `@vvedantb/native-ui@0.18.1-next-5a5ab8f`. `vite.config.ts` excludes all of node_modules from the React Compiler; `vitest.config.ts` inlines `@vvedantb/ui` (its compiled `.js` imports CSS, which Node cannot load). The ui package no longer has `"use client"`. Measured on the web build at 4× CPU: chat composer 145 → 86 renders per keystroke; home and sessions pages render the same DOM.

## Web: Five UI pieces move to @vvedantb/ui

Date: 2026-11-13

WHY: These components and the scroll-fade CSS were copied into eva from the shared kit. One source means one place to fix and one look across apps (packages#211, `@vvedantb/ui` 0.41.0).

Architectural: `ChatLastTurn`, `ChatDayDivider` and `CollapsibleUserMessageBody` now import from `@vvedantb/ui`; the local copies are deleted and their importers repointed. The divider uses the kit's default day/time labels, which match eva's `formatDayLabel` / `formatClockTime` output exactly, so no formatter is passed. The collapsible keeps its look: the kit's default `hover:bg-surface-secondary/55` resolves to `rgb(var(--muted))` under eva's `compat-shadcn-rgb.css`, the same colour as eva's old `hover:bg-muted/55`. `PageHeader` and `PageWrapper` become thin adapters over the kit's `PageHeaderBar` / `PageWrapper`, fixing eva's layout (`titleLayout="inline"`, `headerColumns="three-at-md"`, `animated`, and `bodyScrollbar` for the wrapper); the adapter keeps eva's prop surface and import paths, and `PageWrapper` calls `usePageTitleSync` itself. `globals.css` drops the local scroll-fade blocks and imports `@vvedantb/ui/tokens/css/scroll-fade.css`; with no `--scroll-fade-max` set the masks stay uncapped as before. Needs the dependency bump to 0.41.0 to resolve.

## Web: Archive uses chats.archive, as the phone does

Date: 2026-11-13

WHY: One backend for both apps (#1302): each action the phone and web share runs one server function.

Architectural: `useArchiveSession` calls `chats.archive` instead of `sessions.stopSandbox` then `sessions.archive`. Same helpers and checks; the stop and the archive now run in one mutation, and the sandbox check reads the server's `sandboxId`, not the client's. `check-shared-backend` no longer allows `chats.archive` as phone-only. Send, stop, model and start stay on the web's own path for now: they carry optimistic updates and more arguments than `chats.*` takes.

## Phone: native-ui from npm, compiled with React Compiler

Date: 2026-11-13

WHY: Expo never runs React Compiler on node_modules, so every kit component re-rendered its whole subtree. The kit now compiles itself and publishes compiled code (packages#210), as React's library guidance says.

Architectural: `apps/mobile` installs `@vvedantb/native-ui` from npm (`0.18.0-next-54cc54a`, the `next` pre-release published on each kit merge) instead of a git pin, because a git pin installs source and runs no build. The kit's `dist` keeps JSX, so NativeWind's `className` transform still applies. Measured on the phone web build at 4× CPU: chat composer 68 → 55 renders per keystroke, tab switch 195 → 165 renders; screens are byte-identical. To take a kit change, pin the new `next` version.

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

## Phone: calls chats.* (needs the prod Convex deploy first)

Date: 2026-11-13

WHY: Step 1 of one backend for both apps: the phone stops calling `mobile.*` and calls the neutral `chats.*` (#1302).

Architectural: Every `api.mobile.*` call in apps/mobile is now `api.chats.*` (`get`, `send`, `setModel`, `stop`, `start`, `archive`). Ship only after prod Convex has `chats.ts`, or the new APK's chats fail.

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
