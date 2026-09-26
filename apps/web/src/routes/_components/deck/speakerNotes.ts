/** Presenter-only notes, keyed by `DeckSlide.id`. Never rendered on the stage. */
const NOTES: Record<string, string> = {
  // ---------------------------------------------------------------------------
  // Friday session deck
  // ---------------------------------------------------------------------------
  "01-title": `Open on the promise: in the next twenty minutes you will see what Eva changed this summer, and what it means for your work.
Detail: the logo breathes on an eight-second loop and the title lands word by word, so let it settle before speaking. Say up front that every number comes from the project's own records, so questions can be answered rather than deflected.
Figures: the window is 12 June to 10 September 2026, taken from Eva's git history.
Next: Start with the size of it, in four numbers.`,

  "02-numbers": `Four numbers for the size of the three months, landed before anything is explained.
Detail: the figures count up over about two seconds; do not talk across them. The line total is additions, not a net figure. A bundle is this deck's plain word for a pull request; a change is one commit on the main branch.
Figures: 2,081 changes shipped, 769 release notes written, 260,754 lines added, 98 bundles merged, about 23 changes a day including weekends. Source: Eva's git history, 12 June to 10 September 2026.
Next: And the surprising part is where all of that was done.`,

  "03-cloud": `None of this was built on a laptop, and that is what makes the rest of the deck possible.
→ Step 1: the laptop lifts into the cloud. Every change was written, tested and shipped from a browser tab, inside Eva's own cloud workspaces.
→ Step 2: the three counters and the source line. Say each label in full.
Detail: authorship comes from the author field on each change, so a change Eva wrote and a person merged still counts as Eva's.
Figures: 346 changes authored by Eva; 33 bundles finished alone since August; 10 in August against 23 in 1 to 10 September.
Next: Those cloud workspaces used to be slow to start, and that one wait shaped how the whole tool felt.`,

  "04-sessions": `A session is one running conversation about one codebase, and over the summer it gained the tools of a real workspace.
→ Step 1: July. The workspace fills out: a queue, a browser, files, tabs and plan mode.
→ Step 2: August. Being told what is happening: notifications, mobile, limits, archiving.
→ Step 3: September. Recovering by itself rather than stalling.
Detail: twelve milestones is too many to read aloud; name the three themes and let the axis carry the detail.
Figures: dates are when each change landed in Eva's main branch, 9 July to 10 September 2026.
Next: The longer the job, the more it helps to write things down, so documents now live inside Eva.`,

  "05-simple-mode": `Most people opening Eva are not engineers, so the answer was to remove machinery rather than add explanation.
→ Step 1: the picker becomes the five-step slider and the caption lands. The trimmed list was still the advanced surface, which is why it became one control.
Detail: the picker on the right is the real shipped component. Simple Mode is an optional setting, not a separate product; it hides files, consoles, settings and meters and leaves the conversation. Choosing a model went from a long list to one slider.
Figures: Simple Mode landed 14 August 2026; the slider replaced the list on 24 August 2026.
Next: The other way to save effort is to never explain the same job twice.`,

  "06-automerge": `One click from a person, and everything after it is automatic.
→ Step 1: the pipeline runs through to production. The only human step is marking the work ready; the Grok bot does the rest.
→ Step 2: the nightly routines card. These open their own bundles overnight, so the morning starts with work to review rather than work to start.
Detail: always-on checks were retired in August because the agent had already checked its own work in the sandbox, so running them again added waiting, not safety.
Figures: auto-merge landed 3 September 2026. Six nightly routines: critical bugs, test coverage, docs, code structure, code quality and an 08:00 standup.
Next: Those overnight routines are the next story: work that starts itself.`,

  "07-sandbox": `Starting a workspace used to be a coffee break; now it is under a second.
→ Step 1: both lanes race, then the closing line arrives after the slow lane finishes. Let the four seconds run in silence; the wait is the argument.
Detail: nothing was given up in the move. The same workspace still has a terminal, live preview, desktop and snapshots.
Figures: about 40 seconds before on Daytona against under one second now on Vercel Sandbox, more than 40 times faster. Timings are the product owner's own measurements before and after the move; the migration landed 6 to 8 July 2026.
Next: So that is where the work happens. Now, how do you actually ask for some?`,

  "08-more": `A deliberate flood: eight more things from the same three months, none with its own slide.
Detail: do not read the grid. Pick two the room will care about and move on. If asked: suggested edits, where a document change waits for someone to accept it; Claude's built-in skills in the same slash picker; previews that stay put after you leave a session; rebindable keyboard shortcuts; rich link previews, where Figma, Linear, Sentry and PostHog links become chips; editing files in the browser; and reading sibling repos, so Eva can look across your other codebases. The 94% is the loading shimmer's main-thread cost after the September animation work; it has its own slide in the annual deck.
Figures: suggestion mode 10 June 2026; Claude's skills 22 August 2026; lasting previews 14 August 2026; shortcuts 6 August 2026. All eight shipped June to September 2026.
Next: Which leaves the last step of the loop: checking the work.`,

  "09-team": `People who do not write code raised the work themselves.
→ Step 1: Matt, referral portal, since May. The AQP list map, the referral dashboard, and referral tabs with cancellation reasons.
→ Step 2: Zuza, design and admin, since March, the heaviest non-developer user. User management, admin KPI dashboards, and polish on cards, badges and tables.
→ Step 3: Kezia, referral portal and domiciliary care, since May. Exports and audit trails, broker and borough filters, and automated decline and expiry emails.
→ Step 4: Vedant, product, since January, and the total underneath. The domiciliary care and nursing home SUPA archives, and eProcurement fixes.
Detail: say roles, months and projects aloud. The shape never changes: a colleague described the need, Eva built it, they reviewed it.
Figures: Matt 27, Zuza 237, Kezia 39, Vedant 912; 303 pieces of work raised by colleagues. Items created in Eva, 11 January to 16 September 2026, including those later cancelled.
Next: what changed for the organisation as a whole.`,

  "10-code-reviews": `Reading every change by hand was the slowest step, so it moved to the model and people kept the part that matters.
→ Step 1: the strike draws through all five old habits and the old lane fades back.
→ Step 2: the two statements. The model reads the whole change, finds ordinary bugs, suggests the fix and runs the checks. People still hold data structure changes, deletions and migrations, payments, permissions and access, and anything hard to roll back.
→ Step 3: the closing line. This is the sentence to leave in the room.
Detail: the resting state is the old way: every line read by a person, comments back and forth, days waiting for a reviewer, small bugs still slipping through, and a one-line change treated like a database migration. The mechanics are the nightly critical bugs and code quality routines, and auto-merge.
Next: If most changes can be undone, the way we work starts to change.`,

  "11-whats-next": `The constraint has moved: Eva now finishes work faster than people can check it in.
→ Step 1: the review segment glows and the 43 card arrives. That is more finished work waiting than the 29 already merged.
→ Step 2: the four pipeline steps. The fix is not to review faster; it is to give CarePulse the pipeline Eva already runs on itself, the same auto-merge and nightly routines shown earlier.
Detail: cancelled work is shown rather than hidden, because a queue that quietly drops items is not a queue.
Figures: 141 quick tasks: 29 done, 43 waiting in code review, 14 in business check, 25 not started, 30 cancelled. CarePulse quick tasks created in Eva, 1 June to 10 September 2026, by status on 11 September 2026.
Next: The first step on that pipeline is letting the model do the first read.`,

  "12-future": `Three shifts to expect, each already true inside Eva rather than predicted.
→ Step 1: more automations. Routine work runs on a schedule or a trigger, and people set direction rather than tasks.
→ Step 2: mistakes become cheap. When a change can be remade in minutes, being wrong stops being expensive. Try more, worry less.
→ Step 3: everything in sandboxes, managed from chat, and the fleet lights up. Eva's own development already works this way, and the Grok bot merges its changes. Next, the same for all our work.
Detail: say plainly that this is a direction of travel, not a plan with dates. Nothing here is a commitment.
Next: That raises the obvious question: what is left for the developers?`,

  "13-developer": `The job did not disappear when the model started writing the code; it moved.
→ Step 1: the bracket lands over Sweeper and Maintainer. That blend, the Gardener, is the work that is growing.
→ Step 2: what gardening means: lints, types, checks and written rules the model reads before it starts.
→ Step 3: the CarePulse line. The biggest single job is finishing the v3 migration, because it removes most of what trips the model up today.
Detail: the resting state is the five archetypes. Prototyper: ideas that mostly never ship. Builder: prototype into product. Sweeper: simplifies and removes. Grower: iterates towards fit. Maintainer: keeps a mature system safe and fast.
Figures: archetypes from Boris Cherny, X, 28 June 2026; eight months without hand-written code, Fortune Brainstorm Tech, reported 11 June 2026.
Next: Others build tools like this too, so why build our own?`,

  "14-personal": `Cloud coding agents are now a category; ours is not the cleverest, but it is the one we can bend.
→ Step 1: what Eva has that the others do not: our repositories, data and rules, new features in an afternoon by anyone on the team, and the freedom to delete anything unused.
→ Step 2: the demo switches into Simple Mode, the same product with the machinery removed.
→ Step 3: the Notion line. Notion began as notes and kept adding features most people never open; software that serves everyone ends up fitting no one.
Detail: name the six competitors without disparaging them; they are all good, they simply do not know CarePulse, our team or our rules.
Figures: comparison reflects our own use, September 2026. Product names are their owners' trademarks.
Next: So what should you do with any of this on Monday?`,

  "15-closing": `Close on the one fact that carries the whole argument: this deck was built the way everything else was.
Detail: hold here rather than rushing to questions. If the room takes one thing away, it is that the tool was good enough to build its own presentation. Do not add new material; the numbers have already been made.
Next: Thank the room and open the floor for questions.`,

  "friday-b01-ask": `This is the tool in use: a sentence in, working software out.
→ Step 1: the cloud workspace. Eva builds it somewhere that is not anyone's laptop, so nothing is installed and nothing can break locally.
→ Step 2: the live preview. A non-technical colleague can judge the work themselves rather than read a summary. You try it, ask for changes, and the loop runs again.
→ Step 3: the closing line. Leave it in the room.
Detail: the ask is typed in plain English into an ordinary chat box. There is no form, ticket, queue or handover. If asked what happens to the sentence: Eva reads the codebase, writes the change, runs the checks, and only then offers it back.
Next: That middle step, trying it yourself, is worth a closer look.`,

  "friday-b02-preview": `A preview you can click through is the difference between trusting a summary and seeing the thing.
→ Step 1: the frame walks phone, tablet, then desktop, with rotate and screenshot buttons. Anyone can check a change on the device colleagues use, without owning it.
→ Step 2: the note pin drops. Click any element and leave a note attached to it, so feedback points at the thing rather than describing where it is.
Detail: a preview outlives the conversation that made it, so someone with ten minutes in the afternoon can still use it. None of this is merged: it is a proposal to walk through before anyone agrees to it.
Figures: click-to-comment and the three widths, 21 July 2026; device toolbar with rotate and screenshot, 25 August 2026; previews surviving a session being left, 14 August 2026.
Next: Not every ask is the same size, and Eva has three ways to take one.`,

  "friday-b03-inbox": `Work that needs a person used to be scattered across email, chat and tabs; now there is one list.
→ Step 1: a row selects and the linked page appears beside it. Nothing opens in a new tab, and the whole list runs on the arrow keys.
→ Step 2: the browser tab and its count. A two-note chime plays even in a background tab, and the unread count sits on the tab itself, so you can see whether anything is waiting without switching.
Detail: a row can be marked unread again, because reading something is not the same as dealing with it.
Figures: two-pane inbox with in-place preview and arrow-key navigation, 20 August 2026; chime and unread count on the tab, 1 August 2026; mark unread again, 29 August 2026.
Next: All of this was built for people who are not engineers, so we also took things away.`,

  "friday-b04-documents": `Plans, notes and specifications live in Eva, and several people can be in the same one at once.
→ Step 1: the comment pin anchors to a line. Comments attach to the text they are about and can be resolved, so a document does not collect stale argument.
→ Step 2: the version list. Every edit is kept, so you can see what the document said before and who changed it.
Detail: the resting state is two people typing in one paragraph at once. Suggestion mode proposes an edit for someone else to accept, so a plan can be reviewed without being overwritten. Eva reads these documents while it works, so writing the plan down is how you brief it.
Figures: collaborative editing, anchored comments, suggestion mode and version history all landed 10 June 2026.
Next: The most useful thing to write down is a plan, and getting one is now easy.`,

  "friday-b05-plan": `The fastest way to make a big job safe is to ask for the plan first, and asking is now all it takes.
→ Step 1: the control disappears and a sentence takes its place. The plan tab appears on its own once a plan exists; nothing to switch on or off.
Detail: the resting state is the old mode dropdown above the prompt box, which people had to find and remember to turn off. Removing it is the pattern behind most of this deck: fewer controls, more plain English. It is far cheaper to argue with a paragraph than with a finished feature.
Figures: the plan mode dropdown was removed on 23 August 2026 and replaced by simply asking.
Next: When the plan turns out to be several jobs, it becomes a project.`,

  "friday-b06-projects": `When a job is really several jobs, you need to see its shape, and the roadmap shows it.
→ Step 1: the bars fill. Each bar is one job, and how far it has filled is how far along it is, so the whole piece of work reads at a glance.
→ Step 2: the zoom changes and the bars re-scale. Quarter, month or week, whether you are looking at the year or this afternoon.
Detail: there is a jump to today, and the roadmap can be dragged through time, so a long project stays navigable. Jobs run in the order laid out, so a later job can wait on an earlier one.
Figures: the projects timeline was rebuilt as a roadmap with completion bars, quarter, month and week zoom, a jump to today and drag-to-pan, 17 June 2026.
Next: With several jobs running, you need one place where the finished ones come back to you.`,

  "friday-b07-three-ways": `One engine, three sizes of ask, and you choose by the size of the job, not by who is asking.
→ Step 1: a session. A running conversation about one codebase that stays open as long as the work does, so you can iterate and come back.
→ Step 2: a project. Several jobs in order, laid out on a roadmap.
→ Step 3: the closing line. Nobody has to learn three products.
Detail: the resting state is a quick task: one job, start to finish, no conversation expected. Describe it once and the finished work comes back for review. If asked which to use: start with a quick task and move up only when the job is bigger than one ask.
Next: Sessions are where most of the summer's changes landed.`,

  "friday-b08-reviews": `Checking the work no longer means leaving for another tool.
→ Step 1: a comment lands on the change. A bundle of changes can be read, commented on and acted on here, laid out the way the room knows from GitHub.
→ Step 2: the search overlay. One search reaches every codebase, team, project, task, session, document and artifact.
Detail: keyboard shortcuts are rebindable, so heavy users can set it up the way their hands expect. The whole loop (ask, build, preview, review, merge) now happens in one browser tab.
Figures: reviewing and answering bundles inside Eva, 3 August 2026; search across everything, 24 July 2026; rebindable shortcuts, 6 August 2026.
Next: Reviewing is now easy, but there is more of it than we can keep up with.`,

  "friday-b09-automations": `Some work does not need a person to start it, so it now starts itself overnight.
→ Step 1: the dial sweeps from three to five in the morning and the five routines light up in order. They are ready-made; installing one takes a click, not retyping instructions.
→ Step 2: the review cards land. The routines open their own bundles of changes, so the morning starts with finished work to look at.
Detail: the Automations Hub is a shelf of routines anyone on a codebase can install; before it, each person rewrote the same instruction. The five are staggered so they do not compete for the same machines. Times are UTC.
Figures: the Automations Hub landed 6 August 2026. The five routines (critical bugs, test coverage, docs, code structure, code-quality review) were added 21 August 2026, staggered 03:00 to 05:00 UTC.
Next: One more routine runs at eight, and it is written for you.`,

  "friday-b10-standup": `Every weekday morning a short summary of the day before is written for you, in plain English.
→ Step 1: the summary writes itself into the card. About 150 words, readable by someone who has never opened the codebase.
→ Step 2: the Today and Yesterday timeline slides in. That is the /today page, where the summaries stack up day by day.
Detail: the routine is read-only; it writes about what happened and cannot change anything. The first version read like an engineer's log, so the next day its instructions banned file names and jargon. The words on the card show the shape of a summary, not a real one.
Figures: the 08:00 UTC weekday summary started 20 August 2026 and was rewritten for non-technical readers on 21 August 2026.
Next: That is a lot running by itself, so the fair question is what happens when it goes wrong.`,

  "friday-b11-skills": `A skill is a command someone has already written down, so nobody explains the same job twice.
→ Step 1: the picker opens out of the composer and the commands stagger in. There is nothing to remember: type a slash and choose.
Detail: skills are turned on per codebase from Settings, with no change to the code, and then appear for everyone in it. Claude's built-in skills joined the same picker a fortnight later. The six on screen are real commands from this codebase.
Figures: Eva's own skills landed 6 August 2026; Claude's built-in skills joined the picker on 22 August 2026.
Next: So far, you have done the asking. From here, Eva starts to work on its own.`,

  "friday-b12-ave": `One permanent chat sits above all the others and keeps track of them for you.
→ Step 1: the lines draw out to six running agents. From this one chat you can list them, look inside, message or stop any of them, across every codebase, and it is told when each finishes.
→ Step 2: two report back with a tick. You do not go looking; finished work comes to you.
Detail: it started as a master chat that could also write code, and that was the wrong shape: a supervisor that keeps editing stops supervising. Six days later it was renamed Manager Ave and limited to supervising.
Figures: the master chat landed 18 August 2026; it became Manager Ave, restricted to supervising, on 24 August 2026.
Next: Once the work is finished, getting it live now takes one click.`,

  "friday-b13-reliability": `Things still go wrong; what changed is how long you are left not knowing.
→ Step 1: the hanging spinner gives up. A dead agent used to show Working for up to two hours. A watchdog now closes the turn within minutes and keeps what was written.
→ Step 2: the retry card. A turn that stalls with nothing written tries once more on its own before anyone is told.
→ Step 3: the usage-limit card. The chat says a limit was reached, when it resets, and offers a teammate's shared account in one click.
Detail: let the first card sit before clicking; the spinner is the argument.
Figures: watchdog 30 July 2026; stalled empty turns retry once, 26 August 2026; usage-limit card and account switch 4 September 2026 for sessions, extended to quick tasks and projects 10 September 2026.
Next: And you do not have to be at a desk to see any of it.`,

  "friday-b14-mobile": `Work gets raised when you think of it, which is usually not at a desk.
→ Step 1: the desktop frame folds into a phone and the content reflows into one pane. Pinch-zoom is back, and controls sit where a thumb can reach.
Detail: there is no app to install. This is the same web app in a phone browser; a separate mobile app was abandoned and deleted in May 2026. Every route was audited, not just a few, and a second pass followed a fortnight later.
Figures: the responsive audit landed 17 August 2026, with a second pass on 4 September 2026. The target was every route at 640 pixels wide and below.
Next: Some of what Eva makes is not software at all, just something to look at.`,

  "friday-b15-artifacts": `Not everything an agent makes belongs in a codebase; some of it just needs to be looked at.
→ Step 1: the saved page becomes a hosted page with a link anyone on the team can open.
→ Step 2: the tabs arrive on the chat. Artifacts and Documents sit beside the conversation, so what was made is next to where it was asked for.
Detail: useful for a one-off report, a comparison table or a small interactive view that would otherwise be pasted into a message and lost. For three months the pages existed but were awkward to find again, until the tabs came.
Figures: hosted artifacts landed 17 June 2026; every chat gained Artifacts and Documents tabs on 12 September 2026.
Next: There is plenty more that never earned its own slide.`,

  "friday-b16-close": `Close on three things to do on Monday, not on a summary of the deck.
→ Step 1: raise one quick task. One sentence describing what you want is enough to start.
→ Step 2: open the inbox. Finished work is waiting there rather than needing to be chased.
→ Step 3: review what is waiting, then the closing line lands. Say it and stop.
Detail: do not add new material here. If anyone asks where to start, the answer is the smallest annoying thing they already know about. The gradient behind the list moves slowly on purpose; let it run while the room reads.
Next: One last thing about how this deck itself was made.`,

  // ---------------------------------------------------------------------------
  // Annual CDM deck
  // ---------------------------------------------------------------------------
  "a01-title": `Open on the span, not the product: an empty repository in January became how we build software.
Detail: an assessor reads this deck as well as a room watching it, so say early that every claim is evidenced from the repository or Eva's own records. Signpost the shape: the origin, who uses it, how the platform is built, the craft behind it and the people, then the year ahead and the framework map on slide 39.
Figures: the window is 11 January to 16 September 2026.
Next: it starts on a single evening in January.`,

  "a02-origin": `The recap: eight months as five moments, so the story is held in one picture before it is counted.
→ Step 1: first use. The first session on 24 January and the first quick task on 1 February, two weeks from empty to usable.
→ Step 2: work moves to the cloud in July, and in August Eva starts opening its own work.
→ Step 3: the totals land. This is the evidence base for everything that follows.
Detail: these dates come from Eva's own records of the first session and quick task created; the week-one dates are when the code landed, which is why they differ.
Figures: empty repository 11 January 2026; 4,732 changes shipped and 1,348 sets of release notes, from Eva's own records and the project's history to 16 September 2026.
Next: the total is one number; here is what sits beside it.`,

  "a03-numbers": `The total is one number; the rest of the ledger shows the tool was used, not just built.
→ Step 1: the secondary card. This answers whether anyone else uses it: sixteen accounts, nineteen automations and 504 automation runs.
Detail: the headline row is output, the secondary card is use. The closing rate line is deliberately unglamorous: nineteen changes a day sustained for eight months matters more than any single peak.
Figures: 4,732 changes, 887 quick tasks raised, 367 working sessions, 1,348 sets of release notes; 16 people with accounts, 19 automations, 504 automation runs, 107 documents. Eva's own records and project history, 11 January to 16 September 2026.
Next: those sixteen accounts did not arrive at once, and the timing matters.`,

  "a04-adoption": `Adoption was not announced; it followed the tool becoming easy enough to use.
→ Step 1: July onward lights and the earlier months dim. The step change is July, when work moved to the cloud.
→ Step 2: the three figures count up. Read them as sentences: 13 people beyond the developer have raised work in Eva; 390 pieces of work were raised against CarePulse; 225 sessions ended in a bundle of changes ready to review. The tool left one person's hands.
Detail: June is genuinely zero, not missing data, and the footnote says so. Volunteer the gap, because that is what makes the rest credible.
Figures: sessions per month in 2026: Jan 13, Feb 11, Mar 31, Apr 28, May 9, Jun 0, Jul 75, Aug 109, Sep 91. 13 people, 390 pieces of work and 225 sessions ready to review, to 16 September 2026.
Next: four of the people behind those numbers, and what they built.`,

  "a06-impact": `Three things changed, and none of them is typing speed.
→ Step 1: who can ask. A request, a queue and a developer became anyone describing what they need in their own words.
→ Step 2: where work runs. One laptop at a time became cloud workspaces running many jobs at once.
→ Step 3: what a person does, and the two counts beside it. Writing every line became directing the work and guarding what is hard to undo.
Detail: the rows carry no category label, so name each as it lands. Eva was built to remove the wait between someone needing something and it being built. Dwell on the third row: it is the change that makes the others safe.
Figures: 13 people other than the developer have raised work in Eva; 390 pieces of that work were for CarePulse. Eva's own records to 16 September 2026.
Next: what that looks like for the person using it.`,

  "a07-how": `The whole loop in one pass, so nobody has to guess what using the tool looks like.
→ Step 1: the flow line runs and the browser tab line lands. No install, no ticket, no handover.
→ Step 2: the four ways to ask, as names only. A session is a running conversation; a quick task is one job start to finish; a project is several jobs in order; an automation is a job that runs itself. The choice is about the size of the job, not the type of user.
Detail: the cards are headings only, so describe each stage. You describe it in plain English in a chat. Eva builds it in its own cloud workspace, with a live preview you can click through. You try it, ask for changes, then it goes live. The preview matters most to non-technical colleagues: it is the first point they can judge the work themselves.
Next: behind that loop sits the first platform decision: never depend on one supplier.`,

  "a09-design": `Technical design happened on paper first, and replacing the engine every workspace runs on is the proof.
→ Step 1: the six phases. A spike, a provider-neutral contract with no consumer, the old provider moved behind it, the new provider, the switch-over, then the old code deleted.
→ Step 2: the restore figure, which the spike was written to test. An explicit go or no-go; the answer was go.
→ Step 3: the options put down. Seven abandoned plans are kept in writing, and two rejected animation options carry the measurement that ruled them out.
Detail: interactive terminal, desktop and named volumes were deliberately deferred, and that was said at the time.
Figures: 6 to 29 July 2026, switch-over 25 July, old code removed 29 July; a 6GB workspace restores in about 0.33 seconds against minutes before; 11% worse compositor time, five times more painting. Rejected options 5 September 2026.
Framework: owns technical design; understands trade-offs; breaks down large problems.
Next: design reduces faults but does not remove them.`,

  "a10-debugging": `Three production faults, each taken to a cause and pinned by a test, not patched and forgotten.
→ Step 1: 2 September. Messages unanswered for two hours. Three defects: a liveness check matching its own wrapper, a kill leaving an orphan holding a file lock, and a launch racing its own ready marker. Each has a named contract test.
→ Step 2: 24 August. A three-minute wait, though resume took eight seconds. A prewarm on a stale model setting held the launch lease; losers now wait, re-probe and respawn.
→ Step 3: the closing figure, found by searching live traffic, not from a report.
Detail: the resting state is 10 September. Under CHIPS, partitioned and unpartitioned cookies of one name are two cookies; the browser sent both, so signing out left you signed in. The fix deletes the unpartitioned one first.
Figures: 65 respawn events against 146 daemon launches in 24 hours. Release notes, August to September 2026.
Framework: debugs production issues without flailing.
Next: the same habit of searching live traffic found a larger problem.`,

  "a11-craft": `The skill built outside programming this year is measurement; the bars are its output, not its point.
→ Step 1: the habits behind the numbers. Live traffic is searchable, decisions are written down, there is one design system, and accessibility defects get fixed.
→ Step 2: the honest gap. A Lighthouse harness exists but no scores are recorded in the release notes: set up, not yet a habit.
Detail: defend the method, not the reduction. A fresh tab per run, tracing over timeline, compositor and viz categories, busy time merged per thread, interleaved rounds, medians of three, and visual parity proved by diffing paused frames at 0.9998. The write-up states its own limit: the test machine has no GPU, so only main-thread figures transfer.
Figures: shimmer 32.6 to 1.9 ms/s, repaints 240 to 0 per second, spinner recalculations 420 to 49 per second, a realistic chat mix 64 to 45.5 ms/s. 5 September 2026.
Framework: a major skill outside programming.
Next: the same method, applied to the waits everyone pays.`,

  "a12-quality": `The standard is enforced by the machine, because a standard that relies on remembering is not a standard.
→ Step 1: the written rules. Unsafe type escapes and certain React patterns are banned, parsing happens at the edge, and every change needs a type check and release notes.
→ Step 2: the closing line. A permanently red test is a defect in the test, because a suite people stop reading protects nothing.
Detail: the contract tests matter most: they fail when two parts of the system drift apart, and one asserts the three chat surfaces stay unified. The four hand-written lint rules exist only where an off-the-shelf rule could not express the standard: no hand-rolled narrowing, no bare JSON.parse, no double casts, no value blocks in try.
Figures: 303 test files across app, backend and shared components; 79 contract tests; 46 nightly runs that back-filled tests; 4 custom rules. Repository at 16 September 2026.
Framework: improves the development process.
Next: why enforcement matters: the size of what it now protects.`,

  "a13-people": `Every incident here was found by a colleague, not a test, and each changed how the work is done.
→ Step 1: September. Two of a colleague's messages were dropped because a fix landed on sessions only. The rule that chat is one surface is now written into the repository.
→ Step 2: August. Design tooling did not survive a workspace resume, found in a colleague's own session.
→ Step 3: the cards recede and the closing line lands. Each was fixed, pinned by a test and written down.
Detail: the resting state is the August stall, two hours on Working with a colleague's messages unanswered: a zombie runner holding the spawn lock while the watchdog extended its own deadline. Standards are written for people and agents: repository rules, guides for the interface, data layer and security, ready-made commands, release notes on every change.
Figures: release notes, August and September 2026.
Framework: mentors and onboards, through written standards others can work to.
Next: most of those colleagues are not engineers, and that shaped the product.`,

  "a14-users": `Most people opening Eva are not engineers, and almost every decision on this slide follows from that.
→ Step 1: the three chips. Every screen made usable on a phone across two audits; shortcuts made visible and rebindable; and pages saying pick something from the sidebar removed, because on a phone the sidebar is a closed drawer.
→ Step 2: the closing line. None of this made the tool cleverer.
Detail: the rows in order. Simple Mode hid reviews, differences, token meters and consoles, leaving the conversation and a preview; the model list became a five-step slider because the trimmed list was still the advanced surface; PRD was renamed Plan because that is what people meant; the daily summary was rewritten for a non-technical reader, with a hard ban on file names and hashes.
Figures: Simple Mode 14 August 2026, slider 24 August 2026, mobile audits August and September 2026.
Framework: business and user empathy.
Next: two lessons from the year, in the project's own words.`,

  "a08-ahead": `The constraint has moved from building to deciding, and the next year is about the steps either side of the build.
→ Step 1: the first strand lights and the queue figure arrives: finished work waiting to be checked in. Marking work ready should be the last human step, as it already is for Eva itself.
→ Step 2: the closing question. How fast can we build it becomes how fast can we decide.
Detail: the three strands are headings only. Automate the release. Guard the irreversible, so people concentrate on data, permissions and anything hard to undo. Software that fits us: tools shaped around how we work rather than the other way round. None of the three is a dated commitment.
Figures: 176 pieces of finished work waiting to be checked in, against 455 already finished. Quick task status across all 887 raised in Eva, at 16 September 2026.
Framework: identifies work to do.
Next: how all of this maps to the framework.`,

  "a15-framework": `This is the map an assessor reads: nine capabilities, each evidenced by a slide already shown.
→ Step 1: the ticks land. Technical design, trade-offs and breaking down large problems: slide 23, with 26 and 34. Debugging: slides 24 and 25. A skill beyond coding: slide 28, measurement. Improves the process: slides 29 to 32. Mentors and onboards: slide 35. Business and user empathy: slide 36. Identifies work to do: slides 27 and 38.
→ Step 2: the thin evidence. Page scores are not routine though the harness exists; there is no on-call rota or incident grading, as this is a one-person project; and there has been no work alongside a designer or user researcher.
→ Step 3: the totals. Volunteer the gaps before they are asked for, then close on the record.
Figures: 4,732 changes and 1,348 sets of release notes, all written at the time. Repository and Eva's own records, 11 January to 16 September 2026.
Next: one last fact about how this deck was made.`,

  "annual-b01-day-one": `The data layer the product still runs on was settled on the first day, not migrated to later.
→ Step 1: the three commits stack in. The first commit, then the schema for projects and tasks, then the queries and mutations behind it.
→ Step 2: the closing line. Nothing that follows required that decision to be unpicked.
Detail: the hashes are shown because anyone can check them. The same schema, extended many times, still stores every session, quick task and project. If pressed on wording: the first commit was at 16:36 and the schema commit at 20:15 the same evening, about three and a half hours apart, so "day one" is exact.
Figures: 5468954a6 Initial commit, 317b85cd5 projects and tasks schema, 5467d4ca2 Convex queries and mutations, all on 11 January 2026.
Next: within four days, the two ideas the product still rests on were in place.`,

  "annual-b02-first-week": `Both ideas the product is built from arrived inside the first week.
→ Step 1: quick tasks land on 12 January, one day after the first commit. One prompt, one result, start to finish.
→ Step 2: sessions land on 14 January, and the closing line follows. A session is a running conversation about one codebase, and everything since has built on those two shapes.
Detail: projects and automations came later, but both are built out of quick tasks and sessions rather than alongside them. The point is stability of concept: eight months on, nobody has needed a third primitive.
Figures: quick tasks appear in the code on 12 January 2026 and sessions on 14 January 2026, within four days of the first commit on 11 January 2026.
Next: before walking through the year, here is its shape.`,

  "annual-b03-q1": `The first quarter put a usable surface in front of people, and it was the heaviest building of the year.
→ Step 1: the quarter total counts up. 1,758 changes in three months, before anyone outside the project was using it.
→ Step 2: the three months appear and March is picked out. 1,070 changes is the biggest month of the year, and most of the interface came from it.
→ Step 3: the streaming figure. Live output was written to the database 60 to 120 times during a single run; moving it to its own small table cut that to two writes.
Detail: the streaming change is the first fix in the deck that was measured rather than felt. It is also why long sessions stopped slowing the whole workspace down.
Figures: January 280, February 408, March 1,070, totalling 1,758 changes shipped. Live streaming moved to its own table on 5 February 2026.
Next: building the surface was half the job; it then had to load.`,

  "annual-b04-load": `Building the surface was half the job; it then had to arrive quickly on someone else's machine.
→ Step 1: both bars collapse and the figures count down. The main bundle fell from 1,355 kB to 273 kB, and the heaviest screen from 1,048 kB to 84 kB.
→ Step 2: the closing line. Opening the app now downloads a fifth as much, which is all a non-technical room needs from the numbers.
Detail: the work was automatic code splitting in the router, lazy-loaded code blocks, and removing a cyclic dependency. Nothing was taken out of the product: the same screens load when they are opened rather than all at once.
Figures: main bundle 1,355 kB to 273 kB, a fall of 80%; heaviest screen 1,048 kB to 84 kB, a fall of 92%. Bundle optimisation, 31 March 2026.
Next: after the peak came the quietest quarter, and it was not a slow one.`,

  "annual-b05-q2": `The quietest quarter was not a slow one; it was the quarter the tool stopped being single-player.
→ Step 1: documents. Comments anchored to a passage, suggestion mode and version history, all on the same day.
→ Step 2: the projects roadmap, where several pieces of work in order become one thing a person can see.
→ Step 3: Testing Arena opened to everyone, so trying a change stopped being a developer-only act.
Detail: 943 changes is the lowest quarter of the year, and that is the point: the months went on making existing work solid and shared. If asked whether momentum was lost, the next chapter was the biggest of the three.
Figures: April 377, May 336, June 230, totalling 943 changes shipped. Documents with comments, suggestions and version history 10 June 2026; projects roadmap 17 June 2026; Testing Arena opened to everyone 17 June 2026.
Next: a short pause, because at this point the project was not yet called Eva.`,

  "annual-b06-q3": `The last quarter was about dependability: the same product, made to survive being relied on.
→ Step 1: July, 1,052 changes, almost all of it the sandbox cutover. The engine every workspace runs on was replaced, and slide 23 takes that apart phase by phase.
→ Step 2: August, 877 changes. Durable turns, so a long run survives an interruption instead of stalling; security work; and the design system the interface now sits on.
→ Step 3: September, 102 changes to the 16th. Multi-repo sessions, so one conversation can span several codebases, and decision models for classifying work at scale.
Detail: September is a part month, so do not read the drop as a slowdown. Nothing here adds a new thing to do; it makes the existing things safe to depend on.
Figures: July 1,052, August 877, September 102, totalling 2,031 changes shipped, to 16 September 2026.
Next: the whole story on one line, before we look at who used it.`,

  "annual-b07-volume": `The year was not steady, and its shape is the map for the three chapters that follow.
→ Step 1: March and July stay lit and the line names them. March was the surface being built; July was the cutover that moved every workspace to a new engine.
→ Step 2: the total counts up. 4,732 changes across nine months, roughly nineteen a day including weekends.
Detail: the troughs matter as much as the peaks. June is the low point of the consolidation quarter, and September only looks thin because it stops on the 16th. Say the part-month caveat aloud rather than leaving it to the footnote.
Figures: Jan 280, Feb 408, Mar 1,070, Apr 377, May 336, Jun 230, Jul 1,052, Aug 877, Sep 102. Total 4,732 changes shipped, September to the 16th.
Next: the first peak, and what it built.`,

  "annual-b08-rename": `A breath between chapters: the project people now call Eva spent its first five months as Conductor.
→ Step 1: Conductor dissolves into Eva. Say only that the name changed when the repository moved.
→ Step 2: the two dates. The rename on 3 June and the internal packages catching up on 24 July.
Detail: keep this short; it is a pause, not an argument. If it earns a sentence, the six-week gap was deliberate: renaming every package is a wide, risky change, better done on its own than mixed into feature work.
Figures: renamed from Conductor to Eva when the repository moved on 3 June 2026; internal packages renamed from @conductor/* to @eva/* on 24 July 2026.
Next: the last chapter, where the product was made safe to depend on.`,

  "annual-d01-security": `Signing in was never the problem; knowing whose data you were seeing once inside was, so everything built was audited.
→ Step 1: the guards land and the rail draws. Checks moved into shared helpers, so a new surface inherits the boundary.
→ Step 2: the two counts fall. Production dependency warnings went from 2 critical and 48 high to 0 critical and 2 high.
→ Step 3: the closing line. The boundary was exercised against real production data, not only against tests.
Detail: slide 21 designed security into a new interface; this hardens the old ones. The audit found ownership checked unevenly across codebases, sessions, tasks, teams, workspaces, snapshots and integrations. Sign-in was hardened too: explicit consent, stronger proof-key exchange, registered return addresses, client-bound refresh tokens.
Figures: 2 critical and 48 high down to 0 critical and 2 high. Audit 8 August 2026; verified against production data 19 August 2026.
Framework: identifies work to do; understands trade-offs.
Next: all of this rests on measurement, the skill built most this year outside programming.`,

  "annual-d02-design-system": `A shared component library stops every new screen being a fresh argument about how things should look.
→ Step 1: the two figures count up. 110 files and 18,197 lines, the size of what every screen is assembled from.
→ Step 2: the closing line. Consistency is now the starting condition rather than a clean-up job.
Detail: the conventions are written down, not folklore: surfaces separated by tone rather than decorative lines, one shadow system, and motion on shared tokens. Two moves made it possible: Tailwind v4 across the web app and the browser extension on 5 August 2026, and a single icon library on 2 August 2026. The tiles are the library in miniature: four colours, four surface tones and four of the shapes every screen uses.
Figures: 110 files and 18,197 lines in the shared component library. Measured 23 September 2026.
Framework: improves the development process.
Next: the same discipline, applied to how things move.`,

  "annual-d03-motion": `Ten motion changes landed on one day, and their point was to stop motion being a matter of taste.
→ Step 1: all ten samples restart together on one duration, one curve and one rest. Let the grid run; the synchronisation is the argument, so stop talking while it happens.
→ Step 2: the closing line. Motion is a house style now, not an opinion held per component.
Detail: the ten changes were house transition defaults, tokenised durations, gesture physics, focus rings and drag sensors, all on 7 August 2026. Before that, every component picked its own timing, which is what the resting state shows. The slide is meant to be watched rather than read, so do not narrate the tiles.
Figures: ten motion changes, 7 August 2026.
Framework: improves the development process, with a standard others follow without asking.
Next: a house style only lasts if a machine enforces it.`,

  "annual-d04-frontend-perf": `Waiting is the tax everyone pays on every change, so three separate waits were measured and cut.
→ Step 1: the local build falls from 28 to 2.6 seconds: the wait between making a change and seeing it.
→ Step 2: the landing page's first download falls from 516 kB to 362 kB: the wait a visitor pays.
→ Step 3: the code checker's false warnings fall from 8,862 to none. A checker nobody reads is a checker that is not running.
Detail: the icon and first-load savings sit in the footnote, because three falling figures is the limit a room will hold.
Figures: build 28 s to 2.6 s and 8,862 false warnings to 0, both 20 August 2026; landing page 516 kB to 362 kB, 8 August 2026; 489 kB of icons and a further 1.2 MB off the first load, 4 August 2026.
Framework: improves the development process.
Next: speed is one kind of polish; looking the same everywhere is another.`,

  "annual-d05-scale": `The size of what now exists, in units a non-engineer can weigh rather than lines of code.
→ Step 1: the two supporting figures. 2,151 TypeScript files, and 18,197 lines in the shared component library alone.
→ Step 2: the closing line. Eight months, one codebase, one person directing the work.
Detail: 363 screens usually lands hardest, because most people can picture what one screen costs to build by hand. 71 data tables is the shape of the business the product models, and 976 backend functions sit behind them. The release notes matter differently: written at the time, they make every other figure checkable.
Figures: 2,936 tracked files, 2,151 TypeScript files, 363 screens, 71 data tables, 976 backend functions, 18,197 lines in the shared component library, 9,854 lines of written release notes. Measured 23 September 2026.
Framework: breaks down large problems, with the whole scope held by one owner.
Next: at this size, what you stop matters as much as what you build.`,

  "annual-d06-abandoned": `Deciding not to do something is design work, and it only counts if it is written down.
→ Step 1: the framework evaluation. A formal assessment on 17 July 2026, with the verdict recorded verbatim as do not adopt.
→ Step 2: unifying design sessions, cancelled on 29 July 2026 and replaced by a mode that was itself removed on 23 August: the same question answered, reversed, and reversed again.
→ Step 3: the closing line. Written plans stop the argument being re-run from memory.
Detail: the resting state is the plan to move background workers to another host, dropped because the new architecture removed the problem: the cheapest cancellation. The third card is the honest one: volunteering a double reversal is what makes the other two credible. All seven cancelled plans are kept in full.
Figures: framework evaluation 17 July 2026; design sessions cancelled 29 July 2026, replacement mode removed 23 August 2026; seven cancelled plans in total.
Framework: understands trade-offs.
Next: many of the right calls came from listening to colleagues.`,

  "annual-d07-lessons": `Two sentences from the project's own notes, and both say the difficulty lives in the system, not the model.
→ Step 1: cross-fade to the second quote. Autonomy is an infrastructure decision: how far an agent can be trusted to run is set by what surrounds it, not by which model is chosen.
→ Step 2: both sit together and the closing line lands. Read them once, then stop talking.
Detail: dwell on the first quote, because it is the opposite of the usual conversation. Much of this deck is evidence for it: durable turns, the security boundary, the enforced quality bar. None of those are about the model. Both lines are verbatim from notes written during the year, not composed for this deck.
Figures: from the project's own written notes.
Next: if the system is the hard part, here is where the system goes next.`,

  "annual-d08-durable": `Most reports of the tool being stuck were one structural fault, and it was fixed once rather than patched repeatedly.
→ Step 1: the same turn runs again, is interrupted at the same point, survives and finishes: the lifecycle is durable and fenced, not held in one process's memory.
→ Step 2: the closing line. Interrupted stopped meaning lost.
Detail: the resting state is what used to happen: a turn breaks part-way and the interface sits on Working with nothing behind it. Fencing is the part that matters: a superseded turn cannot come back and write over the one that replaced it. The debugging slide chased this symptom case by case; this addresses the cause once.
Figures: one durable lifecycle for every turn, 19 August 2026; remaining gaps closed 23 August 2026.
Framework: owns technical design, fixing the class of fault, not each instance.
Next: reliability is one kind of trust; the other is who can see what.`,

  // ---------------------------------------------------------------------------
  // Intro to Eva deck
  // ---------------------------------------------------------------------------
  "annual-c01-providers": `Nothing here depends on one supplier staying cheap, fast or available.
→ Step 1: the model count. Four providers, twenty-one models, one picker inside Eva.
→ Step 2: the point. If a supplier raises its prices, falls behind or goes down, the work moves to another without anyone changing how they work.
Detail: the columns are the shipped catalogue, not a wish list; legacy entries kept only so old sessions still load are excluded. Each provider needs an account behind it, which comes three slides on. A session remembers its last model, so nobody chooses every time.
Figures: Claude 7, Codex 4, OpenCode 4, Cursor 6, 21 models in all. Repository catalogue at 16 September 2026.
Next: several suppliers only help if each connection is dependable.`,

  "annual-c02-sdks": `Every provider was moved off reading text out of a terminal and onto its own official connection.
→ Step 1: the three connections convert, one at a time: Cursor on 5 August, Codex on 12 August, OpenCode on 14 August.
→ Step 2: the old command-line runner is struck out, removed on 18 August, so no half-abandoned path is left to rot.
Detail: the old method started each provider as a command-line program and read its printed output, so any change to that output broke Eva silently. The official connections report events, errors and completion directly, so failures now surface as failures instead of silence. The line to quote: the last command-line subprocess is gone.
Figures: Cursor 5 August 2026, Codex 12 August 2026, OpenCode 14 August 2026; the old runner deleted 18 August 2026.
Next: with dependable connections, a job can switch supplier part-way through.`,

  "annual-c03-handoff": `A choice of supplier is worth little if changing your mind means starting again.
→ Step 1: the conversation card lifts off Claude and lands on Cursor, word for word, and a handed-over badge appears on it.
Detail: each provider keeps its own private record of the conversation inside the workspace, so before this a mid-conversation switch started the new provider blind. Replies are now stamped with the model that produced them, and on a switch only the turns the incoming provider has not seen are passed across, capped in size and clearly marked. The badge on the handover turn keeps the transcript honest about who wrote what.
Figures: cross-provider handoffs landed 24 August 2026.
Next: every supplier needs an account behind it, and accounts cost money.`,

  "annual-c04-accounts": `Provider capacity is bought per person, so the useful question is whether it can be shared.
→ Step 1: each colleague attaches their own provider account, so their work spends their own allowance.
→ Step 2: one account is shared with the team, a second person draws from it, and the closing line lands.
Detail: an account is attached once and then stays with that person's sessions, tasks and projects. Sharing is deliberate and controlled by the owner, not automatic: a new session does not quietly pick up a teammate's account. Switching account mid-conversation keeps the conversation and rotates the running process, so the next reply is charged to the right place.
Figures: per-user provider accounts 17 July 2026; sharing an account with the team 7 August 2026.
Next: people are not the only ones who use Eva.`,

  "annual-c05-mcp": `Eva is not only something people open; other tools and agents can drive it.
→ Step 1: reading. Anything connected can list the work in flight and see what each piece is doing.
→ Step 2: acting. It can send a message into an existing session, task or project, start and stop workspaces, and run code across several tools in one pass.
→ Step 3: the newest ring. Typed judgements, a calibrated score or category applied the same way every time, and interactive panels drawn straight into a chat.
Detail: this is how one agent supervises others, as Manager Ave does. For a stakeholder, Eva plugs into what the organisation already runs rather than being a closed box.
Figures: chat into an existing session, task or project 27 August 2026; drive sandboxes 28 August 2026; run code across tools 3 September 2026; typed judgements 17 September 2026; interactive panels in chat 21 September 2026.
Next: letting other tools in is only safe if the locks are designed in.`,

  "annual-c06-mcp-security": `Opening Eva to other tools is only safe if who is asking is enforced, not assumed, so the locks were designed in.
→ Step 1: the three lifetimes drain. A sign-in code lasts five minutes, a working pass one hour, and a renewal thirty days.
→ Step 2: the two gates close. Every request is scoped to one person, and that scope is checked twice: at the interface and again at the data layer.
Detail: sign-in uses the standard flow with proof-key exchange, so an intercepted code is useless without the matching secret. Two independent secrets, one for the passes and one for the data layer, mean one leak does not compromise the other. Every request re-checks the user still exists; secret comparisons are constant-time; errors give nothing away; endpoints are rate limited. Slide 27 audits what came before.
Figures: authorisation code 5 minutes, access token 1 hour, refresh token 30 days. Security model documented in the repository.
Next: the other thing that has to be controlled is cost.`,

  "annual-c07-sandbox-economics": `Every piece of work gets its own cloud workspace, so they must not quietly pile up.
→ Step 1: while the work is alive its snapshot never expires, and only the most recent one is kept.
→ Step 2: the hours count down and the bar drains. When a session or task ends, the workspace is deleted after a 48-hour grace period; reopening the work inside that window cancels the deletion.
→ Step 3: the beam circles the calendar. A weekly sweep clears anything the ordinary path missed.
Detail: short-lived workspaces expire after a day. This is partly why the provider changed: the old provider's snapshots could not capture running processes or a seeded database, so every start re-ran the setup. Deleting a workspace now purges its snapshots rather than trusting the provider to cascade.
Figures: one snapshot retained per workspace, 48-hour grace period, weekly sweep, one-day expiry for short-lived workspaces. Snapshot lifecycle documented in the repository.
Next: that is what was built; now, how the decisions were made, starting with the biggest.`,

  "annual-c08-occ": `A slow product looked like a capacity problem and was the system arguing with itself.
→ Step 1: the symptom. Three days of live traffic: almost all the load was writes colliding, not expensive reads.
→ Step 2: the cause. Two parts of the system were writing the same row at the same moment, so each made the other retry.
→ Step 3: the fix, in two figures. Lease renewals fell from about 6.7 writes a second while streaming to roughly one a minute, and live cursor writes from 20 a second to at most 6.7.
Detail: the last slide was things breaking; this is things being slow. Renewals now write only on a phase change or when less than half the lease remains; cursor writes are throttled and ignore movement too small to see.
Figures: retries over three days: presence heartbeats 30, streaming touches 24, lease renewals 18, stall watchdog 17. Fixes landed 24 August 2026.
Framework: debugs production issues; understands trade-offs.
Next: beneath many stuck reports sat one structural fault, fixed once.`,

  "intro-01-title": `Welcome, and the one line to open on: Eva is a platform for AI agents that actually ship code.
Detail: say what it is not before what it is. Not a chatbot that suggests diffs, and not an autocomplete. These are agents that clone your repo, run your tests, and open real pull requests. The word lands out of a blur, so let it settle before speaking.`,

  "intro-02-gap": `The gap between an AI demo and real work comes down to three things, and the rest of the deck answers each one.
Detail: context, because the agent needs your codebase, your style and your CI. Execution, because it needs somewhere to run commands rather than only generate text. Review, because you need to see what it did rather than trust a summary. The slide names the symptom: context scattered across chat windows, browser tabs and terminal sessions.`,

  "intro-03-quick-tasks": `Quick tasks are the simplest unit of work in Eva: one prompt, one result.
Detail: the examples to give are fix this bug, add a test, update this copy. Eva spins up an isolated sandbox, does the work and shows you the result. No boilerplate and no pull request dance — just a diff you can merge. The three bullets arrive one at a time, so pace the sentence to each.`,

  "intro-04-sessions": `A session is a longer-lived development environment that you and the agent share.
Detail: you describe what you are building and Eva sets up a sandbox with your app running. You iterate together, and you can see the preview, the logs and the terminal. The line to land it is that it is like pairing with someone who never gets tired.`,

  "intro-05-projects": `Projects are for larger features that span several sessions or tasks.
Detail: a product spec, broken into phases and tracked over time. Eva reads your documents, plans the work and executes it piece by piece.`,

  "intro-06-documents": `Documents are first class in Eva, not an attachment bolted on the side.
Detail: specs, notes and context all live here, and Eva reads them while working, so the agent knows what you are building. No copy-pasting into prompts — write it once.`,

  "intro-07-prs": `When Eva finishes a task it opens a pull request, which is the point where the work becomes ordinary again.
Detail: you review it like any other pull request — code, tests and CI status. No magic and no hidden prompts, just code you can read.`,

  "intro-08-stack": `Nothing in the stack is exotic, which is deliberate: the interesting part is what is built on it.
Detail: React and Vite for the frontend, Convex for the backend because it is real-time and type-safe, Vercel sandboxes for isolated execution, Clerk for authentication and a GitHub App for repository access. Close on the licence: it is MIT open source.`,

  "intro-09-github": `Eva connects straight to your GitHub repositories, on your terms.
Detail: it clones the code, respects your .gitignore and pushes to branches. You control what it can access.`,

  "intro-10-sandboxes": `Sandboxes are ephemeral virtual machines, and that is what makes the whole thing safe to try.
Detail: each task or session gets its own isolated environment. Your code runs, your tests run and your app runs, then it is gone.`,

  "intro-11-insight": `The sentence the deck exists to deliver: agents need execution, not just generation.
Detail: they need to run npm install, run your build and see whether the tests pass. That is the difference between here is a diff and here is working code. The slide frames the same point as context being the expensive part, which is what Eva preserves across tasks, sessions and projects.`,

  "intro-12-demo": `Hand over to the live demo here rather than reading the slide.
Detail: what the room will see is Eva taking a quick task, spinning up a sandbox, making the change, running the tests and opening a pull request — all from a one-line description.`,

  "intro-13-closing": `Thank the room, then leave the two addresses on screen.
Detail: Eva is live at eva.vedantb.com and the code is at github.com/vvedantb/eva. It is MIT open source, so anyone in the room can run it themselves.`,
};

/** Notes for a slide id, or "" when the slide needs none. */
export function getSpeakerNotes(slideId: string): string {
  return NOTES[slideId] ?? "";
}
