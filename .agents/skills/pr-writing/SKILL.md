---
name: pr-writing
description: Write pull request descriptions that show the change works instead of only describing it, and say who did what when an AI agent wrote the code. Use whenever you open a pull request, write or update its description, or prepare a change for someone else to review.
---

# PR writing

A reviewer spends most of their time picturing what the author already saw: the page they opened, the command they ran, the test that went green. Put that in the description. Prose that describes a change is a claim, not evidence.

This skill covers the description only. Prepare it, show it to the user, and wait for their go-ahead before opening or editing the pull request, unless they've told you otherwise.

## 1. Say who did what

When an AI agent wrote the change, start the description with one line that tells the reviewer how much a human is behind it. Ask the user for their handle. Use `gh api user -q .login` only after confirming that the signed-in GitHub account is theirs, not a bot or a shared account.

| What the user did | First line |
|---|---|
| Gave the task and approved the approach | `> Written by an AI agent on behalf of @handle. @handle has not reviewed it yet.` |
| Wrote a spec (an issue, a doc, a plan) that you implemented | `> Written by an AI agent on behalf of @handle, following their spec. @handle has not reviewed it yet.` |
| Worked out the design with you: the architecture, the API, the trade-offs | `> Written by an AI agent on behalf of @handle, who shaped the solution. @handle has not reviewed it yet.` |

- Picking one of your options is approving an approach, not shaping the solution. When in doubt, use the plainer line.
- The line only changes to `@handle has reviewed it.` when the user tells you they've reviewed it. Keep it first, and keep it unchanged otherwise.
- Use it instead of any default footer such as "Generated with…". No `Co-Authored-By` trailers in commits.
- If the repository has a pull request template, keep the template and put the line above it.

## 2. Order the description for a skimmer

Most readers stop early, so put what matters first:

1. **The problem, in one paragraph.** What was wrong or missing, for whom, and how it showed up. Real numbers when there are any.
2. **What changed.** Short, grouped by area. Not a list of commits.
3. **Evidence** (section 3).
4. **Details** a reviewer needs: migrations, trade-offs, what you tried that didn't work, anything left to do.
5. **ELI5.** Two or three plain sentences someone outside the project would follow. If you can't write it, the change probably isn't clear yet.

## 3. Show it, with evidence that fits the change

| Change | Evidence |
|---|---|
| UI | Before and after screenshots of the same element, same viewport and crop. A short video for motion, hover, or a multi-step flow. A phone width when layout is involved. |
| CLI or build | The real output of the same command before and after, exit code included. Never retype or tidy it. |
| Bug fix | The input and the result before and after, and the regression test that failed first. |
| Performance | What you measured and how (machine, runs, inputs), the numbers on both sides, and how much they vary between runs. |
| AI or agent behaviour | The same set of real prompts on both sides, how answers were graded, time and cost per answer, and where the grading is unreliable. |
| New API or feature | The code someone would write to use it. A pure addition has no "before": show it on its own. |
| Anything else | A small table, a diagram, or an HTML page comparing both versions. |

For browser captures, `agent-browser` (github.com/vercel-labs/agent-browser) can open both versions, set the viewport, screenshot and record. `before-and-after` (github.com/vercel-labs/before-and-after) can attach the result to the pull request.

## 4. Keep it honest

- "After" is the current branch. "Before" is production, the base branch, or the last deploy. Never revert, stash, or switch branches to fake a "before".
- Look at every capture before using it, and check it shows what changed. Check that every image URL loads.
- Capture demo or sanitised data only: no real users, tokens, emails, or private messages.
- Report what went wrong too: a check that failed or couldn't run, a number that got worse, a part of the test plan nobody has done yet.
- Never commit screenshots or videos to the branch. Upload them to the pull request. If you can't host them, say so in the description.
- **Security fixes are the exception.** Don't publish a reproduction, a payload, or a step-by-step exploit in a public pull request. Describe the impact at a high level, follow the project's security policy, and keep the detailed evidence private until the fix is released.

## 5. Check before you hand it over

- The first line matches what the user actually did.
- Every claim in the description has evidence next to it, or says why there's none.
- The ELI5 is there and makes sense on its own.
- Nothing in it was invented: no numbers, results, or test runs you didn't see.
