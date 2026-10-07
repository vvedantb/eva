/**
 * Instructions for the event-triggered system automations. Each is appended to
 * the event details Eva sends: into the PR's own chat for the first two, into
 * the new quick task's description for the third.
 */

export const CI_AUTOFIX_PROMPT = `CI failed on this chat's pull request. The failing checks and the tail of their logs are above.

- Find the root cause from the logs before you change anything. Reproduce it locally where you can.
- Fix the cause, not the symptom. Do not skip, delete or weaken tests or checks to make them pass.
- If the failure is unrelated to this PR (flaky test, infra outage, missing secret), say so plainly and change nothing.
- Commit and push the fix to this PR's branch.`;

export const REVIEW_RESPONDER_PROMPT = `A reviewer left new feedback on this chat's pull request. It is quoted above.

- Address each point. Where a comment is a question, answer it in your reply rather than changing code.
- If you disagree with a request, explain why instead of making the change.
- Commit and push the changes to this PR's branch, then summarise what you did for each comment.`;

export const ISSUE_TO_TASK_PROMPT = `Resolve the GitHub issue above.

- Confirm the problem in the code before you change anything.
- Keep the change focused on this issue.
- Put "Closes #<issue number>" in the pull request description so merging it closes the issue.`;
