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
→ Step 1: the laptop lifts into the cloud. Say every change was written, tested and shipped from a browser tab.
→ Step 2: the three counters and the source line arrive together. Use the source line to answer the authorship question before it is asked.
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
Detail: do not read the grid. Pick two the room will care about and move on — Manager Ave, an agent that runs your other sessions, and works on your phone, which is what made the tool usable away from a desk. The 94% figure is the loading shimmer's main-thread cost after the September animation work, and it has its own slide in the annual deck.
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
→ Step 2: mistakes become cheap. When a change can be remade in minutes, being wrong stops being expensive.
→ Step 3: everything in sandboxes, managed from chat, and the fleet lights up behind it. Eva's own development already works this way.
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
Figures: empty repository 11 January 2026; 4,705 changes shipped and 1,348 sets of release notes, from Eva's own records and the project's history to 16 September 2026.`,

  "a03-numbers": `Eight months in numbers, headline first, supporting detail second.
→ Step 1: the secondary card. This is the answer to whether the tool is used by anyone else — sixteen accounts, nineteen automations and 504 automation runs.
Detail: the closing rate line is deliberately unglamorous. Nineteen changes a day sustained for eight months matters more than any single peak.
Figures: 4,705 changes, 887 pieces of work raised, 367 working sessions, 1,348 sets of release notes; 16 people with accounts, 19 automations, 504 automation runs, 107 documents. Eva's own records and project history, 11 January to 16 September 2026.`,

  "a04-adoption": `Adoption was not announced, it followed the tool becoming easy enough to use.
→ Step 1: July onward lights and the earlier months dim. The step change is July, when work moved to the cloud.
→ Step 2: the three supporting rows. The tool left one person's hands.
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
Figures: 4,705 changes and 1,348 sets of release notes, all written at the time. Repository and Eva's own records, 11 January to 16 September 2026.`,

  // ---------------------------------------------------------------------------
  // Intro to Eva deck
  // ---------------------------------------------------------------------------
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
