---
model: haiku
---

Stage relevant files, commit, and push to remote.

1. Run the `/changelog` step first: review this session's changes and, only if they amount to a medium-to-large change or feature (skip quick fixes and bug fixes), add an entry to the top of `internal/changelog/<YYYY-MM>.md` (the current month's file) per the `/changelog` rules. Stage this edit with the code in step 4.
2. Run `git status -u` and `git log --oneline -5` in parallel
3. Identify session-related files, excluding pre-existing dirty files
4. Stage with `git add` using specific paths (never `git add -A` or `.`)
5. Write commit message following repo convention (lowercase prefix: feat/fix/refactor) — summarize WHY, not WHAT
6. Commit with HEREDOC, then `git push`
7. Print commit hash and summary
