/** Presenter-only notes, keyed by `DeckSlide.id`. Never rendered on the stage. */
const NOTES: Record<string, string> = {
  // ---------------------------------------------------------------------------
  // Friday session deck
  // ---------------------------------------------------------------------------
  "01-title": `Open on the promise: in the next twenty minutes you will see what Eva changed this summer, and what it means for your work.
Detail: the logo breathes on an eight-second loop and the title lands word by word, so let it settle before speaking. Say up front that every number comes from the project's own records, so questions can be answered rather than deflected.
Figures: the window is 12 June to 10 September 2026, taken from Eva's git history.
Next: None of it was built on a laptop.`,

  "03-cloud": `None of this was built on a laptop, and that is what makes the rest of the deck possible.
→ Step 1: the laptop lifts into the cloud. Every change was written, tested and shipped from a browser tab, inside Eva's own cloud workspaces.
→ Step 2: the three counters and the source line. Say each label in full.
Detail: authorship comes from the author field on each change, so a change Eva wrote and a person merged still counts as Eva's.
Figures: 346 changes authored by Eva; 33 bundles finished alone since August; 10 in August against 23 in 1 to 10 September.
Next: Those cloud workspaces used to be slow to start, and that one wait shaped how the whole tool felt.`,

  "04-sessions": `So over the summer, sessions grew from a chat box into a proper workspace.
There's twelve changes on here, so I'll just give you the three themes.
→ July, the workspace filled out: follow-up queue, built-in browser, files explorer, tabs and plan mode.
→ August, it got better at telling you what's going on: inbox badge and chime, mobile, usage limits up front, and auto-archive notices.
→ And September, it got better at recovering by itself, like switching account when a limit hits, and fewer stuck turns.
So by the end of the summer, a session was a proper place to work.`,

  "05-simple-mode": `So for non-engineers, the answer was to take machinery away, not add more explanation.
Simple Mode's just a setting, not a separate product, and it hides the files, consoles, settings and meters, so you're left with the conversation.
The picker on the right is the real component we ship.
→ The long model list became one five-step slider: cheaper, faster models on the left, the strongest on the right, and nothing else to configure.`,

  "friday-b24-abstracted": `In Simple Mode, the only things that matter are what you ask for and what you get back. Everything in between is Eva's job.
→ Step 1: the machinery is tucked away. Which model to use, how hard it should think, its thinking, how much it can hold in memory at once, which connected tools it can reach, and which skills to load: all of it goes inside Eva.
→ Step 2: what is left is the line from your prompt to the result. That is the whole experience.
Detail: each of these is a real setting in tools like Eva, and each one used to be the user's problem. A context window is how much of the conversation and code the model can keep in view; the reasoning level is how long it thinks before answering; MCP tools are the connections to other systems; skills are saved instructions for repeat jobs. In Simple Mode, Eva chooses sensible defaults, Jev suggests the right skill, and the tools are already connected. Be accurate if asked: Simple Mode still offers the one model slider for people who want it, and Advanced view shows every control.
Figures: Simple Mode landed 14 August 2026; the slider replaced the model list on 24 August 2026; skill suggestions by Jev, 21 September 2026.
Next: The other way to save effort is to never explain the same job twice.`,

  "06-automerge": `One click from a person, and everything after it is automatic.
→ Step 1: the pipeline runs through to production. The only human step is marking the work ready; the Grok bot does the rest.
→ Step 2: the nightly routines card. These open their own bundles overnight, so the morning starts with work to review rather than work to start.
Detail: always-on checks were retired in August because the agent had already checked its own work in the sandbox, so running them again added waiting, not safety.
Figures: auto-merge landed 3 September 2026. Six nightly routines: critical bugs, test coverage, docs, code structure, code quality and an 08:00 standup.
Next: Those overnight routines are the next story: work that starts itself.`,

  "07-sandbox": `So if every job gets its own isolated workspace, starting one has to be cheap, and it used to be a coffee break.
→ On top's Daytona, the old provider, and underneath's Vercel Sandbox, and I'll just let it run.
About forty seconds before, under one now, so more than forty times faster.
Those were measured before and after the move, which landed in early July.
That matters cos the whole point of getting off the laptop was a fresh workspace per job, and forty seconds every time would've undercut it.
And we didn't give anything up: the same workspace still has a terminal, a live preview, a desktop and snapshots.
So speed's half of it, and the other half is cost.`,

  "08-more": `A deliberate flood: eight more things from the same three months, none with its own slide.
Detail: do not read the grid. Pick two the room will care about and move on. If asked: suggested edits, where a document change waits for someone to accept it; Claude's built-in skills in the same slash picker; previews that stay put after you leave a session; rebindable keyboard shortcuts; rich link previews, where Figma, Linear, Sentry and PostHog links become chips; editing files in the browser; and reading sibling repos, so Eva can look across your other codebases. The 94% is the loading shimmer's main-thread cost after the September animation work; it has its own slide in the annual deck.
Figures: suggestion mode 10 June 2026; Claude's skills 22 August 2026; lasting previews 14 August 2026; shortcuts 6 August 2026. All eight shipped June to September 2026.
Next: Which leaves the last step of the loop: checking the work, and that is where the bottleneck now sits.`,

  "09-team": `So this is colleagues raising work in Eva themselves, not me raising it for them.
The pattern's the same each time: they describe it, Eva builds it, they review it.
→ Matt, since May, on the referral portal: the AQP list map, the referral dashboard, and referral tabs with cancellation reasons.
→ Zuza, since March, on design and admin, and the heaviest user after me: user management, admin KPI dashboards, and polish on cards, badges and tables.
→ Kezia, since May, on the referral portal and domiciliary care: exports and audit trails, broker and borough filters, and automated decline and expiry emails.
→ Krzys, since July: eProcurement evaluation and moderation, KPI fixes, and a planned move of the backend to Effect.
→ George, since September, on testing: checking assessment outcomes, auto-archiving and new emails in their own sandboxes, and speeding up Referral Portal loads.
→ And me, on product since January: the domiciliary care and nursing home SUPA archives, and eProcurement fixes.
So that's 400 pieces of work raised by colleagues, up to the end of October.
So what did all that actually change for the organisation?`,

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
Next: Eva already has the answer to that queue; here is how it works, and the goal for CarePulse.`,

  "friday-b19-pipeline": `So on Eva, dragging a task into code review is now the last thing a person does.
→ The task moves from In Progress to Code Review, and that one move wakes up the Grok bot.
→ Then the bot applies the database changes, deploys the backend, then merges the pull request.
Database first, so new code never runs against a database that isn't ready yet.
The task moves itself to Merged, and the new button's live on the page.
The board and page are an illustration, not a recording, but Eva's worked like this since September.
→ The goal's the same for CarePulse: the moment a task goes to code review, it's on the CarePulse repo a few minutes later.
That's a goal, not a date, and "a few minutes" is the target, not something I've measured.
It needs the model checks first, and a person signing off anything risky.
And making those checks good is where the chat feedback comes in.`,

  "12-future": `Three shifts to expect, each already true inside Eva rather than predicted.
→ Step 1: more automations. Routine work runs on a schedule or a trigger, and people set direction rather than tasks.
→ Step 2: mistakes become cheap. When a change can be remade in minutes, being wrong stops being expensive. Try more, worry less.
→ Step 3: everything in sandboxes, managed from chat, and the fleet lights up. Eva's own development already works this way, and the Grok bot merges its changes. Next, the same for all our work.
Detail: say plainly that this is a direction of travel, not a plan with dates. Nothing here is a commitment. The fleet picture is one person, many agents, each in its own sandbox.
Next: So if the machines do more of the doing, what is left for us?`,

  "friday-b25-ask-judge": `When the model can do the doing, two skills are left, and they belong to everyone in the room, not only developers.
→ Step 1: knowing what to ask. A clear request, with what is wrong today and what good looks like, is most of the work.
→ Step 2: knowing how to judge the answer. Looking at the preview and saying "that is right" or "that is not what we need" is the other half.
→ Step 3: and that matters more each month the models improve, because the doing gets cheaper and the asking and judging do not.
Detail: this is the bridge from Eva's features to people. Every feature tonight serves one of these two halves: Jev's prompt check helps you ask, previews and reviews help you judge. Present it as an idea, not a quotation.
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

  "15-closing": `So one last thing: this whole deck was built in Eva, by Eva, the same way everything else this year was.
If you take one thing away, it's that the tool got good enough to build its own presentation.
So yeah, that's pretty much it, thanks for listening.
Happy to take any questions.`,

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
Next: When the work is several jobs, it becomes a project.`,

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
Next: Bigger jobs start with writing things down, so documents now live inside Eva.`,

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
Next: And once a week, Eva writes up everything that shipped.`,

  "friday-b11-skills": `A skill is a command someone has already written down, so nobody explains the same job twice.
→ Step 1: the picker opens out of the composer and the commands stagger in. There is nothing to remember: type a slash and choose.
Detail: skills are turned on per codebase from Settings, with no change to the code, and then appear for everyone in it. Claude's built-in skills joined the same picker a fortnight later. The six on screen are real commands from this codebase.
Figures: Eva's own skills landed 6 August 2026; Claude's built-in skills joined the picker on 22 August 2026.
Next: And sometimes Eva can guess what you will ask next.`,

  "friday-b23-predictions": `When Eva finishes a reply, it guesses what you will probably say next, so the next step is often a single key.
→ Step 1: the prediction appears in the empty message box as grey text, in place of the usual placeholder.
→ Step 2: press Tab and it becomes your message. You can edit it or send it as it is.
→ Step 3: the rules. It only appears when Eva is waiting on you, it reads the recent conversation to make its guess, and it never sends anything by itself.
Detail: this is an experimental setting, switched on under Settings, Experimental, Composer predictions. A small, fast model reads the last 30 messages and suggests one short line. It makes one guess per reply and remembers it, so clearing the box shows the same guess again without asking twice. It stays quiet when the turn failed, is still running, or Eva asked you a question. The chat on screen is an example. It is a writing model, not Jev, because it has to produce words rather than score them.
Figures: experimental flag added 10 October 2026 (Eva pull request 932). Suggestions are capped at 280 characters. Source: Eva git history and code.
Next: So far, you have done the asking. From here, Eva starts to work on its own.`,

  "friday-b12-ave": `One permanent chat sits above all the others and keeps track of them for you.
→ Step 1: the lines draw out to six running agents. From this one chat you can list them, look inside, message or stop any of them, across every codebase, and it is told when each finishes.
→ Step 2: two report back with a tick. You do not go looking; finished work comes to you.
Detail: it started as a master chat that could also write code, and that was the wrong shape: a supervisor that keeps editing stops supervising. Six days later it was renamed Manager Ave and limited to supervising.
Figures: the master chat landed 18 August 2026; it became Manager Ave, restricted to supervising, on 24 August 2026.
Next: Once the work is finished, getting it live now takes one click.`,

  "friday-b13-reliability": `So things still go wrong; what's changed is how long you're left not knowing.
Look at this first card: before, a dead agent would sit there showing Working for up to two hours.
→ Now a watchdog closes the turn within minutes and keeps whatever was already written.
→ If a turn stalls before it's written anything, it tries once more on its own before anyone's told.
→ And if you hit your usage limit, the chat says so, says when it resets, and lets you switch to a teammate's shared account in one click.
Under all of it, a turn's lifecycle is a state machine, so it can't end up in an invalid state, which is exactly what kept happening before the Q3 clean-up.
So the work went into making errors preventable, and when you do hit one, you can carry on.
So reliability's one kind of trust, and the other is who can see what.`,

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

  "friday-b22-weekly-changelog": `Once a week, Eva tells everyone what changed, in plain English, without anyone writing it.
→ Step 1: the email opens. This is the real template Eva sends, with example text. Sections for new features, things that got faster, and fixes, each a short sentence a non-developer can read.
→ Step 2: the facts. It runs every Monday morning by itself, Eva writes it from what shipped that week, and it has gone out 35 times since April.
Detail: the Eva Weekly Changelog is an ordinary automation, the same kind anyone can set up. Each Monday at 03:00 UTC it reads that week's entries in Eva's internal changelog, rewrites them in plain English, and emails it to everyone who has email notifications switched on. The same text appears as a pop-up in the app the next time you open it. The bullets on screen are an example in the real format, not a real edition.
Figures: 39 runs, 35 successful, first run 11 April 2026, latest 12 October 2026; schedule Monday 03:00 UTC. Source: Eva production records, read 15 October 2026.
Next: Underneath much of this, one small model makes the small decisions.`,

  "friday-b20-jev-what": `So the point of Jev is that it never writes anything, it only judges.
→ A typical model writes new text back, and the wording changes every time, so it's hard for software to act on automatically.
→ Jev scores each item against one condition, here "is this urgent?", I set the line, and Eva acts on anything above it.
→ So it's just your data, plus a condition, gives a score for each item, and cos the question's fixed, the same item gets the same judgement every time, which is what makes it safe to automate.
→ Each check costs fractions of a penny, by our own estimate, and comes back in under a second, so Eva can run it on every item, every time, not a sample.
The items and scores here are just an illustration, not a real call.`,

  "friday-b17-jev": `Ten small decisions inside Eva, all made by the same model.
→ Step 1: the three you will notice. Before a quick task runs, Jev checks the prompt says where the change goes, what should happen, and what is wrong today, and nudges you if not. As you type, it picks the skill that fits. And when an agent has a question for the team, Jev picks who should answer it, one yes or no per teammate.
→ Step 2: seven more. It tags tasks, sorts the overnight findings by severity and spots duplicates, decides whether an @-mention needs an email or just an inbox row, lets any agent ask its own questions through Eva's evaluate tool, flags changes in a turn that nobody asked for, lays out the interactive panels agents show in chat, and picks the emoji reactions that fit a comment.
Detail: each card shows the question Jev is given, shortened from the code. Real thresholds differ by use: tags at 60%, duplicate hints at 70%, the draft nudge below 50%. Teammate routing sits behind the Ask teammates experiment and is reached by agents through the ask_teammate tool; if Jev is down or picks nobody, a keyword match takes over. Every use fails safe: no answer from Jev means Eva carries on as it did before.
Figures: evaluate tool, task tags, findings triage, draft readiness, mention urgency and skill suggestions, 21 September 2026; scope check and chat panels, 22 September 2026; emoji reactions, 26 September 2026; teammate routing, 12 October 2026. Source: Eva git history.
Next: And it has started to appear in CarePulse too.`,

  "friday-b21-jev-carepulse": `So CarePulse's first use of Jev is the PID checker, flagging personal details as a broker types them into a referral form.
→ Say the broker types a note that names someone and gives a phone number.
About a second and a half after they stop typing, Jev scores the field against "could this text identify a specific person?", and if it's over the line the field turns orange with "May contain personal details".
The example's made up, it doesn't identify anyone.
→ The safeguards: it only warns, it never blocks posting, zero data retention is requested, and if Jev's unavailable, fixed pattern rules for things like NHS numbers and phone numbers still run.
The 50% line is our own assumption, so we'll review it if brokers report false alarms or misses.
It went into CarePulse in October.`,

  "friday-b18-limits": `So this is my view, not a measured law: the models keep getting better, but the problems we wrote about in February were still the ones we wrote about in September.
→ Each step on this ladder is a new model added to Eva, ten of them from April to September, from Anthropic, OpenAI and xAI, and it shows when each one arrived, not how good it is.
→ These four lines run from each problem's first mention in our changelog to its latest: it loses the thread, it gets stuck, it needs a human guard, and work waits for review.
Three were on record before the first model on the ladder even arrived, and all four were still being fixed in late summer.
In March a quick task hung on "Generating response", and in September we still had a turn left stalled.
The lanes show what got written about, not how often it happened.
→ So if better models alone fixed these, the lines would end, and they don't.
To me that suggests fully automating software development is nearing a limit, and the work left is judgement, review and the systems around the model.`,

  // ---------------------------------------------------------------------------
  // Bee deck
  // ---------------------------------------------------------------------------
  "bee-01-title": `So, this is Bee.
→ It's a small app I built that sits at the top of your screen during meetings.
It's honestly just something I've been playing around with.
It listens to the conversation, and when something comes up that you've already got notes on, it finds them and shows you, right there.
→ So the short version — it listens to your meeting and finds what you already know.
And it's not a meeting bot either — nobody else in the call can see it, it's just on your own laptop.
Let me start with why I built it.`,

  "bee-02-problem": `So I'm pretty sure everyone's been in this meeting.
→ Someone goes, "Last time we agreed something on the provider onboarding. What was it?"
And you know the answer's somewhere — it's in your notes, or in last meeting's summary.
→ So you start searching by hand, typing "provider… onboarding… notes…", and your notes are all over the place.
And meanwhile the clock's running, and everyone's just sat there waiting for you.
So the problem isn't that the answer doesn't exist — it's finding it in those ten seconds while everyone's waiting on you.
And that's exactly what Bee's for.`,

  "bee-03-notch": `So this is where Bee lives — a small bar at the top centre of your screen, kinda like the notch on a phone.
→ During the call it's just listening.
→ Then when it hears something it can actually help with, the bar grows into a short answer, and it tells you which note it came from.
It's only ever one or two short tips, never a wall of text, cos you're meant to be in the meeting, not reading.
So how does it get from hearing something to showing you the answer?`,

  "bee-04-listens": `So it's three steps — it listens, it finds, it tips — and it all happens in about the time it takes someone to finish their sentence.
→ First, it hears.
Alex says something like "the provider onboarding we talked about last time", and Bee picks that phrase up.
→ Then it finds.
It searches through your own notes, and a small fast model called Jev ranks which ones actually match.
So here it's Provider call.md that lights up — not just any note with "provider" in it.
→ And then it tips.
Another model turns that best match into one short line in the bar, and shows you the note it came from, so you can check it.
So you didn't have to ask it anything — it heard the question and had the answer ready.
But what if the answer's not in your notes at all?`,

  "bee-05-web": `So when the answer's not in your notes, Bee just looks it up on the web.
→ Say someone in the meeting asks a question nobody knows off the top of their head.
Bee hears it, searches, and puts a short answer in the bar.
→ And underneath you get the sources, so you can see exactly where it came from and click through to check.
→ Then it just moves on to the next one, and the next.
I'm not gonna read these out — honestly I don't know half of this stuff myself, which is kinda the point.
You don't need to be the expert in the room — Bee looks it up and shows you where the answer came from.
And having Bee would have been useful, and saved time, during a recent one-to-one with Krzys.`,

  "bee-11-real-meeting": `So this one's a real example — it was just a casual chat with Krzys.
→ I asked whether Convex can run more than one local deployment, so Eva could use it.
On the left is what I actually did — one Google search after another, skimming the results each time.
On the right is what Bee would have shown me: yes, each copy of the project gets its own, and agent mode starts one with no login.
→ Then I asked whether you can pass MCP servers into the Claude Agent SDK.
Same thing again — more searching by hand, while Bee would've just said yes, through the mcpServers option.
→ So Bee would have answered before I'd even finished typing.
Instead, I did it the old-fashioned way — typing, while Krzys sat there waiting.
And then when the meeting ends, the summary just writes itself.`,

  "bee-06-summary": `So normally, after a meeting, someone has to sit there and write up the notes.
→ With Bee, the summary just writes itself — the whole meeting folds down into one short summary, on its own.
→ You get the decisions, in plain sentences.
→ The action items, each with an owner, so it's clear who's doing what.
→ And it's saved as a note — so next time someone says "last time we…", Bee can actually find it.
→ And if you missed the meeting, someone who was there just forwards you that file, and you're caught up on what was decided and who's doing what.
So that works great for one person, but it's even better as a team.`,

  "bee-07-teams": `So this is Teams mode, where everyone's Bee works together.
Picture the room from above — three people, each with Bee on their own laptop.
→ Alex speaks, and only Alex's Bee hears it — that's the ripple — and the line goes straight into the team summary.
→ Then Jo, then Sam, and so on — and every line lands in that person's colour.
That's why everyone in the meeting needs Bee running on their own laptop.
→ Cos each line comes from that person's own microphone, so the name's never a guess.
So you might be thinking — Teams already does transcripts, so what's the difference?`,

  "bee-14-compare": `So Teams already makes a transcript, so it's fair to ask what Bee actually adds.
This is just how each one works.
→ What was said — to be fair, Teams gets the names right, but it mishears some of the words, so the transcript isn't always what people actually said.
Bee takes each line from that person's own mic, up close, so it's working from clear audio.
→ During the meeting — Teams gives you a live transcript to read, Bee gives you one or two short tips from your notes and the web, only when they help.
→ And your notes — Teams keeps transcripts in Microsoft 365, Bee keeps your notes and summaries on your own computer.
So Teams is fine as a record — Bee's more about helping you while you're actually in the conversation.
Which brings up the obvious question — what about privacy?`,

  "bee-08-private": `So privacy — Bee was built to be safe to just leave on.
→ Say you start sharing your screen — the bar just disappears from what everyone else sees, so you're never accidentally showing a tip.
→ And there's four things it promises.
No transcript on screen.
It hides when you share your screen.
Your notes and summaries stay on your computer.
And nothing joins a meeting unless you click.
So you're always the one in control of what it does.
And after "is it safe", the next question's always — what does it cost?`,

  "bee-13-cost": `So what does it cost us? Basically nothing extra.
→ Our Teams plan comes with $500 of AI usage every month, included, at no extra cost.
→ And that's what Bee runs on — turning speech into text, finding the right note, and writing the tip.
That allowance is meant for exactly this kind of project.
So trying it doesn't cost us anything we're not already paying for.
And it fits in with the connectors you already use.`,

  "bee-09-tools": `So Bee plugs into the connectors you already use.
→ Eva for the team's work, vmem for your history, or basically any app that speaks MCP, which is just a standard way for AI to plug into other apps.
→ And it reads the meeting details from Outlook and Teams on your own computer, so it knows which meeting you're in and who's in it.
So you don't have to tell it anything — it already knows the context.
Now let me step back for a sec — why's Bee built this way?`,

  "bee-12-background": `So here's the bigger idea behind it.
Look at the Grok bot, Muse, Instinct and Dots — they've exploded in usage, and I think it's cos of how easy they are to use.
They just work, and they do most of it in the background.
→ Think about an agent you have to steer.
You pick the model, how hard it should think, the skill, the MCP tools, you watch the context window fill up and get compacted, you read the thinking, parse paragraphs of output, and then steer it again.
It only works while you're sat there watching it.
→ Now compare that to the Grok bot.
You send it one message, and it just does the work in the background and sends you updates, like a co-worker would.
No skills, no MCPs, no traces to read.
→ And Bee's that same idea, but for meetings — it listens, searches and reminds you, without you asking or steering it.
→ And we've taken the same lesson back into Eva.
In Simple Mode, which has been enabled by default for everyone for the past few months, you don't think about starting or stopping a sandbox any more — it wakes up when you send a message, and goes to sleep when it's idle.
So yeah, this has been one of our biggest product learnings: the less an agent asks of you, the more you actually use it.
So, one thing I'd ask.`,

  "bee-10-close": `→ So the one thing I'd ask is, just try it in your next meeting.
It runs on Windows and Mac, and if you want to help test it out, just message me after.
Bee's still in progress, but what do we think — would you use Bee?
→ So yeah, that's pretty much it — any questions?`,

  // ---------------------------------------------------------------------------
  // Annual CDM deck
  // ---------------------------------------------------------------------------
  "a01-title": `So this is my annual CDM review.
Most of it's Eva, which I've been building since January, plus CarePulse and four side projects: vmem, flowtape, Redline and Bee.
And at the end I'll map it all back to the senior engineer framework.
So let's start with Eva, cos it's the biggest bit.`,

  "a02-origin": `So that's the story so far on one line: ten months, five moments.
It starts with an empty repository on 11 January.
→ First session on 24 January, first quick task on 1 February, so about two weeks from nothing to usable.
Those are from Eva's records of the first ones actually created, which is why they're later than the week-one dates, cos those are when the code landed.
→ Then in March the work moves to the cloud, which is the fix for the laptop problem I started with, and in August Eva starts opening its own work.
→ And the line just keeps running to today, cos it's still going.
So that's how we got from an empty repository to most of how we build software.`,

  "a03-numbers": `So this is the year's output, from Eva's own records and the project history, up to this week.
Top row: 5,673 changes shipped, 1,015 quick tasks, 767 sessions and 1,891 sets of release notes.
That's about eighteen changes a day, every day, since January, and holding that pace matters more than any one big week.
→ But the real question is whether anyone else uses it, and that's the second row.
16 people with accounts, 19 automations that have run 706 times, and 125 documents written in it.
So it's not just built, it's used.
But those sixteen people didn't all turn up at once, and the timing's interesting.`,

  "a04-adoption": `So nobody announced Eva to the team; people just started using it once it got easy enough.
This is sessions started per month this year.
The early months are small, and June's a genuine zero, not missing data.
→ Then from July it lights up, which is when workspaces moved to Vercel and started in under a second.
From July, monthly sessions roughly tripled, and they've kept climbing since.
November's only up to this week, and it leaves out the old quick tasks we moved into sessions on 11 November, cos counting those would make the bar look much bigger than it really is.
And I'm calling out the June gap on purpose, cos being upfront about it is what makes the rest believable.`,

  "a06-impact": `So the easy read is that AI makes developers type faster, but that's not what changed.
Three things changed, and none of them's typing speed.
→ First, who can ask: it used to be a request, a queue and a developer, and now anyone just describes what they need.
→ Second, where the work runs: it used to be one laptop at a time, which is exactly the wall I hit at the start, and now it's cloud workspaces running loads of jobs at once.
→ And third, what a person actually does: you used to write every line, and now you direct the work and guard the bits that are hard to undo.
That third one matters most, cos it's what makes the other two safe.
So Eva was built to remove the wait between someone needing something and it being built.
And behind all that sits the first big platform decision.`,

  "a07-how": `So here's the whole loop.
→ You describe it in a chat, Eva builds it in its own cloud workspace with a live preview, and you try it, ask for changes, and it goes live when you're happy.
It's all in a browser tab, so nothing to install, no ticket and no handover.
The preview's the bit that matters, cos it's the first point a non-developer can judge the work themselves.
→ And there's four ways in: sessions, quick tasks, projects and automations.
So you pick by the size of the job, not by whether you're technical.`,

  "annual-e02-carepulse": `So CarePulse kept shipping all year, most of it raised and built through Eva, and everything here went into main, quarter by quarter.
→ December to February: notes on the AQP list, including Sussex, eProcurement evaluation and the moderation view, a run of fixes for evaluators, and the sandbox setup so the team could work in the cloud.
→ March to May: mobilisation status on the provider homepage, CQC notifications filtered to AQP homes only and cleared when you dismiss them, and a tidy-up of the resource centre.
→ June to August: the domiciliary care quality dashboards, with tabs, an admin page for responses, a location breakdown and exports, plus SUPA archives for nursing homes and domiciliary care, and the referral portal dashboard and filters.
→ September to November was the busiest stretch: the provider homepage redesign, the central contact overview, the SUPA tracker, the Jev PID checker on the care package finder and the referral portal, and comments on the nursing home quality dashboard.
So all the tooling was in service of this work, not instead of it.`,

  "a09-design": `So the biggest change of the year was swapping the engine every workspace runs on, and I designed it on paper first.
Ripping it out in one go would've left everyone stuck mid-job if it went wrong.
→ So it went in six phases over July: a spike, a neutral contract, the old provider behind it, the new one, the switch-over, then the old code deleted, with nobody stuck mid-job.
→ And this is the number the spike was written to test: a 6GB workspace restores in about a third of a second, where before it took minutes.
It was an explicit go or no-go, and the answer was go.
→ And the options I didn't take are kept too: seven shelved plans still written up, and two rejected animation options with the measurement that ruled them out, one 11% worse and one doing five times more painting.
I also wrote down at the time that the terminal, desktop and named volumes were deferred on purpose, not forgotten.
But design cuts down faults, it doesn't remove them, so here's what I do when something breaks.`,

  "a10-debugging": `So three real production faults, and the same rule each time: symptom, actual cause, then a test so it can't quietly come back.
First: you signed out, and you were still signed in.
Two cookies with the same name, cos under the newer rules a partitioned and an unpartitioned one count as two, and the browser sent both, so the fix deletes the old one first.
→ Then a colleague's messages went unanswered for two hours.
That was three defects: a liveness check that matched its own wrapper, a kill that left a stuck process holding a file lock, and a launch racing its own ready marker.
So three defects, three tests, each with its own name.
→ Then a three-minute wait, even though the workspace itself resumed in eight seconds.
It was a warm-up on a stale model setting holding the launch lock, so now anything waiting just waits, re-checks and restarts.
→ And nobody reported this last one: 65 restarts against 146 launches in 24 hours, which I found by searching live traffic.
And that same habit turned up a bigger problem in the database.`,

  "a11-craft": `So this is what measuring looks like in practice.
These bars came out of the animation work in September.
The loading shimmer went from 32.6 milliseconds of work a second to 1.9, its repaints from 240 a second to none, and a realistic chat screen from 64 to 45.5.
But the method's the bit I'd defend: a fresh tab every run, medians of three, and paused-frame comparisons to prove it still looked the same.
And the limit: the test machine had no GPU, so only the main-thread figures carry over.
→ So these are the habits behind the numbers: live traffic's searchable, decisions are written down, there's one design system, and accessibility problems get fixed.
→ And the honest gap is page scores: there's a Lighthouse setup, but no scores recorded in the release notes yet, so it's set up, not a habit.`,

  "a12-quality": `So the standard's enforced by the machine, cos a standard that relies on people remembering isn't really a standard.
These are from the repo in mid-September: 303 test files, 79 contract tests, 46 nightly runs that went back and filled in tests, and 4 custom rules.
The contract tests matter most, cos they fail when two parts of the system drift apart, and one of them checks that the three chat surfaces stay the same.
The custom rules only exist where an off-the-shelf rule couldn't say what I wanted, like no unchecked JSON parsing and no double casts.
→ And the written rules: unsafe type shortcuts and certain React patterns are banned, data's checked at the edge, and every change needs a type check and release notes.
→ So a test that's permanently red is a broken test, cos once people stop reading the results, the tests protect nothing.`,

  "a13-people": `So every incident here was found by a colleague, not by a test, and each one changed how I work.
In August a colleague's session sat on Working for two hours with their messages unanswered.
A stuck runner was holding the lock to start a new one, while the watchdog kept extending its own deadline.
→ In September two of a colleague's messages were dropped, cos a fix had landed on sessions only and not on the other chat screens.
So "chat is one surface", sessions, quick tasks and projects sharing the same chat, is now written into the repo.
→ Also in August, the design tooling didn't survive a workspace resume, and that was found in a colleague's own session.
→ Each one got fixed, pinned with a test, and written down.
And those standards are written for people and for agents: repo rules, guides for the interface, the data layer and security, and release notes on every change.`,

  "a14-users": `So most people opening Eva aren't engineers, and nearly every call on this slide comes from that.
Simple Mode hid the reviews, diffs and token meters, so you're left with the conversation and a preview.
The model list became one slider, cos even the trimmed list was still the advanced bit.
PRD became Plan, cos that's what people actually meant, and the daily summary went plain language, with a hard ban on file names and commit hashes.
→ Then three more: every screen usable on a phone across two audits, shortcuts visible and rebindable, and the "pick something from the sidebar" pages removed, cos on a phone the sidebar's a closed drawer.
→ None of this made the tool cleverer, it just made it usable.`,

  "a08-ahead": `So Eva now finishes work faster than we can check it in, so the hard part's no longer building the thing, it's deciding and checking either side of the build.
These are the four things for next year.
→ Automate the release is the one lighting up: marking work ready should be the last human step, like it already is for Eva itself.
Guard the irreversible, so attention goes on data, permissions and anything that's hard to undo.
Software that fits us, tools shaped around how we work, not the other way round.
And many agents, one coordinator, which I've literally just started planning: each thread gets its own agent, branch and workspace, and the main chat becomes the coordinator.
The hard bits are the merge order, keeping cost down when five threads means five workspaces, and stopping the main chat drowning in updates.
None of these are dated commitments, they're the direction.
→ So the question stops being how fast can we build it, and becomes how fast can we decide.`,

  "annual-s01-eva": `So, Eva.
The reason it exists is that running coding agents locally on my laptop just didn't scale.
The laptop overheated, agents crashed, and as soon as I ran a few in parallel they clashed: same checkout, same files, same ports.
So the work had to move to the cloud, with each job in its own isolated workspace.
That's the idea the whole platform's built around, and it's now what the team builds with.
And it all started on one evening in January.`,

  "annual-s02-carepulse": `So that's Eva, and now the second section: CarePulse.`,

  "annual-s03-vmem": `So the side projects: all four were built in my own time, alongside Eva, with no company time spent on them.
First, vmem, my BSc final-year project at City St George's, University of London.`,

  "annual-f01-vmem": `So every AI tool starts from scratch, and you end up explaining yourself again and again.
vmem means you tell it something once, and any AI tool can recall it.
→ It saves chats, files and notes in one place, links the people and projects they mention into a graph, and any AI tool can read it over MCP.
→ It's live and hosted, with a Chrome extension, and Jev ranks what it recalls.
It was my final-year degree project, and it got 80%, done alongside full-time work on Eva, so it took a lot of time management.`,

  "annual-s04-flowtape": `So next, flowtape.`,

  "annual-f02-flowtape": `So writing a journey test as code takes ages, so most journeys never get one.
flowtape turns a journey you click through into a test an agent can run.
→ It records the journey, turns it into a prompt an agent can replay and explore, and hides passwords and personal details like NHS numbers before anything's saved.
→ So tests come from clicking, not writing code, and it's published on npm.`,

  "annual-s05-redline": `So next, Redline.`,

  "annual-f03-redline": `So checking a change by clicking through by eye, it's easy to miss a page.
Redline shows what a change did to every page of an app.
→ It builds the app before and after the change, screenshots every page at both, and points to the files most likely responsible for what changed.
→ So visual checks are done by a tool, not by eye, it's used in Eva's own development, and it's published on npm.`,

  "annual-s06-bee": `So the last side project, Bee.`,

  "annual-f04-bee": `So someone asks something in a meeting, and you're stuck searching your notes while everyone waits.
Bee answers during the meeting, from your own notes and the web.
→ It's a desktop app for Windows and Mac that listens in, and finds your own notes and short answers in a small bar at the top of the screen.
→ I presented it to the company this month, and it's still in progress, so it's open to anyone who wants to test it.`,

  "annual-g02-checks": `So the business team shouldn't have to ask a developer or read the changes to know if work's ready.
→ First, proof: screenshots of the change and a walkthrough video, so anyone can see what actually changed.
→ Then the audits, security, code review and code clean-up, and each one just gets a tick once it's run.
Same idea as Simple Mode: take the machinery away, keep the answer.
But simple by default doesn't mean everyone's stuck with it.`,

  "annual-g01-parked": `So not everything built in Eva was kept, and knowing when to park something is a lesson in itself.
→ Testing Arena: one agent tries to break the interface, and another examines the code for issues.
It needs heavy AI usage, so it wasn't feasible at the time, and it can be looked at again when there's spare usage.
→ Documents: one place in Eva for PRDs and other docs, kept beside the work.
That one needs more work before it pays off.
→ So parked isn't dropped, the idea just waits for the right time.
So where's all of this heading?`,

  "annual-g03-skills": `So without guidance the agent invents its own way every time, and you end up with five different styles in one codebase.
So I wrote CarePulse skills the agent reads before it touches that part of the code.
→ These are mine, one per part of how CarePulse is designed: Effect, tables, permissions, filters, RPC and backend calls, each matching how the codebase is actually built.
→ For design review, I got Zuza to write one, so the agent follows CarePulse's design standards too.
→ So the agent writes code the way the team would.
But skills only shape the code, the understanding still has to come from me.`,

  "annual-g04-feedback": `So Eva now learns from how people react to it, and cos we own the data, we can actually act on it.
→ Captured: Eva leaves feedback on its own when someone's clearly frustrated or clearly happy in a chat, and anyone can give a thumbs up or down on a reply.
→ Reviewed: it all lands on one Feedback page, so we can see what went wrong, what we need to add, and what to simplify in the codebase.
Those two went live at the start of November.
→ Next, the plan's to turn that data into new lints and Jev checks, so the agent writes code we're happy to just merge.
That's not built yet, but the first one's queued: Lauren's "no comments" skill, applied across CarePulse, then turned into a lint rule.`,

  "annual-g05-today": `So this is where the business team sees what changed in an app, in plain words, without asking a developer or reading code.
→ Today, an automation writes a stand-up for each app every day: what merged into main, so what actually went live, and what's new in the app.
That's been running since August.
→ And in progress, I'm rebuilding it as a live dashboard, not once a day: what needs you, what's in progress, and what's merged.
So the business team gets a much better view of where every project's at, without having to ask anyone.
So that's the product; what did the year actually teach me?`,

  "annual-g06-understanding": `So AI's taken away the coding, but not the understanding, and it shouldn't.
These are four CarePulse changes from the last few months, what each looked like versus what it actually took.
→ The provider homepage looked like a few prompts, a redesign with a few new features like per-contract suspension.
But that session ran for over a month, with around 250 of my messages and about 96 questions, cos I kept questioning the AI on how every part was built, and what I was actually trying to do.
→ The central contact pages, same again, I was asking Matt questions the whole way through.
At one point the AI filtered homes by role, and I reversed that as a product decision, so everyone sees all their homes, cos the whole point of the page is to centralise.
→ Never events looked like one more graph, but the number wasn't in the backend's data at all, and an old view read it by fixed position, so it needed a backend change merged first.
When the AI missed that, I asked "why did you not do this in the first place?", and we saved the lesson as a rule.
→ The Jev PID checker could probably be built in one prompt now it exists, but the questions, trade-offs and decisions along the way couldn't.
One of my questions was "so this entire time you weren't using Jev?", which exposed a silent fallback, and after the fix Jev got 59 out of 59 test cases right, where the old pattern rules missed 22 of 39.
→ That understanding is why those pull requests got to a state where I only skimmed the code.
Different AIs find different things, Amp and Codex both found issues, so the next step is checks good enough that we don't need to read it at all.`,

  "annual-g07-live-data": `So getting numbers out of the database used to mean asking a developer and waiting.
Eva's connector opened that up to everyone.
→ Anyone can connect Claude to Eva and ask about live data, so people build their own dashboards and KPIs.
→ Matt's the example: he designed a dashboard with Claude, uploaded it to Eva, and it's now live in CarePulse as the referral activity page.
→ So it's read-only, it's live, and there's no developer in the way.
It goes through a read-only copy of the database, and every request's scoped to the person asking.
Cos opening data up to everyone is only safe if the locks are designed in from the start.`,

  "annual-g08-judgement": `So here's another one that looks simple: travel-time search on the referral portal, finding homes by how long it takes to get there.
→ Google's APIs: when I asked, the AI sized it at about 685 to 1,330 dollars a month, and its first recommendation was still to keep Google.
Those are the session's own estimates against real referral volumes, not a bill, but it seemed quite expensive, so I pushed for alternatives.
→ One TfL API key for public transport is 500 requests a minute, shared by everyone, so several people searching at once would hit the limit.
TfL's own developers told me several keys can be used at once, so we use two, paced.
→ Mapbox for driving sits inside its free tier: the first 100,000 lookups a month are free, and we expect about 73,450.
The Google code's still there so we can swap provider if we need to, and it shipped in October.
→ The AI never raised either problem on its own, cost and rate limits only came up cos I put them in the brief and kept pushing.
So it's still up to a person to think through these edge cases and make the call.`,

  "annual-g09-catching": `So a lot of my job now is asking the AI the question it didn't ask itself, and these three are in my own words from the chats.
→ In October, a production database error on CarePulse: the AI wanted to change how connections are shared, and I asked if that was really right, cos Prisma's own example does what we already had.
It admitted it had no evidence, and the next question found the real cause: about 22 database calls for every page view.
→ On Eva, I asked, honestly, had our tests ever stopped a regression.
Hundreds of test files had never run in CI at all, so we deleted the fake ones, 21,708 lines, kept the real testing, and the CI check went from 83.6 seconds to 16.6.
→ Home care tiers on CarePulse, where the AI said no backend change was needed.
I asked whether it actually saved in the backend or was just the frontend, and had it tested against staging before I believed it.
→ So the right question is still the human's job.
And the system includes the packages we depend on.`,

  "annual-g10-repos": `So Eva isn't just used to build Eva.
→ Every codebase we work on is set up in it: Eva itself, CarePulse v3, CarePulse v2, eProcurement, and the cost model.
So anyone can open a session or a quick task on any of them, and the setup's already done.`,

  "annual-g11-configurable": `So unlike Amp or Cursor, Eva's audience isn't only developers, so it had to be simple by default and configurable for the people who want more.
→ First, what's done for you: one checkbox to record proof, audits in the background, pull requests that open themselves and keep their status up to date, and titles, tags and PR descriptions written for you.
And quick tasks and sessions close and archive themselves when the work's done.
→ But not everyone wants all that, so each person can turn things on or off under Experimental settings.
A lot of these came from changes Krzys wanted: turning off auto-archiving, choosing whether pull requests open automatically, and Claude-style activity steps.
There are 19 switches in all.`,

  "annual-g12-unlocked": `So one personal bit, cos the switch to AI has honestly been amazing for me.
→ Before, I had an ideas list of over 40 things, and most of it I had to scrap, cos one person can't build all that, so I just kept filtering it down.
→ Now I work on several at once: Eva, CarePulse and these four side projects.
I haven't opened an IDE in about eight months, and I haven't written a line of code by hand in about six.
Most of what I've learned about AI came from people on X, my biggest source of inspiration, plus Krzys.
And my last few presentations, this one included, were all built with AI, with animations I'd never have had time to hand-build.
They've been well received: people said they understood what I was showing, liked how it was presented, and the animations helped get the point across.
→ I enjoy coding, but I enjoy product building and solving problems through it even more now, and AI's let me push that side to the max.
Compared to last year it honestly feels like I've become a 10x engineer: things that used to take weeks now take days.
I still read the plans, ask the questions, make the calls and pick which ideas ship, but the typing's the AI's, and the list doesn't have to shrink any more.
So I can't imagine going back.`,

  "a15-framework": `So this is the senior engineer framework, Technical, Impact and Collaboration, with the proof under each.
→ Technical: the sandbox move planned in six phases, workspaces from 40 seconds to under one, seven dropped plans kept in writing, write clashes from 6.7 a second to one a minute, and patching Vercel Sandbox and Convex.
Beyond coding: coming up with ideas, finding problems to solve, measured performance work, and user experience and animation.
Impact: the sandbox move from spike to switch in three weeks, and stuck turns fixed once, at the cause.
For process: Eva running many agents in parallel without conflicts, vmem as a company brain, the Redline and flowtape experiments, work to make CI quicker, a Mantine linter, and the Jev score on every message, which was Zuza's idea.
Identifying work: critical warnings from 2 to 0 and high from 48 to 2, and next, automating the release, and for empathy, Simple Mode's five-step slider and the PID checker for referral brokers.
Collaboration: demoing Eva at every dev stand-up for the first two quarters, daily summaries and a weekly changelog for non-engineers, and plans logged in Eva with specs saved in the codebase, Zuza's idea too.
Buy-in for Vercel Sandbox for Eva and Claude usage for Bee, and setting everyone up on Eva and answering their quick task, session and MCP questions.`,

  "annual-b02-first-week": `So the whole product rests on two ideas, and both turned up in the first four days.
→ Quick tasks first.
→ Then sessions, a couple of days later.
Projects and automations came later, but they're built out of quick tasks and sessions, not alongside them.
So we've never needed a third idea, and everything since has built on these two.`,

  "annual-b05-q2": `So chapter two is where a lot of extra features got bolted on, to make Eva multi-player.
→ Documents got comments, suggested edits and version history, so people could work on the same thing together.
→ Then the projects roadmap, so a sequence of work becomes one thing you can see.
→ And Testing Arena opened up to everyone, so trying out a change stopped being a developer-only thing.
Some of that was bolted on fast, and chapter three is where that bill came due.`,

  "annual-b06-q3": `So chapter three, July to September, was the clean-up: finding the slop that had piled up and making the product dependable.
→ July was almost all the sandbox cutover.
We'd been in the cloud since March; this swapped the engine under every workspace, from Daytona to Vercel, which I'll take apart phase by phase later.
→ August: durable turns, so a long run survives an interruption instead of stalling, plus security work and the design system the interface now sits on.
→ And September: multi-repo sessions, and decision models for classifying work at scale.
So a lot of this quarter was identifying slop and clearing it, not adding new things.`,

  "annual-d01-security": `So signing in was never the problem; knowing whose data you were seeing once you were in was.
The earlier security slide built a new interface locked down, and this one's hardening the old ones.
In August I audited everything, and ownership was checked unevenly across codebases, sessions, tasks, teams, workspaces, snapshots and integrations.
→ So the checks moved into shared helpers, one guard on every door, and any new screen gets it for free.
→ And production dependency warnings went from 2 critical and 48 high down to 0 critical and 2 high.
I hardened sign-in too, like explicit consent and tying refresh tokens to the app they were issued to.
→ Then I checked it all against real production data, not just tests.
And all of this rests on measuring things, which is the skill I've built most this year outside programming.`,

  "annual-d02-design-system": `So without a shared component set, every new screen turns into a fresh argument about how things should look.
These tiles are the library in miniature: four colours, four surface tones and four of the shapes every screen uses.
And the rules are written down: surfaces separated by tone instead of decorative lines, one shadow system, and animations on shared timings.
Two moves in August made it possible: the web app and the browser extension moved to Tailwind v4, and everything switched to a single icon library.
→ So that's 110 files and 18,197 lines, measured in September.
And since October those components ship as shared packages, used across every app, and Eva moved onto them too.
→ So consistency's where you start now, not a clean-up job afterwards.
But a house style only lasts if a machine enforces it.`,

  "annual-d04-frontend-perf": `So waiting's a tax on every change, so I measured three separate waits and cut them.
→ The local build went from 28 seconds to 2.6, which is the wait between making a change and seeing it.
→ The landing page's first download went from 516 kB to 362, the wait a visitor pays before anything shows.
→ And the code checker's false warnings went from 8,862 to none.
Cos a checker nobody reads is a checker that isn't running.
There were smaller savings too, like 489 kB of icons, but these are the three that count.
So speed's one kind of polish, and looking the same everywhere is another.`,

  "annual-d06-abandoned": `So deciding not to do something is design work too, but it only counts if it's written down.
Moving the background workers to another host got dropped cos the new architecture just removed the problem, which is the cheapest kind of cancellation.
→ The new framework I formally assessed, and the verdict's written down word for word: do not adopt.
→ And this is the honest one: unifying design sessions was cancelled, replaced by a mode, and then that mode got removed a month later.
So that's the same question answered, reversed, and reversed again, and owning that is what makes the other two believable.
→ All seven cancelled plans are kept in full, so nobody has to re-argue them from memory.`,

  "annual-d07-lessons": `So these are two sentences from the project's own notes, written during the year, not made up for this deck.
"Most failures are not model failures. They are system design failures."
Everyone's arguing about which model is best, but turns that finish what they start, one guard on every door, the enforced quality bar, none of those are about the model.
→ And: "Autonomy is an infrastructure decision", so how far I can trust an agent on its own depends on what's built around it, not which model I pick.
→ So both point the same way: build the system.`,

  "annual-e03-patch-packages": `So a newer lesson: when a package we depend on is wrong, we don't work around it or wait any more, we patch it, the same day.
→ Vercel Sandbox: any command sent to a stopped sandbox woke it back up, and the package had no way to turn that off.
I want sandboxes to start and stop when I say so, not as a side effect of a user's command.
So I had the AI patch it: a switch to turn auto-resume off, and a way to attach only to a sandbox that's already running.
→ Convex presence: a heartbeat timing out made the clean-up job try to cancel itself, Convex refused, and every timeout threw an error that filled the logs.
The patch skips the cancel on that path and still deletes the record.
Both patches live in the repo, reviewed like any other change and re-applied on every install, and if an upstream fix lands we can swap them out.
→ So a dependency is code we can change, not a wall we wait behind.`,

  "annual-d08-durable": `So a turn would break part-way, and the screen just sat on Working with nothing behind it.
Most of the "Eva's stuck" reports were this one fault.
The debugging slide chased the symptom case by case, and this fixes the cause once.
→ So here the same turn gets interrupted at the same point, and this time it survives and finishes.
Every turn now saves its place as it goes, instead of living in one process's memory.
And it's fenced, so an old turn can't come back and write over the one that replaced it.
→ So interrupted doesn't mean lost any more.
But things still go wrong sometimes, so the question is what you see when they do.`,

  // ---------------------------------------------------------------------------
  // Intro to Eva deck
  // ---------------------------------------------------------------------------
  "annual-c01-providers": `So the first platform decision was not to depend on one AI supplier.
If one puts its prices up, falls behind or goes down, I didn't want us stuck.
On screen is every model in the picker, grouped by provider: Claude, Codex, OpenCode and Cursor.
→ That's four providers and twenty-one models, and it's the real list that ships, as of mid-September.
A session remembers the last model you used, so you're not picking every time.
→ So if one supplier stalls, the work just moves to another, and nobody changes how they work.
But having a choice is only worth it if you can change your mind halfway through a job.`,

  "annual-c03-handoff": `So switching provider's only useful if you don't have to start again.
Each provider keeps its own private transcript, so before this, switching halfway through meant the new one started blind.
We hit this for real: we wanted to move a job from Claude to Cursor models halfway through.
→ Now the whole conversation moves across word for word, here from Claude to Cursor, with a handed-over badge.
Every reply's stamped with the model that wrote it, and on a switch only the turns the new provider hasn't seen get passed across, capped in size and clearly marked.
And the badge keeps the transcript honest about who wrote what.
Now, provider capacity's paid for per person, so the next question is whether you can share it.`,

  "annual-c04-accounts": `So the answer's yes, in two steps.
→ First, each colleague attaches their own provider account once, and their work spends their own allowance.
→ Then an owner can share their account with the team, so capacity's pooled, not bought twice.
And it means the team's work doesn't drain my usage any more.
Sharing's a deliberate choice by the owner, so a new session won't quietly start using a teammate's account.
And if you switch account mid-conversation, you keep the conversation, and the next reply's charged to the right place.
Now, people aren't the only ones who use Eva.`,

  "annual-c05-mcp": `So other tools and agents can drive Eva too, through MCP.
→ The inner ring's reading: list the work in flight and see what each piece is doing.
→ The next ring's acting: message an existing session, task or project, start and stop workspaces, and run code across several tools in one go.
→ And the newest ring: typed judgements, so a calibrated score or category applied the same way every time, and interactive panels drawn straight into a chat.
That's how one agent supervises others, which is what Manager Ave does.
The decision was to make Eva plug into what we already run, rather than be a closed box.
Most of that landed between late August and late September.`,

  "annual-c06-mcp-security": `So letting other tools in is only safe if we actually check who's asking, rather than assume.
The risk is another tool acting as you, so the answer was short-lived passes, checked twice.
→ Every pass runs out: a sign-in code lasts five minutes, an access pass one hour, and a renewal thirty days.
So even if something leaks, it's not useful for long.
→ And every request's tied to one person, checked once at the door and again at the data.
Sign-in uses the standard flow with the extra proof step, so a stolen code's useless without the matching secret.
And there's two separate secrets, so one leak doesn't give away the other.`,

  "annual-c07-sandbox-economics": `So the flip side of one workspace per job is they can't just pile up and keep billing.
→ While the work's going, its snapshot never expires, and we only keep the latest one.
→ When a session or task finishes, the workspace is deleted after 48 hours, and reopening it inside that window cancels the deletion.
→ And a weekly sweep clears up anything the normal path missed.
So nothing keeps billing once the work's finished.
That's partly why we changed provider, cos the old one's snapshots couldn't capture running processes or a seeded database, so every start had to redo the whole setup.
So that's what was built, and now I'll show you how the decisions were made, starting with the biggest one.`,

  "annual-c08-occ": `So the last slide was things breaking, and this one's things being slow.
The obvious move would've been a bigger database, but the system was arguing with itself.
→ Three days of live traffic showed almost all the load was writes colliding, not expensive reads, and these bars are the OCC retries.
→ The cause: two parts of the system writing the same row at the same moment, so each made the other retry.
→ So the fix comes down to two figures.
Lease renewals went from about 6.7 writes a second while streaming to roughly one a minute, cos they now only write when something changes or less than half the lease is left.
And live cursor writes went from 20 a second to at most 6.7, cos they're throttled and ignore movement too small to see.
And under a lot of the "it's stuck" reports there was one more structural fault.`,

  "intro-01-title": `Welcome, and the one line to open on: Eva is a platform for AI agents that actually ship code.
Detail: Eva is an open-source AI dev platform. Say what it is not before what it is. Not a chatbot that suggests diffs, and not an autocomplete. These are agents that clone your repo, run your tests, and open real pull requests. The word lands out of a blur, so let it settle before speaking.`,

  "intro-02-gap": `The gap between an AI demo and real work comes down to three things, and the rest of the deck answers each one.
Detail: context, because the agent needs your codebase, your style and your CI. Execution, because it needs somewhere to run commands rather than only generate text. Review, because you need to see what it did rather than trust a summary. The symptom: context scattered across chat windows, browser tabs and terminal sessions. Eva brings that context together in one unified workspace.`,

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
Detail: they need to run npm install, run your build and see whether the tests pass. That is the difference between here is a diff and here is working code. Frame the same point as context being the expensive part, which is what Eva preserves across tasks, sessions and projects, so you spend less time re-explaining and more time shipping.`,

  "intro-12-demo": `Hand over to the live demo here rather than reading the slide.
Detail: what the room will see is Eva taking a quick task, spinning up a sandbox, making the change, running the tests and opening a pull request — all from a one-line description.`,

  "intro-13-closing": `Thank the room, then leave the two addresses on screen.
Detail: Eva is live at eva.vedantb.com and the code is at github.com/vvedantb/eva. It is MIT open source, so anyone in the room can run it themselves.`,
};

/** Notes for a slide id, or "" when the slide needs none. */
export function getSpeakerNotes(slideId: string): string {
  return NOTES[slideId] ?? "";
}
