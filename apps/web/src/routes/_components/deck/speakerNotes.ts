/** Presenter-only notes, keyed by `DeckSlide.id`. Never rendered on the stage. */
const NOTES: Record<string, string> = {
  // ---------------------------------------------------------------------------
  // Friday session deck
  // ---------------------------------------------------------------------------
  "01-title": `Set the frame before any feature: this is a report on one codebase over three months, not a demo.
Detail: the logo breathes on an eight-second loop and the title lands word by word, so let it settle before speaking. Say up front that every number in the deck comes from the project's own records, so questions can be answered rather than deflected.
Figures: the window is 12 June to 10 September 2026, taken from Eva's git history.`,

  "02-numbers": `The size of the three months in four numbers, landed before anything is explained.
Detail: the figures count themselves up over about two seconds; do not talk across them. The line total is additions, as the label says, not a net figure. A bundle is this deck's plain word for a pull request. If asked what a change is, it is one commit on the main branch.
Figures: 2,081 changes shipped, 769 release notes written, 260,754 lines added, 98 bundles merged, about 23 changes a day including weekends. Source: Eva's git history, 12 June to 10 September 2026.`,

  "03-cloud": `The claim that makes the rest of the deck make sense: none of this was built on a laptop.
→ Step 1: the laptop lifts into the cloud. Say every change in the last three months was written, tested and shipped from a browser tab, and that Eva does the work inside its own cloud workspaces.
→ Step 2: the three counters and the source line arrive together. The cards carry short labels only, so say each in full: 346 changes authored by Eva itself; 33 bundles of work Eva opened and finished on its own since August; and of those, 10 in all of August, then 23 in the first ten days of September. Use the source line to answer the authorship question before it is asked.
Detail: authorship is read from the author field recorded on each change, so a change Eva wrote and a person merged still counts as Eva's.
Figures: 346 changes authored by Eva itself; 33 bundles Eva opened and finished on its own since August; 10 of those in all of August against 23 in the first ten days of September.`,

  "04-sessions": `A session is one running conversation about one codebase, and over the summer it gained the tools of a real workspace.
→ Step 1: the July milestones. The theme is the workspace filling out — a queue, a browser, files, tabs and plan mode.
→ Step 2: the August milestones. The theme shifts to being told what is happening: notifications, mobile, limits, archiving.
→ Step 3: the September milestones. The theme is recovering by itself rather than stalling.
Detail: twelve milestones is too many to read aloud; name the three themes and let the axis carry the detail.
Figures: dates are when each change landed in Eva's main branch, 9 July to 10 September 2026.`,

  "05-simple-mode": `Most people opening Eva are not engineers, so the answer was to remove machinery rather than add explanation.
→ Step 1: the picker becomes the five-step slider and the caption lands. Say the trimmed list was still the advanced surface, which is why it became one control.
Detail: the picker on the right is the real shipped component, not a drawing of one. Simple Mode is an optional setting, not a separate product, and it hides files, consoles, settings and meters while leaving the conversation.
Figures: Simple Mode landed 14 August 2026; the slider replaced the list on 24 August 2026.`,

  "06-automerge": `One human click, and everything after it is automatic.
→ Step 1: the pipeline runs through to production. The only human step is marking the work ready; the rest is the bot.
→ Step 2: the nightly routines card. These open their own bundles overnight, so the morning starts with work to review rather than work to start.
Detail: always-on checks were retired in August because the agent had already checked its own work inside the sandbox, so running them again added waiting rather than safety.
Figures: auto-merge landed 3 September 2026. Six nightly routines: critical bugs, test coverage, docs, code structure, code quality and an 08:00 standup.`,

  "07-sandbox": `Starting a workspace used to be a coffee break, and that single wait shaped how the whole tool felt.
→ Step 1: both lanes race, then the closing line arrives after the slow lane finishes. Let the four seconds run in silence — the discomfort is the argument.
Detail: nothing was given up in the move. The same workspace underneath still has a terminal, live preview, desktop and snapshots.
Figures: about 40 seconds before on Daytona against under one second now on Vercel Sandbox, more than 40 times faster. Timings are the product owner's own measurements before and after the move; the migration landed 6 to 8 July 2026.`,

  "08-more": `A deliberate flood: eight more things shipped in the same twelve weeks, none of which earned its own slide.
Detail: do not read the grid. Pick two the room will care about and move on — Manager Ave, an agent that runs your other sessions, and works on your phone, which is what made the tool usable away from a desk. The cards carry titles only; if asked, the rest are: Automations Hub, ready-made routines you install with one click; the two-pane inbox, everything that needs you in one place; works on your phone, every screen usable on a small screen; rich link previews, where Figma, Linear, Sentry and PostHog links become chips; editing files in the browser, open, change and save without leaving Eva; and reading sibling repos, so Eva can look across your other codebases while it works. The 94% figure is the loading shimmer's main-thread cost after the September animation work, and it has its own slide in the annual deck.
Figures: eight items, all shipped between June and September 2026.`,

  "09-team": `The point is not that Eva is used, it is that people who do not write code raised the work themselves.
→ Step 1: Matt, referral portal, since May. The AQP list map, the referral dashboard, and referral tabs with cancellation reasons.
→ Step 2: Zuza, design and admin, since March, and the heaviest non-developer user of the tool. User management pages, admin KPI dashboards, and the polish on KPI cards, badges and tables.
→ Step 3: Kezia, referral portal and domiciliary care, since May. Exports and audit trails, broker and borough filters, and automated decline and expiry emails.
→ Step 4: Vedant, product, since January, and the total underneath. The domiciliary care SUPA archive, the nursing home SUPA archive, and eProcurement fixes.
Detail: the cards carry names and counts only. Say the roles, the months and the projects aloud. The shape of the work is the same every time — a colleague described what they needed, Eva built it in the browser, and they reviewed it.
Figures: Matt 27, Zuza 237, Kezia 39, Vedant 912, and 303 pieces of work raised by colleagues. Sessions, quick tasks and projects created in Eva between 11 January and 16 September 2026, including items later cancelled.`,

  "10-code-reviews": `Reading every change by hand was the slowest step, so it moved to the model and people kept the part that matters.
→ Step 0: the old way, five lines. A person read every line, comments went back and forth, work waited days for a reviewer, small bugs still slipped through, and a one-line change got the same attention as a database migration.
→ Step 1: the strike draws through all five and the old lane fades back.
→ Step 2: the two statements. The model reads the whole change, finds ordinary bugs, suggests the fix and runs the checks. People still hold data structure changes, deletions and migrations, payments, permissions and access, and anything hard to roll back.
→ Step 3: the closing line. This is the sentence to leave in the room.
Detail: the mechanics are already on slide 6 — the nightly critical bugs and code quality routines, and auto-merge.`,

  "11-whats-next": `The constraint has moved: Eva now finishes work faster than people can check it in.
→ Step 1: the review segment glows and the 43 card arrives. That is more finished work waiting than the 29 already merged.
→ Step 2: the four pipeline steps. The fix is not to review faster, it is to give CarePulse the same pipeline Eva already runs on itself — the same automations behind Eva's own releases on slide 6.
Detail: cancelled work is shown rather than hidden, because a queue that quietly drops items is not a queue.
Figures: 141 quick tasks — 29 done, 43 waiting in code review, 14 in business check, 25 not started, 30 cancelled. CarePulse quick tasks created in Eva between 1 June and 10 September 2026, by status on 11 September 2026.`,

  "12-future": `Three shifts to expect, each one already true inside Eva rather than predicted.
→ Step 1: more automations. Routine work runs on a schedule or a trigger, and people set direction rather than tasks.
→ Step 2: mistakes become cheap. When a change can be remade in minutes, being wrong stops being expensive. Try more, worry less.
→ Step 3: everything in sandboxes, managed from chat, and the fleet lights up behind it. Eva's own development already works this way, and the Grok bot merges its changes. Next, the same for all our work.
Detail: say plainly that this is a direction of travel, not a plan with dates. Nothing here is a commitment.`,

  "13-developer": `The job did not disappear when the model started writing the code, it moved.
→ Step 0: the five archetypes. The Prototyper churns out ideas that mostly never ship, the Builder turns a prototype into a real product, the Sweeper simplifies, removes and tunes, the Grower iterates towards fit, and the Maintainer keeps a mature system safe and fast.
→ Step 1: the bracket lands over Sweeper and Maintainer. That blend is the work that is growing, not the other three.
→ Step 2: what gardening actually means — lints, types, checks and written rules that the model reads before it starts.
→ Step 3: the CarePulse line. The biggest single job is finishing the v3 migration, because it removes most of what trips the model up today.
Detail: a tidy codebase is one the model can work in without breaking things, which is why this is engineering rather than tidying.
Figures: archetypes from Boris Cherny, X, 28 June 2026; the eight months without hand-written code from Fortune Brainstorm Tech, reported 11 June 2026.`,

  "14-personal": `Cloud coding agents are now a category, and the honest position is that ours is not the cleverest but it is the one we can bend.
→ Step 1: what Eva has that the others do not — our repositories, data and rules, new features in an afternoon by anyone on the team, and the freedom to delete anything unused.
→ Step 2: the demo switches into Simple Mode, showing the same product with the machinery removed.
→ Step 3: the Notion line. Notion began as notes and kept adding features most people never open, and software that serves everyone ends up fitting no one.
Detail: name the six competitors without disparaging them; they are all good, they simply do not know CarePulse, our team or our rules.
Figures: comparison reflects our own use, September 2026. Product names are their owners' trademarks.`,

  "15-closing": `Close on the one fact that carries the whole argument: the deck itself was built the way everything else was.
Detail: hold here rather than rushing to questions. If the room takes one thing away, it is that the tool was good enough to build its own presentation. Do not add new material at this point; the numbers have already been made.`,

  "friday-b01-ask": `Nothing else in the deck shows the tool actually being used, so this is the slide that does it: a sentence in, working software out.
→ Step 1: the cloud workspace. Eva takes the sentence away and builds it somewhere that is not anyone's laptop, so nothing has to be installed and nothing can be broken locally.
→ Step 2: the live preview. This is the moment a non-technical colleague can judge the work themselves, rather than reading a summary of it. You try it, you ask for changes, and the same loop runs again.
→ Step 3: the closing line. Leave it in the room.
Detail: the resting state is the ask itself, typed in plain English into an ordinary chat box. There is no form, no ticket, no queue and no handover, and the words on screen are the exact words a person would use to a colleague. If asked what happens to the sentence, Eva reads the codebase, writes the change, runs the checks, and only then offers it back.`,

  "friday-b02-preview": `A preview you can click through is the difference between trusting a summary and seeing the thing.
→ Step 1: the frame walks phone, then tablet, then desktop, and the rotate and screenshot buttons arrive with it. Anyone can check how a change looks on the device their colleagues actually use, without owning that device.
→ Step 2: the note pin drops. Click any element on the preview and leave a note attached to that element, so feedback points at the thing rather than describing where it is.
Detail: a preview outlives the conversation that made it. Leave the session, come back later and the preview is still there, which is what makes it usable for someone who only has ten minutes in the afternoon. None of this is merged: it is a proposal you can walk through before anyone agrees to it.
Figures: click-to-comment and the phone, tablet and desktop widths landed 21 July 2026; the device toolbar with rotate and screenshot 25 August 2026; previews surviving a session being left 14 August 2026.`,

  "friday-b03-inbox": `Work that needs a person used to be scattered across email, chat and half-remembered tabs; now there is one list.
→ Step 1: a row selects and the linked page appears in the pane beside it. Nothing opens in a new tab and nothing is lost: the list and the thing itself sit side by side, and the whole list is driven by the arrow keys.
→ Step 2: the browser tab and its count. New notifications play a two-note chime that still works when Eva is in a background tab, and the number of unread items is written on the browser tab itself, so the answer to is anything waiting for me is visible without switching to it.
Detail: a row can be marked unread again, which matters because reading something is not the same as dealing with it.
Figures: the two-pane inbox with in-place preview and arrow-key navigation, 20 August 2026; the chime and the unread count on the browser tab, both 1 August 2026; marking a row unread again, 29 August 2026.`,

  "friday-b04-documents": `Plans, notes and specifications live in Eva rather than beside it, and several people can be in the same one at once.
→ Step 1: the comment pin anchors to a line. Comments attach to the text they are about and can be resolved once they are dealt with, so a document does not accumulate stale argument.
→ Step 2: the version list. Every edit is kept, so you can see what the document said before and who changed it.
Detail: the resting state is two people typing in the same paragraph at the same time — that is real-time collaborative editing, not a file being passed around. There is also a suggestion mode, where an edit is proposed rather than applied and someone else accepts it, which is how a plan gets reviewed without being overwritten. Eva reads these documents while it works, so writing the plan down is also how you brief it.
Figures: collaborative editing, anchored comments, suggestion mode and version history all landed 10 June 2026.`,

  "friday-b05-plan": `The fastest way to make a big job safe is to ask for the plan before the work, and asking is now all it takes.
→ Step 1: the control disappears and a sentence takes its place. The plan tab appears on its own once a plan exists, so there is nothing to switch on and nothing to switch off afterwards.
Detail: the resting state is the old machinery — a mode dropdown above the prompt box that people had to know about, find and remember to turn off again. Removing it is the pattern behind most of this deck: fewer controls, more plain English. Say why a plan is worth asking for at all — it is far cheaper to argue with a paragraph than with a finished feature.
Figures: the plan mode dropdown was removed on 23 August 2026 and replaced by simply asking.`,

  "friday-b06-projects": `When a job is really several jobs, the shape of it has to be visible, which is what the roadmap is for.
→ Step 1: the bars fill. Each bar is one job, and how far it has filled is how far along it is, so the state of the whole piece of work reads in one glance.
→ Step 2: the zoom changes and the bars re-scale. Quarter, month or week, depending on whether you are looking at the year or at this afternoon.
Detail: there is also a jump straight to today, and the roadmap can be dragged along to move through time, which is what makes a long project navigable rather than a wall of bars. Jobs run in the order they are laid out, so a later job can depend on an earlier one finishing.
Figures: the projects timeline was rebuilt as a roadmap with completion bars, quarter, month and week zoom, a jump to today and drag-to-pan, 17 June 2026.`,

  "friday-b07-three-ways": `One engine, three sizes of ask — and the choice is about the size of the job, not about the type of person asking.
→ Step 1: a session. A running conversation about one codebase that stays open for as long as the work does, so you can iterate, change your mind and come back to it.
→ Step 2: a project. Several jobs in order, which is the roadmap on the previous slide.
→ Step 3: the closing line. Nobody has to learn three products.
Detail: the resting state is a quick task — one job, start to finish, with no conversation expected. Describe it once and the finished work comes back for review. If asked which to use, the honest answer is start with a quick task and move up only when the job turns out to be bigger than one ask.`,

  "friday-b08-reviews": `Checking the work no longer means leaving for another tool, which is the last place the old workflow leaked out of Eva.
→ Step 1: a comment lands on the change. A bundle of changes can be read, commented on and acted upon here, laid out the way the room already recognises from GitHub.
→ Step 2: the search overlay. One search reaches every codebase, team, project, task, session, document and artifact, so finding something does not depend on remembering where it was filed.
Detail: keyboard shortcuts are rebindable, so the people in the tool all day can set it up the way their hands expect. The point of the slide is that the whole loop — ask, build, preview, review, merge — happens in one browser tab.
Figures: reviewing and answering bundles of changes inside Eva, 3 August 2026; search across everything, 24 July 2026; rebindable keyboard shortcuts, 6 August 2026.`,

  "friday-b09-automations": `Some work does not need a person to start it, so it now starts itself overnight.
→ Step 1: the dial sweeps from three to five in the morning and the five routines light up in order. Say that these are ready-made, and that installing one takes a click rather than each person retyping the same instructions.
→ Step 2: the review cards land. The routines do not just run, they open their own bundles of changes, so the morning starts with finished work to look at.
Detail: the Automations Hub is a shelf of routines anyone on a codebase can install; before it, the same instruction had to be written out again by every person who wanted it. The five are staggered rather than fired together so they do not all compete for the same machines at once. Times are UTC.
Figures: the Automations Hub landed 6 August 2026. The five maintenance routines — find critical bugs, add test coverage, generate docs, improve code structure and a code-quality review — were added 21 August 2026, staggered between 03:00 and 05:00 UTC.`,

  "friday-b10-standup": `Every weekday morning a short summary of the day before is written for you, in plain English.
→ Step 1: the summary writes itself into the card. About 150 words, and deliberately readable by someone who has never opened the codebase.
→ Step 2: the Today and Yesterday timeline slides in. That is the /today page, where the summaries stack up day by day.
Detail: the routine is read-only. It looks at what happened and writes about it; it cannot change anything. The first version read like an engineer's log, so the instructions were rewritten the next day to ban file names and jargon outright. The words on the card are a stand-in for the shape of a real summary, not a real one.
Figures: the 08:00 UTC weekday summary started 20 August 2026 and was rewritten for non-technical readers on 21 August 2026.`,

  "friday-b11-skills": `A skill is a command someone has already written down, so nobody has to explain the same job twice.
→ Step 1: the picker opens out of the composer and the commands stagger in. The point is that there is nothing to remember: type a slash and choose.
Detail: skills are turned on per codebase from Settings, with no change to the code itself, and they then appear for everyone working in it. Claude's own built-in skills were added to the same picker a fortnight later, so the list is not limited to what we wrote ourselves. The six on screen are real commands from this codebase.
Figures: Eva's own skills landed 6 August 2026; Claude's built-in skills joined the picker on 22 August 2026.`,

  "friday-b12-ave": `One permanent chat sits above all the others and keeps track of them for you.
→ Step 1: the lines draw out to six running agents. From this one chat you can list them, look inside any of them, send one a message and stop one, across every codebase you have, and it is told when each of them finishes.
→ Step 2: two of them report back with a tick. You do not have to go looking; finished work comes to you.
Detail: it started as a master chat that could also write code itself, and that turned out to be the wrong shape — a supervisor that keeps editing stops supervising. Six days later it was renamed Manager Ave and limited to supervising only.
Figures: the master chat landed 18 August 2026; it became Manager Ave, restricted to supervising, on 24 August 2026.`,

  "friday-b13-reliability": `Things still go wrong; what changed is how long you are left not knowing.
→ Step 1: the hanging spinner gives up. An agent that had died used to leave the chat saying Working for up to two hours. A watchdog now confirms the process really is dead and closes the turn within minutes, and whatever the agent had already written is kept rather than thrown away.
→ Step 2: the retry card. A turn that stalls with nothing written at all now tries once more on its own before anyone is told.
→ Step 3: the usage-limit card. When a model's usage limit is reached, the chat says so, says when it resets, and offers a teammate's shared account in one click.
Detail: let the first card sit for a moment before clicking — the discomfort of the spinner is the argument. The account switch was built for sessions first and extended to quick tasks and projects a week later.
Figures: watchdog 30 July 2026; stalled empty turns retry once, 26 August 2026; usage-limit card and one-click account switch 4 September 2026, extended to quick tasks and projects 10 September 2026.`,

  "friday-b14-mobile": `Work gets raised when you think of it, which is usually not when you are sat at a desk.
→ Step 1: the desktop frame folds down into a phone and the content reflows into a single pane. Pinch-zoom was put back, and the controls were moved where a thumb can reach them.
Detail: be precise if asked — there is no app to install. This is the same web app in a phone browser; a separate mobile app was abandoned and deleted in May 2026. Every route was audited rather than a few important ones, and a second pass followed a fortnight later.
Figures: the responsive audit landed 17 August 2026, with a second pass on 4 September 2026. The target was every route at 640 pixels wide and below.`,

  "friday-b15-artifacts": `Not everything an agent makes belongs in a codebase; some of it just needs to be looked at.
→ Step 1: the saved page becomes a hosted page with a link. The agent builds a self-contained page and hands back an address anyone on the team can open.
→ Step 2: the tabs arrive on the chat. Artifacts and Documents now sit beside the conversation, so what was made is next to where it was asked for.
Detail: useful for a one-off report, a comparison table or a small interactive view — things that would otherwise be pasted into a message and lost. The tabs came much later than the hosting: for three months the pages existed but were awkward to find again.
Figures: hosted artifacts landed 17 June 2026; every chat gained its own Artifacts and Documents tabs on 12 September 2026.`,

  "friday-b16-close": `Close on three concrete things to do on Monday, not on a summary of the deck.
→ Step 1: raise one quick task. One sentence describing what you want is enough to start.
→ Step 2: open the inbox. Finished work is waiting there rather than needing to be chased.
→ Step 3: review what is waiting, then the closing line lands. Say it and stop.
Detail: do not add new material here. If anyone asks where to start, the answer is the smallest annoying thing they already know about. The gradient behind the list moves slowly on purpose; let it run while the room reads.`,

  // ---------------------------------------------------------------------------
  // Annual CDM deck
  // ---------------------------------------------------------------------------
  "a01-title": `Open on the span, not the product: an empty repository in January became how everything is now built.
Detail: this deck is read by an assessor as well as watched by a room, so say early that every claim is evidenced from the repository or Eva's own records. The last slide maps the whole deck to the capability framework, which is worth signposting now.
Figures: the window is 11 January to 16 September 2026.`,

  "a02-origin": `Eight months, told as five moments, so the scale is felt before it is counted.
→ Step 1: first session on 24 January and first quick task on 1 February. Two weeks from empty to usable.
→ Step 2: work moves to the cloud in July, and in August Eva starts opening its own work.
→ Step 3: the totals land. This is the evidence base for everything that follows.
Figures: empty repository 11 January 2026; 4,732 changes shipped and 1,348 sets of release notes, from Eva's own records and the project's history to 16 September 2026.`,

  "a03-numbers": `Eight months in numbers, headline first, supporting detail second.
→ Step 1: the secondary card. This is the answer to whether the tool is used by anyone else — sixteen accounts, nineteen automations and 504 automation runs.
Detail: the closing rate line is deliberately unglamorous. Nineteen changes a day sustained for eight months matters more than any single peak.
Figures: 4,732 changes, 887 pieces of work raised, 367 working sessions, 1,348 sets of release notes; 16 people with accounts, 19 automations, 504 automation runs, 107 documents. Eva's own records and project history, 11 January to 16 September 2026.`,

  "a04-adoption": `Adoption was not announced, it followed the tool becoming easy enough to use.
→ Step 1: July onward lights and the earlier months dim. The step change is July, when work moved to the cloud.
→ Step 2: the three figures count up. Read them as sentences: 13 people beyond the developer have raised work in Eva; 390 pieces of work were raised against CarePulse; 225 sessions ended in a bundle of changes ready to review. The tool left one person's hands.
Detail: June is genuinely zero, not missing data, and the footnote says so — do not skip past it, because volunteering the gap is what makes the rest credible.
Figures: sessions per month in 2026 — Jan 13, Feb 11, Mar 31, Apr 28, May 9, Jun 0, Jul 75, Aug 109, Sep 91. 13 people beyond the developer raised work; 390 pieces of work against CarePulse; 225 sessions ended in a bundle ready to review. To 16 September 2026.`,

  "a06-impact": `Three things changed, and none of them is about speed of typing.
→ Step 1: who can ask. A request, a queue and a developer became anyone describing what they need in their own words.
→ Step 2: where work runs. One laptop at a time became cloud workspaces running many jobs at once.
→ Step 3: what a person does, and the two counts beside it. Writing every line became directing the work and guarding what is hard to undo.
Detail: the rows carry no category label, so name each one — who can ask, where work runs, what a person does — as it lands. Eva was built to remove the wait between someone needing something and it being built. The third row is the one to dwell on, because it is the change that makes the others safe.
Figures: 13 people other than the developer have raised work in Eva; 390 pieces of that work were for CarePulse. Eva's own records to 16 September 2026.`,

  "a07-how": `The whole loop in one pass, so nobody is guessing what using the tool actually looks like.
→ Step 1: the flow line runs and the browser tab line lands. There is no install, no ticket and no handover.
→ Step 2: the four ways to ask, as names only. A session is a running conversation; a quick task is one job start to finish; a project is several jobs in order; an automation is a job that runs itself. The choice is about size of job, not about type of user.
Detail: the three cards are headings only, so describe each stage. You describe it in plain English in a chat, with no forms and no tickets. Eva builds it in its own cloud workspace, with a live preview you can click through. You try it, ask for changes, and then it goes live. The live preview in stage two is the part non-technical colleagues care about, because it is the first point at which they can judge the work themselves.`,

  "a09-design": `Technical design happened on paper first, and replacing the engine every workspace runs on is the proof.
→ Step 1: the six phases. A spike, a provider-neutral contract with no consumer, the old provider moved behind it, the new provider, the switch-over, then the old code deleted.
→ Step 2: the restore figure, which is the number the spike was written to test. It was an explicit go or no-go, and the answer was go.
→ Step 3: the options put down. Seven abandoned plans are kept in writing, and two rejected animation options carry the measurement that killed them.
Detail: interactive terminal, desktop and named volumes were deliberately deferred, and that was said at the time.
Figures: 6 to 29 July 2026, switch-over 25 July, old code removed 29 July; a 6GB workspace restores in about 0.33 seconds against minutes before; 11% worse compositor time, five times more painting. Rejected options 5 September 2026.`,

  "a10-debugging": `Three real faults, each taken to a cause and pinned by a test, rather than patched and forgotten.
→ Step 1: 2 September. Messages sat unanswered for two hours. Three defects together — a liveness check whose process match caught its own wrapper, a kill that left an orphan holding a file lock, and a launch racing its own ready marker. Each is now pinned by its own named contract test.
→ Step 2: 24 August. A three-minute wait that was not the workspace booting; resume took eight seconds. A prewarm on a stale model setting held the launch lease. Losers now wait for the lease, re-probe and respawn.
→ Step 3: the closing figure, found by searching live traffic rather than from a report.
Detail: the resting state is 10 September. Under CHIPS a partitioned and an unpartitioned cookie of the same name are two cookies, and the browser sent both, so signing out left you signed in. The fix deletes the unpartitioned one first.
Figures: 65 respawn events against 146 daemon launches in 24 hours. Release notes, August to September 2026.`,

  "a11-craft": `The skill acquired outside programming this year is measurement; the bars are its output, not its point.
→ Step 1: the habits behind the numbers. Live traffic is searchable, decisions are written down, there is one design system, and accessibility defects get fixed.
→ Step 2: the honest gap. A Lighthouse harness exists in the repository but no scores have been recorded in the release notes, so it is set up and not yet a habit.
Detail: defend the method, not the reduction. A fresh tab per run, tracing over timeline, compositor and viz categories, busy time merged per thread, interleaved rounds, medians of three, and visual parity proved by pausing animations at the same offset and diffing frames at 0.9998. The write-up states its own limitation: the test machine has no GPU, so only the main-thread figures transfer.
Figures: shimmer 32.6 to 1.9 ms/s, repaints 240 to 0 per second, spinner recalculations 420 to 49 per second, a realistic chat mix 64 to 45.5 ms/s. 5 September 2026.`,

  "a12-quality": `The standard is enforced by the machine, because a standard that relies on remembering is not a standard.
→ Step 1: the written rules. Unsafe type escapes and certain React patterns are banned, parsing happens at the edge, and every change needs a type check and release notes.
→ Step 2: the closing line. A permanently red test is treated as a defect in the test, because a suite people stop reading protects nothing.
Detail: the 79 contract tests are the interesting number — they fail when two parts of the system drift apart, and one asserts that the three chat surfaces stay unified. The four hand-written lint rules exist only where an off-the-shelf rule could not express the standard: no hand-rolled narrowing, no bare JSON.parse, no double casts, no value blocks in try.
Figures: 303 test files across app, backend and shared components; 79 contract tests; 46 nightly runs that back-filled tests; 4 custom rules. Repository at 16 September 2026.`,

  "a13-people": `Every incident here was found by a colleague rather than by a test, which is the point of the slide.
→ Step 1: September. Two of a colleague's messages were dropped because the fix had landed on the sessions surface only. The rule that chat is one surface is now written into the repository, so the gap cannot reopen.
→ Step 2: August. Design tooling did not survive a workspace resume, found in a colleague's own session.
→ Step 3: the cards recede and the closing line lands. Each was fixed, pinned by a test and written down.
Detail: the resting state is the August stall — two hours on Working while a colleague's messages went unanswered, caused by a zombie runner holding the spawn lock while the watchdog extended its own deadline. Standards are written for people and agents alike: repository rules, guides for the interface, data layer and security, ready-made commands, release notes on every change.
Figures: release notes, August and September 2026.`,

  "a14-users": `Most people opening Eva are not engineers, and almost every decision on this slide follows from that.
→ Step 1: the three chips. Every screen was made usable on a phone across two audits, shortcuts were made visible and rebindable, and pages saying pick something from the sidebar were removed, because on a phone the sidebar is a closed drawer.
→ Step 2: the closing line. None of this made the tool cleverer.
Detail: the rows in order — Simple Mode hid reviews, differences, token meters and consoles, leaving the conversation and a preview; the model list became a five-step slider because the trimmed list was still the advanced surface; PRD was renamed Plan because that is what people meant; the daily summary was rewritten for a non-technical reader, with a hard ban on file names and hashes.
Figures: Simple Mode 14 August 2026, slider 24 August 2026, mobile audits August and September 2026.`,

  "a08-ahead": `The constraint has moved from building to deciding, and the next year is about the steps either side of the build.
→ Step 1: the first strand lights and the queue figure arrives, which is finished work waiting to be checked in. Marking work ready should be the last human step, as it already is for Eva itself.
→ Step 2: the closing question. How fast can we build it becomes how fast can we decide.
Detail: the three strands are headings only. Automate the release, so marking work ready is the last human step. Guard the irreversible, so people concentrate on data, permissions and anything hard to undo. Software that fits us, meaning tools shaped around how we work rather than the other way round. The next year is about the steps either side of the building, and none of the three is a dated commitment.
Figures: 176 pieces of finished work waiting to be checked in, against 455 already finished. Quick task status across all 887 raised in Eva, at 16 September 2026.`,

  "a15-framework": `This is the map an assessor reads: nine capabilities, each one evidenced by a slide already shown.
→ Step 1: the ticks land. Owns technical design, understands trade-offs and breaks down large problems all come from Design and its six phases; debugs without flailing, Debugging; a skill beyond coding, Beyond code; improves the process, Quality; mentors and onboards, Working with others; business and user empathy, The people using it; identifies work to do, The year ahead.
→ Step 2: the thin evidence. Page scores are not routine though the harness exists; there is no on-call rota or incident grading, as this is a one-person project; and there has been no work alongside a designer or user researcher.
→ Step 3: the totals. Volunteer the gaps before they are asked for, then close on the record.
Figures: 4,732 changes and 1,348 sets of release notes, all written at the time. Repository and Eva's own records, 11 January to 16 September 2026.`,

  "annual-b01-day-one": `The data layer the product still runs on was settled on the very first day, not migrated to later.
→ Step 1: the three commits stack in. The first commit, then the schema for projects and tasks, then the queries and mutations behind it.
→ Step 2: the closing line. Nothing in the deck that follows required that decision to be unpicked.
Detail: this is the one slide where the hashes are worth showing, because anyone can check them. Say that the same schema, extended many times, is still what every session, quick task and project is stored in. Note for accuracy if pressed on the wording: the first commit was at 16:36 and the schema commit at 20:15 on the same evening, about three and a half hours apart, so the slide says "day one", which is exact.
Figures: 5468954a6 Initial commit, 317b85cd5 projects and tasks schema, 5467d4ca2 Convex queries and mutations, all on 11 January 2026.`,

  "annual-b02-first-week": `Both of the two ideas the product is built out of arrived inside the first week.
→ Step 1: quick tasks land on 12 January, one day after the first commit. One prompt, one result, start to finish.
→ Step 2: sessions land on 14 January, and the closing line follows. A session is a running conversation about one codebase, and everything since has been an elaboration of those two shapes.
Detail: projects and automations came later, but both are built out of quick tasks and sessions rather than alongside them. The point to land is stability of concept — eight months on, nobody has needed a third primitive.
Figures: quick tasks appear in the code on 12 January 2026 and sessions on 14 January 2026, within four days of the first commit on 11 January 2026.`,

  "annual-b03-q1": `The first quarter was about getting a usable surface in front of people, and it was the heaviest building of the year.
→ Step 1: the quarter total counts up. 1,758 changes in three months, before anyone outside the project was using it.
→ Step 2: the three months appear and March is picked out. 1,070 changes in one month is the single biggest month of the year, and it is where most of the interface came from.
→ Step 3: the streaming figure. Live output used to be written back to the database 60 to 120 times during a single run; separating it into its own small table cut that to two writes.
Detail: the streaming change is the first example in the deck of a fix that was measured rather than felt. It is also why long sessions stopped slowing the whole workspace down.
Figures: January 280, February 408, March 1,070, totalling 1,758 changes shipped. Live streaming moved to its own table on 5 February 2026.`,

  "annual-b04-load": `Building the surface was only half the job; the surface then had to arrive quickly on someone else's machine.
→ Step 1: both bars collapse and the figures count down. The main bundle fell from 1,355 kB to 273 kB, and the heaviest single screen from 1,048 kB to 84 kB.
→ Step 2: the closing line, which is the only thing a non-technical room needs from the numbers.
Detail: the work was automatic code splitting in the router, lazy-loaded code blocks, and removing a cyclic dependency. Nothing was taken out of the product — the same screens are there, they simply load when they are opened rather than all at once.
Figures: main bundle 1,355 kB to 273 kB, a fall of 80%; heaviest screen 1,048 kB to 84 kB, a fall of 92%. Bundle optimisation, 31 March 2026.`,

  "annual-b05-q2": `The quietest quarter of the year was not a slow one, it was the quarter the tool stopped being single-player.
→ Step 1: documents. Comments anchored to a passage, suggestion mode, and version history, all on the same day.
→ Step 2: the projects roadmap, which is where several pieces of work in order become one thing a person can see.
→ Step 3: Testing Arena opened to everyone, so trying a change stopped being a developer-only act.
Detail: 943 changes is the lowest quarter in the year, and that is the point — the three months went on making existing work solid and shared rather than adding new surface. If asked whether momentum was lost, the answer is on the next slide: the quarter after it was the biggest of the three.
Figures: April 377, May 336, June 230, totalling 943 changes shipped. Documents with comments, suggestions and version history 10 June 2026; projects roadmap 17 June 2026; Testing Arena opened to everyone 17 June 2026.`,

  "annual-b06-q3": `The last quarter was about dependability: the same product, made to survive being relied on.
→ Step 1: July, 1,052 changes, almost all of it the sandbox cutover. The engine every workspace runs on was replaced, and the Design slide takes that apart phase by phase.
→ Step 2: August, 877 changes. Durable turns, so a long run survives an interruption instead of stalling; security work; and the design system that the whole interface now sits on.
→ Step 3: September, 102 changes to the 16th. Multi-repo sessions, so one conversation can span several codebases, and decision models for classifying work at scale.
Detail: September is a part month, so do not read the drop as a slowdown. The theme across all three is that nothing here adds a new thing to do — it makes the existing things safe to depend on.
Figures: July 1,052, August 877, September 102, totalling 2,031 changes shipped, to 16 September 2026.`,

  "annual-b07-volume": `The year was not steady, and the shape of it explains more than the total does.
→ Step 1: March and July stay lit while the rest dim, and the line names them. March was the surface being built; July was the cutover that moved every workspace to a new engine.
→ Step 2: the total counts up. 4,732 changes across nine months, or roughly nineteen a day including weekends.
Detail: the two troughs are as informative as the peaks. June is the consolidation quarter's low point, and September only looks thin because it stops on the 16th. Do not let the room read the last bar as a decline — say the part-month caveat aloud rather than leaving it to the footnote.
Figures: Jan 280, Feb 408, Mar 1,070, Apr 377, May 336, Jun 230, Jul 1,052, Aug 877, Sep 102. Total 4,732 changes shipped, September to the 16th.`,

  "annual-b08-rename": `A breath between chapters: the project people now call Eva spent its first five months under another name.
→ Step 1: Conductor dissolves into Eva. Say only that the name changed when the repository moved.
→ Step 2: the two dates. The rename on 3 June and the internal packages catching up on 24 July.
Detail: keep this short — it is a pause, not an argument. If it is worth a sentence, it is that the six-week gap between the public rename and the internal one was deliberate, because renaming every package is the kind of wide, risky change that is better done on its own than mixed into feature work.
Figures: renamed from Conductor to Eva when the repository moved on 3 June 2026; internal packages renamed from @conductor/* to @eva/* on 24 July 2026.`,

  "annual-d01-security": `Signing in was never the problem; knowing whose data you were looking at once you were in was.
→ Step 1: the guards land and the rail draws. Every check moved into shared helpers, so a new surface inherits the boundary rather than remembering to add it.
→ Step 2: the two counts fall. Production dependency warnings went from 2 critical and 48 high to 0 critical and 2 high.
→ Step 3: the closing line. On 19 August the boundary was exercised against real production data, not only against tests, which is the difference between believing it and knowing it.
Detail: the 8 August audit found sign-in enforced everywhere but ownership checked inconsistently across codebases, sessions, tasks, teams, workspaces, snapshots and integrations. The sign-in flow was hardened in the same pass: explicit consent, a stronger proof-key exchange, registered return addresses and refresh tokens bound to the client that asked for them. If asked why this slide exists in a report about building quickly, the answer is that speed without a boundary is how a small team creates a large incident.
Figures: 2 critical and 48 high production dependency warnings down to 0 critical and 2 high. Ownership audit 8 August 2026; verified against production data 19 August 2026.`,

  "annual-d02-design-system": `A shared component library is what stops every new screen being a fresh argument about how things should look.
→ Step 1: the two figures count up. 110 files and 18,197 lines, which is the size of the thing every screen is assembled from.
→ Step 2: the closing line. Consistency is now the starting condition rather than a clean-up job.
Detail: the conventions are written down, not folklore — surfaces are separated by tone rather than by decorative lines, there is one shadow system, and motion runs on shared tokens. Two supporting moves made it possible: Tailwind v4 was adopted across the web app and the browser extension on 5 August 2026, and the project moved to a single icon library on 2 August 2026. The tiles are the library in miniature: four colours, four surface tones and four of the shapes every screen is built from.
Figures: 110 files and 18,197 lines in the shared component library. Measured 23 September 2026.`,

  "annual-d03-motion": `Ten motion changes landed on one day, and the point of them was to stop motion being a matter of taste.
→ Step 1: all ten samples restart together on one duration, one curve and one rest. Let the grid run — the synchronisation is the argument, so stop talking while it happens.
→ Step 2: the closing line. Motion is a house style now, not an opinion held per component.
Detail: the ten changes were house transition defaults, tokenised durations, gesture physics, focus rings and drag sensors, all on 7 August 2026. Before that, every component picked its own timing, which is what the resting state of this slide is showing. This is the most purely animated slide in the deck; it is meant to be watched rather than read, so do not narrate the tiles.
Figures: ten motion changes, 7 August 2026.`,

  "annual-d04-frontend-perf": `Waiting is the tax everyone pays on every change, so three separate waits were measured and cut.
→ Step 1: the local build falls from 28 seconds to 2.6 seconds, on 20 August 2026. That is the wait between making a change and seeing it.
→ Step 2: the public landing page's first download falls from 516 kB to 362 kB, on 8 August 2026. That is the wait a visitor pays.
→ Step 3: the code checker's false warnings fall from 8,862 to none. A checker nobody reads is a checker that is not running.
Detail: a further 489 kB of icons plus 1.2 MB of other code came off the application's first load on 4 August 2026, which is in the footnote rather than on the stage because three falling figures is already the limit of what a room will hold.
Figures: build 28 s to 2.6 s and 8,862 false warnings to 0, both 20 August 2026; landing page 516 kB to 362 kB, 8 August 2026; 489 kB of icons and a further 1.2 MB off the first load, 4 August 2026.`,

  "annual-d05-scale": `The size of what now exists, in units a non-engineer can weigh rather than in lines of code.
→ Step 1: the two supporting figures. 2,151 TypeScript files, and 18,197 lines in the shared component library alone.
→ Step 2: the closing line. Eight months, one codebase, one person directing the work.
Detail: 363 screens is the number that usually lands hardest, because most people can picture what one screen costs to build by hand. 71 data tables is the shape of the business the product now models, and 976 backend functions is what sits behind them. The 9,854 lines of release notes matter for a different reason: the record was written at the time, which is what makes every other figure in this deck checkable.
Figures: 2,936 tracked files, 2,151 TypeScript files, 363 screens, 71 data tables, 976 backend functions, 18,197 lines in the shared component library, 9,854 lines of written release notes. Measured 23 September 2026.`,

  "annual-d06-abandoned": `Deciding not to do something is design work, and it only counts if it is written down.
→ Step 1: the framework evaluation. A formal assessment on 17 July 2026 with the verdict recorded verbatim as do not adopt.
→ Step 2: unifying design sessions, cancelled on 29 July 2026 and replaced by a mode which was itself removed on 23 August — the same question answered, reversed, and reversed again.
→ Step 3: the closing line. The plans stay in writing, so the same argument is not re-run from memory a quarter later.
Detail: the resting state is the plan to move background workers to another host, abandoned because the new architecture removed the problem the move was meant to solve — the cheapest kind of cancellation. The third card is the honest one: reversing a decision twice is not a good look, and volunteering it is what makes the other two credible. Seven cancelled plans are kept in the repository in full.
Figures: framework evaluation 17 July 2026; design sessions cancelled 29 July 2026, replacement mode removed 23 August 2026; seven cancelled plans in total.`,

  "annual-d07-lessons": `Two sentences from the project's own notes, and both say the same thing about where the difficulty actually lives.
→ Step 1: cross-fade to the second quote. Autonomy is an infrastructure decision — how far an agent can be trusted to run is set by what surrounds it, not by which model is chosen.
→ Step 2: both sit together and the closing line lands. Read them once, then stop talking.
Detail: the first quote is the one to dwell on, because it is the opposite of the usual conversation. Most of this deck is evidence for it: the durable lifecycle slide, the security boundary, the enforced quality bar. None of those are about the model. Say plainly that both lines are verbatim from notes written during the year, not composed for this deck.
Figures: from the project's own written notes.`,

  "annual-d08-durable": `Most reports of the tool being stuck were one structural fault, and it was fixed once rather than patched repeatedly.
→ Step 1: the same turn runs again. It is interrupted at the same point, survives, and finishes — because the lifecycle is durable and fenced rather than held in one process's memory.
→ Step 2: the closing line. Interrupted stopped meaning lost.
Detail: the resting state is what used to happen — a turn breaks part-way and the interface sits on Working with nothing behind it. On 19 August 2026 every turn was given one durable, fenced lifecycle, and the rollout closed the remaining gaps on 23 August. Fencing is the part that matters: a turn that has been superseded cannot come back and write over the one that replaced it. This is the structural fix behind most stuck on Working reports, and it pairs with the Debugging slide, where the same symptom was chased case by case before the cause was addressed once.
Figures: one durable lifecycle for every turn, 19 August 2026; remaining gaps closed 23 August 2026.`,

  // ---------------------------------------------------------------------------
  // Intro to Eva deck
  // ---------------------------------------------------------------------------
  "annual-c01-providers": `Nothing here depends on one supplier staying cheap, fast or available.
→ Step 1: the model count. Four providers, twenty-one models, one picker inside Eva.
→ Step 2: the point. If a supplier raises its prices, falls behind or goes down, the work moves to another without anyone changing how they work.
Detail: the columns are the shipped catalogue, not a wish list; legacy entries kept only so old sessions still load are excluded. Each provider needs an account behind it, which is the accounts slide. A session remembers its last model, so nobody chooses every time.
Figures: Claude 7, Codex 4, OpenCode 4, Cursor 6 — 21 models in all. Repository catalogue at 16 September 2026.`,

  "annual-c02-sdks": `Every provider was moved off reading text out of a terminal and onto its own official connection.
→ Step 1: the three connections convert, one at a time — Cursor on 5 August, Codex on 12 August, OpenCode on 14 August.
→ Step 2: the old command-line runner is struck out and removed on 18 August, so no half-abandoned path is left to rot.
Detail: the old method started each provider as a command-line program and read its printed output, so any change to that output broke Eva silently. The official connections report events, errors and completion directly, which is why failures now surface as failures instead of silence. The OpenCode entry is the line to quote: the last CLI subprocess is gone.
Figures: Cursor 5 August 2026, Codex 12 August 2026, OpenCode 14 August 2026; the old runner deleted 18 August 2026.`,

  "annual-c03-handoff": `A choice of supplier is worth little if changing your mind means starting again.
→ Step 1: the conversation card lifts off Claude and lands on Cursor, word for word, and a handed-over badge appears on it.
Detail: each provider keeps its own private record of the conversation inside the workspace, so before this a mid-conversation switch started the new provider blind. Replies are now stamped with the model that produced them, and on a switch only the turns the incoming provider has not seen are passed across, capped in size and clearly marked. The chat shows a badge on the turn where the handover happened, so the transcript stays honest about who wrote what.
Figures: cross-provider handoffs landed 24 August 2026.`,

  "annual-c04-accounts": `Provider capacity is bought per person, so the useful question is whether it can be shared.
→ Step 1: each colleague attaches their own provider account, so their work spends their own allowance.
→ Step 2: one account is shared with the team and a second person draws from it.
Detail: an account is attached once and then stays with that person's sessions, tasks and projects. Sharing is deliberate and controlled by the owner, not automatic — a new session does not quietly pick up a teammate's account. Switching account mid-conversation keeps the conversation and rotates the running process, so the next reply is charged to the right place.
Figures: per-user provider accounts 17 July 2026; sharing an account with the team 7 August 2026.`,

  "annual-c05-mcp": `Eva is not only something people open; it is something other tools and agents can drive.
→ Step 1: reading. Anything connected can list the work in flight and see what each piece is doing.
→ Step 2: acting. It can send a message into an existing session, task or project, start and stop workspaces, and run code across several tools in one pass.
→ Step 3: the newest ring. It can make typed judgements — a calibrated score or category applied the same way every time — and draw an interactive panel straight into a chat.
Detail: this is what lets one agent supervise others, which is how Manager Ave works. The value for a stakeholder is that Eva plugs into whatever else the organisation runs rather than being a closed box. How that is kept safe is the next slide.
Figures: chat into an existing session, task or project 27 August 2026; drive sandboxes 28 August 2026; run code across tools 3 September 2026; typed judgements 17 September 2026; interactive panels in chat 21 September 2026.`,

  "annual-c06-mcp-security": `Opening an interface to the outside is only safe if who is asking is enforced rather than assumed.
→ Step 1: the three lifetimes drain. A sign-in code lasts five minutes, a working pass one hour, and a renewal thirty days.
→ Step 2: the two gates close. Every request is scoped to one person, and that scope is checked twice — once at the interface and again at the data layer.
Detail: sign-in is the standard flow with proof-key exchange, so an intercepted code is useless without the matching secret. Two independent secrets are used, one for the passes and one for the connection to the data layer, so one leak does not compromise the other. Every request also re-checks that the user still exists, secret comparisons are constant-time, error messages give nothing away, and the endpoints are rate limited.
Figures: authorisation code 5 minutes, access token 1 hour, refresh token 30 days. Security model documented in the repository.`,

  "annual-c07-sandbox-economics": `Every piece of work gets its own cloud workspace, so the discipline is making sure they do not quietly accumulate.
→ Step 1: while the work is alive its snapshot never expires, and only the most recent one is kept.
→ Step 2: the hours count down and the bar drains. When a session or task ends, the workspace is deleted after a 48-hour grace period. Reopening the work inside that window cancels the deletion.
→ Step 3: the beam turns once round the calendar. A weekly sweep clears anything the ordinary path missed.
Detail: short-lived workspaces expire after a day instead. This is also part of why the provider changed: the previous provider's snapshots could not capture running processes or a seeded database, so every start re-ran the setup. Deleting a workspace now actively purges its snapshots rather than trusting the provider to cascade.
Figures: one snapshot retained per workspace, 48-hour grace period, weekly sweep, one-day expiry for short-lived workspaces. Snapshot lifecycle documented in the repository.`,

  "annual-c08-occ": `A slow product looked like a capacity problem and turned out to be the system arguing with itself.
→ Step 1: the symptom. Three days of live traffic, and almost all the load was writes colliding with other writes rather than reads being expensive.
→ Step 2: the cause. Two parts of the system were writing the same row at the same moment, so each one made the other retry.
→ Step 3: the fix, in two figures. Lease renewals fell from about 6.7 writes a second while streaming to roughly one a minute, and live cursor writes from 20 a second to at most 6.7.
Detail: use this slide if anyone asks whether faults are diagnosed or merely patched. The evidence came from searching live traffic, not from a report. Renewals now write only on a phase change or when less than half the lease remains; cursor writes are throttled and ignore movement too small to see.
Figures: retries over three days — presence heartbeats 30, streaming touches 24, lease renewals 18, stall watchdog 17. Fixes landed 24 August 2026.`,

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
