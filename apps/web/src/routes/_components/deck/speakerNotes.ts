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

  "04-sessions": `So a session's one running conversation about one codebase, and over the summer it grew into a proper workspace.
There's twelve changes on here, so I won't read them all out, I'll just give you the three themes.
→ In July, the workspace filled out: a follow-up queue, a built-in browser, a files explorer, tabs and plan mode.
→ In August, it got much better at telling you what's going on: an inbox badge and chime, working on mobile, usage limits shown up front, and auto-archive notices.
→ And in September, it got better at recovering by itself, like switching account when a limit hits, and fewer stuck turns, instead of just stalling.
So by the end of the summer, a session had gone from a chat box to a proper place to work.
Now let me put the whole story on one line.`,

  "05-simple-mode": `So the answer for non-engineers was to take machinery away, not add more explanation.
Simple Mode is just a setting, not a separate product, and it hides the files, consoles, settings and meters, so you're left with the conversation.
This picker on the right is the real component we ship.
Before, choosing a model meant going through a long list, and even the trimmed version was still the advanced bit.
→ So it became one five-step slider: cheaper, faster models on the left, the strongest on the right, and nothing else to configure.
Simple Mode landed on 14 August, and the slider replaced the list on 24 August.
And it's the same idea for checking work, where what's done just shows as ticks.`,

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

  "07-sandbox": `So every job in Eva gets its own cloud workspace, and starting one used to be basically a coffee break.
→ On top's the old provider, Daytona, and underneath is what we use now, Vercel Sandbox, and I'll just let it run.
So before, it took about forty seconds, and now it's under one, so more than forty times faster.
Those timings were measured before and after the move, which landed in early July.
And we didn't give anything up: the same workspace still has a terminal, a live preview, a desktop and snapshots.
So speed's half of it, and the other half is cost.`,

  "08-more": `A deliberate flood: eight more things from the same three months, none with its own slide.
Detail: do not read the grid. Pick two the room will care about and move on. If asked: suggested edits, where a document change waits for someone to accept it; Claude's built-in skills in the same slash picker; previews that stay put after you leave a session; rebindable keyboard shortcuts; rich link previews, where Figma, Linear, Sentry and PostHog links become chips; editing files in the browser; and reading sibling repos, so Eva can look across your other codebases. The 94% is the loading shimmer's main-thread cost after the September animation work; it has its own slide in the annual deck.
Figures: suggestion mode 10 June 2026; Claude's skills 22 August 2026; lasting previews 14 August 2026; shortcuts 6 August 2026. All eight shipped June to September 2026.
Next: Which leaves the last step of the loop: checking the work, and that is where the bottleneck now sits.`,

  "09-team": `So it's not just me raising work in Eva; colleagues raise it themselves.
And the pattern's always the same: someone describes what they need, Eva builds it, and they review it.
→ Matt's been on it since May, on the referral portal: the AQP list map, the referral dashboard, and referral tabs with cancellation reasons.
→ Zuza's been on it since March, on design and admin, and is the heaviest user after me: user management, admin KPI dashboards, and polish on cards, badges and tables.
→ Kezia's been on it since May, on the referral portal and domiciliary care: exports and audit trails, broker and borough filters, and automated decline and expiry emails.
→ Krzys has been on it since July: eProcurement evaluation and moderation, KPI fixes, and a planned move of the backend to Effect, which is a TypeScript framework.
→ George started in September, on testing: checking assessment outcomes, auto-archiving and new emails in their own sandboxes, and speeding up Referral Portal loads.
→ And that's me, on product since January: the domiciliary care and nursing home SUPA archives, and eProcurement fixes.
So that's 400 pieces of work raised by colleagues, not by a developer, up to the end of October.
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
Normally, after someone says a change looks good, a developer still has to update the database, deploy the server side, and merge the code by hand.
→ So here's the drag: the task moves from In Progress to Code Review, and that one move wakes up the Grok bot.
→ Then the bot does the rest on its own: it applies the database changes, deploys the backend, then merges the pull request, which is just the proposed change going into the main code.
The order matters, cos the database goes first, so new code never runs against a database that isn't ready yet.
And the task moves itself to Merged, and the new button is live on the page.
The board and the page here are an illustration, not a recording, but Eva's worked like this since September.
→ So that's Eva today, and the goal is the same for CarePulse: the moment a task goes to code review, it's on the CarePulse repo a few minutes later.
I'll be honest, that's a goal, not a date, and "a few minutes" is the target, not something I've measured.
It needs the model checks first, and a person signing off anything risky.
And to make those checks good, every chat on Eva now feeds back in, so every chat teaches Eva.`,

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
So yeah, that's pretty much it, thank you all for listening.
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

  "friday-b13-reliability": `So things still go wrong, what's changed is how long you're left not knowing.
Just look at this first card for a sec, cos before, a dead agent would sit there showing Working for up to two hours.
→ Now a watchdog, which is just a timer that checks the agent's still alive, closes the turn within minutes and keeps whatever was already written.
→ And if a turn stalls before it's written anything, it just tries once more on its own before anyone's told.
→ And if you hit your usage limit, the chat tells you, says when it resets, and lets you switch to a teammate's shared account in one click.
That came in for sessions first, then quick tasks and projects.
So reliability is one kind of trust, and the other is who can see what.`,

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

  "friday-b20-jev-what": `So most AI models write, and Jev is the opposite kind of model: it never writes anything, it only judges.
→ A typical model, like ChatGPT, you ask a question and it writes new text back, which is useful, but the wording changes every time, so it's hard for software to act on automatically.
→ Jev's different: you give it a set of items and one condition, here "is this urgent?", and it gives each item a score.
You set the line, and anything above it, Eva acts on.
→ So the recipe's just your data, plus a condition, gives you a score for each item, and that's the whole idea.
Cos the question's fixed, the same item gets the same judgement every time, which is what makes it safe to automate.
→ And cos Jev's so small, each check costs fractions of a penny, by our own estimate, and comes back in under a second.
That's what lets Eva run it on every item, every time, rather than on a sample.
The items and scores here are just an illustration, not a real call.
So here's Jev inside CarePulse.`,

  "friday-b17-jev": `Ten small decisions inside Eva, all made by the same model.
→ Step 1: the three you will notice. Before a quick task runs, Jev checks the prompt says where the change goes, what should happen, and what is wrong today, and nudges you if not. As you type, it picks the skill that fits. And when an agent has a question for the team, Jev picks who should answer it, one yes or no per teammate.
→ Step 2: seven more. It tags tasks, sorts the overnight findings by severity and spots duplicates, decides whether an @-mention needs an email or just an inbox row, lets any agent ask its own questions through Eva's evaluate tool, flags changes in a turn that nobody asked for, lays out the interactive panels agents show in chat, and picks the emoji reactions that fit a comment.
Detail: each card shows the question Jev is given, shortened from the code. Real thresholds differ by use: tags at 60%, duplicate hints at 70%, the draft nudge below 50%. Teammate routing sits behind the Ask teammates experiment and is reached by agents through the ask_teammate tool; if Jev is down or picks nobody, a keyword match takes over. Every use fails safe: no answer from Jev means Eva carries on as it did before.
Figures: evaluate tool, task tags, findings triage, draft readiness, mention urgency and skill suggestions, 21 September 2026; scope check and chat panels, 22 September 2026; emoji reactions, 26 September 2026; teammate routing, 12 October 2026. Source: Eva git history.
Next: And it has started to appear in CarePulse too.`,

  "friday-b21-jev-carepulse": `So CarePulse's first use of Jev is a PID checker, which flags personal details as a broker types them into a referral form.
Normally, if someone types a name or phone number into a free-text box, nobody notices until much later, if at all.
→ So say the broker types a note that names someone and gives a phone number.
About a second and a half after they stop typing, Jev scores the field against one question, "could this text identify a specific person?", and if it's over the line the field turns orange with "May contain personal details".
The example's made up, it doesn't identify anyone.
→ And the safeguards: it only warns, it never blocks posting, zero data retention is requested, so the text isn't kept, and if Jev's unavailable, fixed pattern rules for things like NHS numbers and phone numbers still run.
The 50% line is our own assumption, so we'll review it if brokers report false alarms or misses.
It went into CarePulse in October.
Now, outside work, four side projects, starting with vmem.`,

  "friday-b18-limits": `So this is my view, not a measured law: the models keep getting better, but the problems we wrote about in February were still the ones we wrote about in September.
→ So each step on this ladder is a new model added to Eva, ten of them from April to September, from Anthropic, OpenAI and xAI.
To be fair, it shows when each model arrived in Eva, not how good it is.
→ And these are four problems, each line drawn from its first mention in our changelog to its latest: it loses the thread, it gets stuck, it needs a human guard, and work waits for review.
Three of them were on record before the first model on the ladder even arrived, and all four were still being fixed in late summer.
Like in March, a quick task hung on "Generating response", and in September we still had a turn left stalled.
And the lanes show what got written about, not how often it happened.
→ So if better models alone fixed these, the lines would end, and they don't.
To me that suggests fully automating software development is nearing a limit, and the work left is judgement, review and the systems around the model.
So here are two lessons from the year, in the project's own words.`,

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
  "a01-title": `So, this is my annual CDM review.
Most of it's about Eva, the platform I've been building since January, but it also covers CarePulse and four side projects: vmem, flowtape, Redline and Bee.
Everything I show you comes from the code history or Eva's own records, so you can check any of it.
Each section has its own colours, so you'll always know where we are.
And right at the end, I'll map it all back to the senior engineer framework.
So let's start with Eva, cos it's the biggest bit.`,

  "a02-origin": `So here's the story so far on one line: ten months, from January to now, as five moments.
It starts with an empty repository on 11 January.
→ The first session was on 24 January, and the first quick task on 1 February, so about two weeks from nothing to something usable.
These dates come from Eva's own records of the first ones actually created, which is why they're later than the week-one dates, cos those are when the code landed.
→ Then in July the work moves to the cloud, and in August Eva starts opening its own work.
→ And the line just keeps running on to today, cos it's still going.
So that's how we got from an empty repository to most of how we build software.
And here's what it's actually produced.`,

  "a03-numbers": `So this is what the year's produced, from Eva's own records and the project history, up to this week.
The top row is output: 5,673 changes shipped, 1,015 quick tasks raised, 767 sessions and 1,891 sets of release notes.
That works out at about eighteen changes a day, every day, since January.
It's not glamorous, but keeping a pace like that going for that long matters more than any one big week.
→ But the real question is whether anyone else uses it, and that's this second row.
16 people have accounts, there's 19 automations running, they've run 706 times, and 125 documents have been written in it.
So it's not just been built, it's actually being used.
But those sixteen people didn't all turn up at once, and the timing's interesting.`,

  "a04-adoption": `So nobody announced Eva to the team; people just started using it once it got easy enough.
This is how many sessions were started each month this year.
The early months are small, and June's a genuine zero, not missing data.
→ Then from July it lights up, and that's when the work moved to the cloud.
From July, monthly sessions roughly tripled, and they've kept climbing since.
November only runs up to this week, and it leaves out the old quick tasks we moved into sessions on 11 November, cos counting those would make the bar look much bigger than it really is.
And I'm pointing out the June gap on purpose, cos being upfront about it is what makes the rest believable.
And it's not just one codebase either: every work codebase now runs on Eva.`,

  "a06-impact": `So the easy answer is that AI makes developers type faster, but that's not really what changed.
Three things changed, and none of them's typing speed.
→ First, who can ask: before, it was a request, a queue and waiting on a developer, and now anyone can just describe what they need in their own words.
→ Second, where the work runs: before, it was one laptop doing one thing at a time, and now it's cloud workspaces running loads of jobs at once.
→ And third, what a person actually does: before, you wrote every line yourself, and now you direct the work and guard the bits that are hard to undo.
That third one's the one that matters most, cos it's what makes the other two safe.
So Eva was built to remove the wait between someone needing something and it being built.
So what does that look like for the person actually using it?`,

  "a07-how": `So here's the whole loop in one go, so nobody has to guess what using it looks like.
→ You describe what you want in plain English, in a chat.
Eva builds it in its own cloud workspace, with a live preview you can click through.
Then you try it, ask for changes, and when you're happy it goes live.
It all happens in a browser tab, so there's nothing to install, no ticket and no handover.
The preview's the bit that matters most for non-technical people, cos it's the first point you can judge the work yourself.
→ And there's four ways to ask: a session's a running conversation, a quick task is one job start to finish, a project is several jobs in order, and an automation's a job that runs by itself.
So you pick based on the size of the job, not on whether you're technical.
And behind all that sits the first big platform decision: never depend on one supplier.`,

  "annual-e02-carepulse": `So Eva was built to serve CarePulse, and CarePulse kept shipping all year, most of it raised and built through Eva.
Every item here is a change that went into CarePulse's main branch, quarter by quarter.
→ December to February: notes on the AQP list, including Sussex, eProcurement evaluation and the moderation view, with a run of fixes for evaluators, and the sandbox setup so the team could work in the cloud.
→ March to May: mobilisation status on the provider homepage, CQC notifications filtered to AQP homes only and cleared when you dismiss them, and a tidy-up of the resource centre.
→ June to August: the domiciliary care quality dashboards, with tabs, an admin page for responses, a location breakdown and exports, plus SUPA archives for nursing homes and domiciliary care, and the referral portal dashboard and filters.
→ And September to November was the busiest stretch: the provider homepage redesign, the central contact overview, the SUPA tracker, the Jev PID checker on the care package finder and the referral portal, and comments on the nursing home quality dashboard.
So the point is, all the tooling I've shown you was in service of this work, not instead of it.
And behind a lot of it is teaching the agent our codebase.`,

  "a09-design": `So this slide's about doing the design on paper before writing any code.
The proof is the biggest change of the year: swapping out the engine that every workspace in Eva runs on.
Normally you'd just rip the old thing out and hope, and if it goes wrong, everyone's stuck mid-job.
→ So instead it went in six phases, all in July, starting with a spike, which is just a quick throwaway test to see if the idea works at all.
Then a neutral contract, a plug shape any provider could fit, with nothing using it yet.
Then the old provider moved behind it, then the new provider, then the switch-over on 25 July, and the old code deleted on 29 July.
→ And this is the number the spike was written to test: a 6GB workspace restores in about a third of a second, where before it took minutes.
It was an explicit go or no-go, and the answer was go.
→ And the options I put down are kept too: seven shelved plans are still written up, and two rejected animation options carry the measurement that ruled them out, one 11% worse and one doing five times more painting.
I also said at the time that the terminal, desktop and named volumes were deferred on purpose, not forgotten.
But design cuts down faults, it doesn't remove them, so here's what I do when something breaks.`,

  "a10-debugging": `So these are three real production faults, and each time the rule was the same: find the symptom, find the actual cause, then pin it with a test so it can't quietly come back.
The first one's from 10 September: you signed out, and you were still signed in.
The cause was two cookies with the same name, cos under the newer browser cookie rules a partitioned and an unpartitioned cookie count as two, and the browser sent both.
So the fix just deletes the old one first.
→ Then on 2 September a colleague's messages went unanswered for two hours.
That turned out to be three defects: a check for whether the agent was alive that matched its own wrapper, a kill that left a stuck process holding a file lock, and a launch racing its own ready marker.
So three defects, three tests, each with its own name.
→ Then on 24 August there was a three-minute wait, even though the workspace itself resumed in eight seconds.
It wasn't the workspace at all, it was a warm-up running on a stale model setting that held the launch lock, so now anything waiting just waits, re-checks and restarts.
→ And nobody reported this last one: 65 restarts against 146 launches in 24 hours, which I found by searching live traffic.
And that same habit of searching live traffic found a bigger problem, where the database was fighting itself.`,

  "a11-craft": `So the skill I've built most outside programming this year is measuring things instead of guessing.
These bars are just what came out of it, from the animation work in September.
The loading shimmer went from 32.6 milliseconds of work every second to 1.9, its repaints from 240 a second to none, and a realistic chat screen from 64 to 45.5.
But the method's the bit I'd defend: a fresh tab for every run, medians of three, and I proved it still looked the same by comparing paused frames.
And I'll be honest about the limit: the test machine had no GPU, so only the main-thread figures carry over.
→ So these are the habits behind the numbers: live traffic is searchable, decisions are written down, there's one design system, and accessibility problems get fixed.
→ And the honest gap is page scores: there's a Lighthouse setup, which is Google's page speed checker, but no scores are recorded in the release notes yet, so it's set up, not a habit.
So next is the same method, applied to the waits everyone pays.`,

  "a12-quality": `So the standard here is enforced by the machine, cos a standard that relies on people remembering isn't really a standard.
These numbers are from the repo in mid-September: 303 test files, 79 contract tests, 46 nightly runs that went back and filled in tests, and 4 custom rules.
The contract tests matter most, cos they fail when two parts of the system drift apart, and one of them checks that the three chat surfaces stay the same.
The four custom rules only exist where an off-the-shelf rule couldn't say what I wanted, like no unchecked JSON parsing and no double casts.
→ And these are the written rules: unsafe type shortcuts and certain React patterns are banned, data's checked at the edge as it comes in, and every change needs a type check and release notes.
→ So a test that's permanently red is a broken test, cos once people stop reading the results, the tests protect nothing.
And the reason enforcement matters is the size of what it now protects.`,

  "a13-people": `So every incident on this slide was found by a colleague, not by a test, and each one changed how I work.
This first one's from August: a colleague's session sat on Working for two hours with their messages unanswered.
Underneath, a stuck runner was holding the lock to start a new one, while the watchdog kept extending its own deadline.
→ Then in September two of a colleague's messages were dropped, cos a fix had landed on sessions only and not on the other chat screens.
So the rule that chat is one surface, where sessions, quick tasks and projects all share the same chat, is now written into the repository.
→ And also in August, the design tooling didn't survive a workspace resume, and that was found in a colleague's own session.
→ So each one got fixed, pinned with a test, and written down.
And those standards are written for people and for agents: repo rules, guides for the interface, the data layer and security, and release notes on every change.
And most of those colleagues aren't engineers, which shaped the product a lot.`,

  "a14-users": `So most people opening Eva aren't engineers, and nearly every decision on this slide comes from that.
Simple Mode hid the reviews, diffs and token meters, so you're left with the conversation and a preview.
The long list of models became one slider, cos even the trimmed list was still the advanced bit.
PRD got renamed to Plan, cos that's what people actually meant, and the daily summary got rewritten in plain language, with a hard ban on file names and commit hashes.
→ And then three more: every screen made usable on a phone across two audits, shortcuts made visible and rebindable, and pages that just said "pick something from the sidebar" removed, cos on a phone the sidebar's a closed drawer.
→ So none of this made the tool cleverer, it just made it usable.
So here's the slider those choices produced.`,

  "a08-ahead": `So Eva now finishes work faster than we can check it in, and that changes where the hard part is.
It used to be building the thing; now it's deciding, and checking, either side of the build.
So these are the four things for next year: automate the release, guard the irreversible, software that fits us, and many agents with one coordinator.
→ First, automate the release, which is the one lighting up: marking work ready should be the last human step, like it already is for Eva itself.
Then guard the irreversible, so people spend their attention on data, permissions and anything that's hard to undo.
And software that fits us, meaning tools shaped around how we work, not the other way round.
And the last one I've literally just started planning: each thread gets its own agent, its own branch and its own workspace, and the main chat becomes the coordinator.
The hard bits there are deciding the merge order, keeping the cost down when five threads means five workspaces, and stopping the main chat drowning in updates.
None of these are dated commitments, they're the direction.
→ So the question stops being how fast can we build it, and becomes how fast can we decide.
And alongside Eva, the product it was built for kept moving: CarePulse.`,

  "annual-s01-eva": `So, first up, Eva.
Normally, if someone in the business needs a change to one of our apps, they write a request, it goes in a queue, and they wait for a developer.
Eva's the platform I built so you can just describe what you need and have it built, and it's now what the team builds with.
Every Eva slide stays in this purple and blue, and each later section gets its own colours.
And it all started on one evening in January.`,

  "annual-s02-carepulse": `So that's Eva, and now the second section: CarePulse.
It's the product Eva was built to serve in the first place.
So let's look at CarePulse this year.`,

  "annual-s03-vmem": `So the side projects start here, and I want to say it plainly: all four were built in my own time, alongside Eva, with no company time spent on them.
The first one, vmem, is my BSc final-year project at City St George's, University of London.
So what is vmem?`,

  "annual-f01-vmem": `So normally every AI tool you use starts from scratch, you tell ChatGPT something, then Claude has no idea, and you end up explaining yourself again and again.
vmem's a memory layer for AI: you tell it something once, and any AI tool can recall it.
→ So what I built saves chats, files and notes in one place, links the people and projects they mention into a graph, so it knows how things connect, and any AI tool can read it over MCP, which is just a standard way for AI tools to plug into other tools.
→ And what it changed: it's live and hosted, with a Chrome extension, and Jev, the judging model from the CarePulse section, ranks what it recalls.
It was my final-year degree project, and it got 80%.
I did that alongside full-time work on Eva, so it took a lot of time management.
Next side project, flowtape.`,

  "annual-s04-flowtape": `So the next side project is flowtape.
Let's look at what it does.`,

  "annual-f02-flowtape": `So normally, to get an automated test of a journey through an app, someone has to sit down and write it as code, which takes ages, so most journeys never get one.
flowtape turns a journey you click through into a test an agent can run.
→ So what I built records a journey through an app, turns it into a prompt an agent can replay and explore, and hides passwords and personal details like NHS numbers before anything's saved.
→ And what it changed: tests come from clicking, not writing code, and it's published on npm, the public place JavaScript packages live, so anyone can install it.
Next side project, Redline.`,

  "annual-s05-redline": `So the next side project is Redline.
Let's look at what it does.`,

  "annual-f03-redline": `So normally, after a change, someone clicks through the app by eye to check nothing's broken, and it's easy to miss a page.
Redline shows what a change did to every page of an app.
→ So what I built builds the app before and after a change, screenshots every page at both, and points to the files most likely responsible for what changed.
→ And what it changed: visual checks are done by a tool, not by eye, it's used in Eva's own development, and it's published on npm.
The last side project is Bee.`,

  "annual-s06-bee": `So the last side project is Bee.
Let's look at what it does.`,

  "annual-f04-bee": `So we've all been in a meeting where someone asks something and you're stuck searching your notes while everyone waits.
Bee answers questions during the meeting, from your own notes and the web.
→ So what I built is a desktop app for Windows and Mac that listens in a meeting, and finds your own notes and short answers, in a small bar at the top of the screen.
→ And what it changed: I presented it to the company this month, and it's still in progress, so it's open to anyone who wants to test it.
And before the framework, one personal bit: what AI unlocked for me.`,

  "annual-g02-checks": `So the business team shouldn't have to read code to know if a piece of work is ready.
Otherwise you're asking a developer, or trying to read the changes yourself, just to find out if it's done.
→ So first there's proof: screenshots of the change and a walkthrough video, so anyone can see what actually changed.
→ And then the audits, security, code review and code clean-up, and each one just gets a tick once it's run.
It's the same idea as Simple Mode: take the machinery away and keep the answer.
But simple by default doesn't mean everyone's stuck with it.`,

  "annual-g01-parked": `So not everything built in Eva was kept, and knowing when to park something is a lesson in itself.
→ First, Testing Arena, which works on two sides: one agent tries to break the interface, and another examines the code for issues.
The lesson was that it needs heavy AI usage, so it wasn't feasible at the time, and it can be looked at again when there's spare usage to run those heavy tests.
→ Second, Documents, one place in Eva for PRDs, which are the written plans for a feature, and other docs, kept beside the work.
The lesson there was that it needs more work before it pays off.
→ So parked isn't dropped, the idea just waits for the right time.
And part of that bigger system already works, cos on Eva, marking work ready is the last human step.`,

  "annual-g03-skills": `So an AI agent writes much better code when it knows how the team writes code.
Without that, it just invents its own way every time, and you end up with five different styles in one codebase.
So I wrote skills for CarePulse, which are basically written instructions the agent reads before it touches that part of the code.
→ These are mine, one per part of how CarePulse is designed: Effect, tables, permissions, filters, RPC and backend calls.
Each one matches how the codebase is actually built, so the agent follows that instead of making it up.
→ And for design review, I got Zuza to write a skill, so the agent follows CarePulse's design standards too.
→ So the agent writes code the way the team would.
But skills help it write the code, the understanding still has to come from me: AI writes the code, not the understanding.`,

  "annual-g04-feedback": `So Eva now learns from how people react to it, and cos we own the data, we can actually act on it.
→ First, it's captured: Eva leaves feedback on its own when someone's clearly frustrated or clearly happy in a chat, and anyone can give a thumbs up or down on a reply.
→ Then it's reviewed: all of it lands on one Feedback page, so we can see what went wrong, what we need to add, and what to simplify in the codebase.
Those two parts went live at the start of November.
→ And next, the plan is to use all that data to generate new lints, which are automatic code rules, and checks with Jev, so the agent writes code we're happy to just merge.
That last card says Next cos it's the plan, it's not built yet.
But the first one's already queued up: Lauren's "no comments" skill, which we'll apply across CarePulse and then turn into a lint rule, so it's enforced automatically.
And the same kind of data, shown to the business team, is the Today page.`,

  "annual-g05-today": `So normally, if you're on the business team and want to know what changed in an app, you'd have to ask a developer or read the code.
The Today page is where you can just see it, in plain words.
→ So today, every day an automation writes a stand-up for each app: what merged into main, so what actually went live, and what's new in the app.
That's been running since August.
→ And that's already in progress: I'm rebuilding it as a live dashboard, not once a day, with what needs you, what's in progress, and what's merged.
So the business team gets a much better view of where every project's at, without having to ask anyone.
And if building is getting this fast, it's worth asking where the hard part is now: the bottleneck has moved.`,

  "annual-g06-understanding": `So AI has taken away the coding, but it hasn't taken away the understanding, and it shouldn't.
Here are four CarePulse changes from the last few months, and what each one looked like versus what it actually took.
→ The provider homepage: you'd expect it to be a few prompts, cos it's just a redesign with a few new features like per-contract suspension.
But no, that session ran for over a month, with around 250 of my messages and about 96 questions, cos I had to keep questioning the AI to understand how every part was built, and what I was actually trying to do.
→ The central contact pages: same again, I was asking Matt questions the whole way through.
And at one point the AI filtered homes by role, and I reversed that as a product decision, so everyone sees all their homes, cos the whole point of the page is to centralise.
→ Never events: it looked like one more graph, but the number wasn't in the backend's data at all, and an old view read it by fixed position, so it needed a backend change merged first.
When the AI missed that, I asked "why did you not do this in the first place?", and we saved the lesson as a rule.
→ The Jev PID checker: now it exists, the end result could probably be built in one prompt, but the questions, the trade-offs and the decisions along the way couldn't.
One of my questions was "so this entire time you weren't using Jev?", which exposed a silent fallback, and after the fix Jev got 59 out of 59 test cases right, where the old pattern rules missed 22 of 39.
→ So that understanding is why those pull requests got to a state where I only skimmed the code, and different AIs find different things, Amp and Codex both found issues, so the next step is checks good enough that we don't need to read it at all.
And understanding is where the judgement calls come from, cos the judgement is still ours.`,

  "annual-g07-live-data": `So normally, if you want numbers out of the database, you ask a developer and wait for them to pull it.
Eva's connector opened that up to everyone.
→ Anyone can connect Claude to Eva and ask about live data, so you can build your own dashboards, get your own KPIs, and get help with your own work.
→ Matt's a good example: Matt designed a dashboard with Claude, uploaded it to Eva, and it's now live in CarePulse as the referral activity page.
→ So it's read-only, it's live, and there's no developer in the way.
Read-only means you can look at the data but you can't change anything, cos it goes through a read-only copy of the database.
And every request is scoped to the person asking.
Cos opening data up to everyone is only safe if the locks are designed in from the start.`,

  "annual-g08-judgement": `So here's another one that looks simple on the surface: travel-time search on the referral portal, so you can find homes by how long it takes to get there.
→ First option, Google's APIs: when I asked, the AI sized it at about 685 to 1,330 dollars a month, and its first recommendation was still to keep Google.
Those are the session's own estimates against real referral volumes, not a bill, but I said it seemed quite expensive and pushed for alternatives.
→ Then one TfL API key, for public transport: that's 500 requests a minute, shared by everyone, so if several people searched at the same time they'd hit the limit.
TfL's own developers told me several keys can be used at once, so we use two, paced.
→ And Mapbox for driving, which sits inside its free tier: the first 100,000 lookups a month are free, and we expect about 73,450.
The Google code's still there too, so we can swap provider if we need to, and it shipped in October.
→ So the AI never raised either problem on its own, cost and rate limits only came up cos I put them in the brief and kept pushing.
It's still up to a person to think through these edge cases and make the call.
And one tool from that work gets used in both Eva and CarePulse, so what Jev is.`,

  "annual-g09-catching": `So a lot of my job now is asking the AI the question it didn't ask itself.
Here are three, in my own words from the chats.
→ First, a production database error on CarePulse, back in October.
The AI wanted to change how database connections are shared, and I asked if that was really right, cos Prisma's own example does what we already had.
It admitted it had no evidence, and the next question found the real cause: about 22 database calls for every page view.
→ Second, our tests on Eva, where I asked, honestly, had they ever stopped a regression, which is something that worked breaking again.
Hundreds of test files had never run in CI at all, and CI's just the automatic checks on every change.
So we deleted the fake ones, 21,708 lines, kept the real testing, and the CI check went from 83.6 seconds to 16.6.
→ Third, home care tiers on CarePulse, where the AI said no backend change was needed.
I asked whether it actually saved in the backend or was just the frontend, and had it tested against staging, the copy of the app we test on, before I believed it.
→ So the right question is still the human's job.
Now, one lesson from the last few months is that the system includes the packages we depend on.`,

  "annual-g10-repos": `So Eva isn't just used to build Eva.
Normally, before you can touch a codebase, someone has to get it set up and running on their own laptop.
→ Every codebase we work on is set up in Eva: Eva itself, CarePulse v3, which is the current web app, CarePulse v2, the Django backend, eProcurement, and the cost model.
So anyone can open a session or a quick task on any of them, and the setup's already done.
I checked that list on 22 November.
Now let me show you the people behind those numbers, and what they built.`,

  "annual-g11-configurable": `So Eva isn't like Amp or Cursor, where the audience is only developers.
The business team uses it too, so it had to be simple by default and configurable for the people who want more.
→ So first, what's done for you, cos to keep the flow as simple as possible, Eva does a lot on its own.
That's one checkbox to record proof, audits that run in the background, pull requests that open themselves and keep their status up to date, and titles, tags and PR descriptions written for you.
And quick tasks and sessions close and archive themselves when the work's done.
→ But not everyone wants all of that, so each person can turn things off or on under Experimental settings.
A lot of these came from changes Krzys wanted: turning off auto-archiving, choosing whether pull requests open automatically, and Claude-style activity steps.
There are 19 switches in all.
Now, the models kept improving this year, but the problems stayed the same.`,

  "annual-g12-unlocked": `So before the framework, one personal bit, cos the switch to AI has honestly been amazing for me.
→ Before AI, I had an ideas list of everything I wanted to build, over 40 things on it, and most of it I had to scrap, cos one person can't build all that, so I just kept filtering it down.
→ Now I can work on several things at the same time and keep going wider: Eva, CarePulse, and these four side projects, which is a huge productivity gain.
And honestly, most of what I've learned about AI has come from people on X, that's been my biggest source of inspiration, plus Krzys.
And I keep experimenting with it: my last few presentations, this one included, were all built with AI.
That's honestly raised the quality, cos animations I'd never have had time to hand-build, I can now just prompt for.
And they've been well received: people said they understood what I was showing, they liked how it was presented, and the animations helped get the point across.
So that's the kind of thing I enjoy doing too.
→ I enjoy coding, but I think I enjoy product building and solving problems through it even more now, and AI's let me push that side to the max.
I still pick which ideas actually ship, that's what the parked slide was about, but the list doesn't have to shrink any more.
I know "10x engineer" is just a saying for a really productive engineer, but compared to last year, it honestly feels like I've become that.
Things that used to take me weeks now take days, and I'm putting out far more than I could before.
I haven't opened an IDE in about eight months, and I haven't written a line of code by hand in about six.
I still read the plans, ask the questions and make the calls, that's the job now, but the typing is the AI's.
So I definitely love AI, and I can't imagine going back.
Hopefully that shows through all of this work.
So here's how all of it maps to the framework: senior engineer, mapped.`,

  "a15-framework": `So this is the map: the senior engineer framework's three sections, Technical, Impact and Collaboration, with the proof for each underneath.
→ So the proof lands under every one.
On Technical: design and trade-offs, like the sandbox move planned in six phases, workspaces going from 40 seconds to under one, and seven dropped plans kept in writing.
Debugging, like write clashes going from 6.7 a second to one a minute, and patching Vercel Sandbox and Convex, plus beyond coding: coming up with ideas, finding problems to solve, measured performance work, and user experience and animation.
On Impact: breaking down large problems, like the sandbox move from spike to switch in three weeks, and fixing stuck turns once, at the cause.
Improving the process, with Eva running many agents in parallel without conflicts, vmem as a company brain, the Redline and flowtape experiments, work to make CI quicker, a Mantine linter, and the Jev score on every message, which was Zuza's idea.
Identifying work, like taking critical warnings from 2 to 0 and high from 48 to 2, and next, automating the release, and business and user empathy, with Simple Mode's five-step slider and the PID checker for referral brokers.
And on Collaboration: communicating clearly, demoing Eva at every dev stand-up for the first two quarters, daily summaries and a weekly changelog for non-engineers, and plans logged in Eva with specs saved in the codebase, which was Zuza's idea too.
Getting buy-in, for Vercel Sandbox for Eva and Claude usage for Bee, and mentoring and onboarding, setting everyone up on Eva and answering their quick task, session and MCP questions.
And one last thing about how this deck was made: built in Eva, by Eva.`,

  "annual-b01-day-one": `So this is day one, 11 January.
→ These are the first three commits: the very first one, then the schema for projects and tasks, then the queries and mutations behind it.
A schema's just the shape of the data, so what gets stored and how it links up, and the queries and mutations are how the app reads it and changes it.
The first commit went in at 16:36, and the schema at 20:15 the same evening, so it really was day one.
I've put the commit hashes up cos anyone can look them up and check.
→ So the foundation Eva still runs on was chosen that first day.
That same schema, extended loads of times since, still stores every session, quick task and project, and nothing since has made me unpick it.
And within four days, the two ideas the whole product rests on were in place.`,

  "annual-b02-first-week": `So the whole product rests on two ideas, and both turned up in the first four days.
→ Quick tasks landed on 12 January, one day after the first commit.
A quick task is one job, start to finish: you give it one prompt and you get one result back.
→ Then sessions landed on 14 January.
A session's a running conversation about one codebase, so you can keep going back and forth with it, like you would with a colleague.
Projects and automations came later, but they're built out of quick tasks and sessions, not alongside them.
So we've never needed a third idea, and everything since has built on these two.
Then in the second quarter, Eva stopped being a one-person tool.`,

  "annual-b05-q2": `So chapter two was the quietest quarter, but it wasn't a slow one.
It's the quarter Eva stopped being single-player, so something the whole team could work in together.
→ First, documents, on 10 June: you can comment on a specific passage, suggest edits, and see the version history, and all three landed the same day.
→ Then on 17 June, the projects roadmap, so several pieces of work in order become one thing you can actually see.
→ And that same day, Testing Arena opened up to everyone, so trying out a change stopped being something only developers did.
So these months went on making the existing work solid and shared, rather than piling on new things.
And the next chapter was the busiest of the three, cos that's where we made it dependable.`,

  "annual-b06-q3": `So chapter three, July to September, was all about dependability: the same product, made safe to rely on.
→ July was almost all the sandbox cutover.
A sandbox is the cloud workspace every job runs in, and we swapped out the engine underneath all of them, which I'll take apart phase by phase a bit later.
→ Then August: durable turns, so a long run survives an interruption instead of just stalling, plus security work, and the design system the interface now sits on.
→ And September: multi-repo sessions, so one conversation can span several codebases, and decision models for classifying work at scale.
So none of this adds a new thing to do, it just makes the existing things safe to depend on.
Now let's look at that same stretch from inside one session.`,

  "annual-d01-security": `So signing in was never the problem, the problem was knowing whose data you were seeing once you were in.
The Locked down by design slide built security into a new interface, and this one's about hardening the old ones.
In August I audited everything that was built, and ownership was checked unevenly across codebases, sessions, tasks, teams, workspaces, snapshots and integrations.
→ So the checks moved into shared helpers, one guard on every door, which means any new screen gets that protection for free.
→ And the production dependency warnings, which are security alerts on the packages we use, went from 2 critical and 48 high down to 0 critical and 2 high.
I hardened sign-in itself too, like asking for explicit consent and tying refresh tokens to the app they were issued to.
→ And then on 19 August I checked it all against real production data, not just against tests.
And all of this rests on measuring things, which is the skill I've built most this year outside programming.`,

  "annual-d02-design-system": `So without a shared set of components, every new screen turns into a fresh argument about how things should look.
These tiles are the library in miniature: four colours, four surface tones and four of the shapes every screen uses.
And the rules are written down, not just in someone's head: surfaces separated by tone instead of decorative lines, one shadow system, and animations on shared timings.
Two moves made it possible in August: the web app and the browser extension moved to Tailwind v4, and everything switched to a single icon library.
→ So that's 110 files and 18,197 lines, which is what every screen is built from, measured in September.
And since October those same components ship as shared packages, so one set is used across every app, and Eva moved onto them too.
→ So consistency is now where you start, not a clean-up job afterwards.
But a house style only lasts if a machine enforces it.`,

  "annual-d04-frontend-perf": `So waiting is the tax everyone pays on every single change, and I measured three separate waits and cut them.
→ The local build went from 28 seconds to 2.6, and that's the wait between making a change and seeing it.
→ The landing page's first download went from 516 kB to 362, and that's the wait a visitor pays before anything shows up.
→ And the code checker's false warnings went from 8,862 to none.
Cos honestly, a checker nobody reads is a checker that isn't running.
There were smaller savings too, like 489 kB of icons, but three numbers is about all a room can hold.
So speed is one kind of polish, and looking the same everywhere is another.`,

  "annual-d05-scale": `So this is the size of what exists now, in things you can picture rather than lines of code.
When I measured it in September, it was 2,936 tracked files, 976 backend functions, 363 screens, 71 data tables and 9,854 lines of release notes.
The 363 screens is the one I'd look at, cos most people can picture what it costs to build one screen by hand.
The 71 tables are the shape of the business the product models, and the release notes matter cos they were written at the time, so every other figure here can be checked.
→ And for the engineers, that's 2,151 TypeScript files, and 18,197 lines in the shared component library alone.
→ So ten months in, it's still one codebase, and one person directing the work.
And at this size, what you stop matters as much as what you build.`,

  "annual-d06-abandoned": `So deciding not to do something is design work too, but it only counts if it's written down.
This first one was a plan to move the background workers to another host, and it got dropped cos the new architecture just removed the problem, which is the cheapest kind of cancellation.
→ Then a new framework, which I formally assessed on 17 July, and the verdict's written down word for word: do not adopt.
→ And this one's the honest one: unifying design sessions was cancelled on 29 July and replaced by a mode that was itself removed on 23 August.
So that's the same question answered, reversed, and reversed again, and I'm showing it cos owning that is what makes the other two believable.
→ So all seven cancelled plans are kept in full, and nobody has to re-argue them from memory.
And a lot of the right calls came from listening to colleagues.`,

  "annual-d07-lessons": `So these are two sentences from the project's own notes, written during the year, not made up for this deck.
The first one: "Most failures are not model failures. They are system design failures."
That's kinda the opposite of the usual conversation, where everyone's arguing about which model is best.
And a lot of this deck is evidence for it: turns that finish what they start, one guard on every door, the enforced quality bar, and none of those are about the model.
→ And the second: "Autonomy is an infrastructure decision", meaning how far you can trust an agent to run on its own depends on what's built around it, not which model you pick.
→ So both point the same way: build the system.
And that's why a lot of my job now is catching the AI.`,

  "annual-e03-patch-packages": `So here's a newer lesson: when a package we depend on is wrong, we don't work around it any more, we patch it, the same day.
A package is just code someone else wrote that we pull in, and normally you'd work around the problem or wait for them to fix it.
→ First, Vercel Sandbox, where any command sent to a stopped sandbox woke it back up, and the package had no way to turn that off.
I want sandboxes to start and stop when I say so, not as a side effect of a user's command.
So I asked the AI to patch the package, and it added a switch to turn auto-resume off, and a way to attach only to a sandbox that's already running.
→ Second, Convex presence, where a heartbeat timing out made the clean-up job try to cancel itself, Convex refused, and every timeout threw an error that filled the logs.
The patch skips the cancel on that path and still deletes the record.
Both patches live in the repo, so they're reviewed like any other change and re-applied on every install, and if an upstream fix lands we can swap them out.
→ So a dependency is code we can change, not a wall we wait behind.
But not everything we built was kept either, and that's a lesson too.`,

  "annual-d08-durable": `So here's what used to happen: a turn, which is one reply from the agent, breaks part-way, and the screen just sits on Working with nothing behind it.
Most of the "Eva's stuck" reports were actually this one fault.
The debugging slide chased this symptom case by case, but this fixes the cause once.
→ So now the same turn runs again, gets interrupted at the same point, and this time it survives and finishes.
That's cos every turn now saves its place as it goes, instead of living in one process's memory.
And it's fenced, so an old turn can't come back and write over the one that replaced it.
That went in on 19 August, and the remaining gaps were closed on 23 August.
→ So interrupted doesn't mean lost any more.
But things still go wrong sometimes, so the next question is what you see when it breaks.`,

  // ---------------------------------------------------------------------------
  // Intro to Eva deck
  // ---------------------------------------------------------------------------
  "annual-c01-providers": `So Eva doesn't run on just one AI company.
Normally, if you build on one supplier and they put their prices up, fall behind or go down, you're stuck.
On screen is every model you can pick in Eva, grouped by provider: Claude, Codex, OpenCode and Cursor.
→ That's four providers and twenty-one models, all in one picker.
And it's the real list that ships, as of mid-September, not a wish list.
A session remembers the last model you used, so you're not choosing every time.
→ So if one supplier stalls, the work just moves to another, and nobody has to change how they work.
But having a choice is only worth it if you can change your mind halfway through a job.`,

  "annual-c03-handoff": `So switching provider is only useful if you don't have to start again.
Each provider keeps its own private record of the conversation, so before this, if you switched halfway through, the new one started blind.
→ Now the whole conversation moves across word for word, here from Claude to Cursor, and it gets a handed-over badge.
Behind the scenes, every reply's stamped with the model that wrote it, and on a switch only the turns the new provider hasn't seen get passed across, capped in size and clearly marked.
And the badge keeps the transcript honest about who wrote what.
That landed on 24 August.
Now, provider capacity is paid for per person, so the next question is whether you can share it.`,

  "annual-c04-accounts": `So with AI providers, you pay for capacity per person, so the useful question is whether it can be shared.
→ First, each colleague attaches their own provider account, so their work spends their own allowance.
You attach it once, and it just stays with your sessions, tasks and projects.
→ Then one person shares their account with the team, and someone else can draw from it, so capacity's pooled, not bought twice.
Sharing's a deliberate choice by the owner, so a new session won't quietly start using a teammate's account.
And if you switch account halfway through a conversation, you keep the conversation, and the next reply's charged to the right place.
Own accounts landed on 17 July, and sharing on 7 August.
Now, people aren't the only ones who use Eva.`,

  "annual-c05-mcp": `So Eva isn't just something people open; other tools and AI agents can drive it too.
That works through MCP, which is just a standard way for AI tools to plug into other apps.
→ The inner ring's reading: anything connected can list the work that's in flight and see what each piece is doing.
→ The next ring's acting: it can send a message into an existing session, task or project, start and stop workspaces, and run code across several tools in one go.
→ And the newest ring: typed judgements, so a calibrated score or category applied the same way every time, and interactive panels drawn straight into a chat.
That's how one agent can supervise others, which is what Manager Ave does.
For the business, it means Eva plugs into what we already run, rather than being a closed box.
Most of that landed between late August and late September.
And that same connector gives everyone live data.`,

  "annual-c06-mcp-security": `So letting other tools into Eva is only safe if we actually check who's asking, rather than just assuming.
The risk is that another tool could act as you, so the fix is short-lived passes, checked twice.
→ Every pass runs out: a sign-in code lasts five minutes, an access pass one hour, and a renewal thirty days.
So even if something did leak, it wouldn't be useful for long.
→ And every request is tied to one person, and that's checked twice: once at the door, and again at the data itself.
Sign-in uses the standard flow with an extra proof step, so a stolen code's useless without the matching secret.
And there's two separate secrets, so one leak doesn't give away the other.
Now, the workspaces themselves: first how fast they start, then how they stay cheap.`,

  "annual-c07-sandbox-economics": `So every piece of work gets its own cloud workspace, which is great, but it means they can't just quietly pile up.
→ While the work's still going, its snapshot never expires, and we only keep the latest one.
A snapshot's just a saved copy of the workspace, so it can pick up exactly where it left off.
→ When a session or task finishes, the workspace gets deleted after 48 hours, and if you reopen the work inside that window, the deletion's cancelled.
→ And a weekly sweep clears up anything the normal path missed.
So nothing keeps billing once the work's finished.
That's partly why we changed provider, cos the old one's snapshots couldn't capture running processes or a seeded database, so every start had to redo the whole setup.
So that's what was built, and now I'll show you how the decisions were made, starting with the biggest one.`,

  "annual-c08-occ": `So the last slide was things breaking, and this one's things being slow.
When a product gets slow, the normal assumption is you need a bigger database, but here the system was arguing with itself.
→ So I looked at three days of live traffic, and almost all the load was writes colliding, not expensive reads.
These bars are retries, where a write fails cos something else changed the same data at the same time, so it has to go again.
→ And this is the cause: two parts of the system were writing the same row at the same moment, so each one made the other retry.
→ So the fix comes down to two figures, and both landed on 24 August.
Lease renewals, which is a running job saying "I'm still here", went from about 6.7 writes a second while streaming to roughly one a minute, cos now they only write when something changes or less than half the lease is left.
And live cursor writes went from 20 a second to at most 6.7, cos they're throttled and ignore movement too small to see.
And under a lot of the "it's stuck" reports there was one more structural fault, which is the next slide, Finishing what it starts.`,

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
