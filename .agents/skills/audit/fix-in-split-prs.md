# Fix in split PRs

Use this when the user wants the audit findings fixed but reviewable. Each PR must merge alone, from `origin/main`.

## 1. Plan the split

- Group findings by area so PRs touch different files: wrong copies (small, ship first), stored-identifier builders, schema-derived types, constants, UI state, one PR per larger refactor (shared hook, ownership change).
- Keep each PR under ~40 files. If an agent hits the cap, it stops and reports the rest; open a follow-up PR for them.
- When two PRs must touch one file, assign the lines: tell each agent which nearby lines another PR owns.
- Put design choices the user made into the scope text verbatim.

## 2. Write one shared brief

Write it to a temp file (for example `/tmp/<audit>/BRIEF.md`) and tell every agent to read it first. It contains:

1. **Setup**: `git fetch origin && git checkout --no-track -b <branch> origin/main`; install deps under the lock (`flock /tmp/<audit>/heavy.lock pnpm install --offline --frozen-lockfile`); re-read every `file:line` in scope, because numbers drift.
2. **Repo rules**: paste the hard rules from `CLAUDE.md` / `AGENTS.md` (banned types and hooks, test policy, no lint/build/dev).
3. **Scope discipline**: stay inside the scope list; never "also fix" another PR's item; no visible change unless the scope says so.
4. **Verify**: typecheck only the packages touched, under the same `flock`; run existing tests next to changed code; grep to prove no copies remain.
5. **Ship**: commit, push by explicit refspec only, open the PR with `gh pr create --base main --head <branch>`; never push to main or force-push. Use the host's branch naming so the PR links back to the chat.
6. **Report**: PR URL, per-item done / partial / skipped with reason, every visible change and judgement call, typecheck results, follow-ups.

Skip changelog edits in the fix PRs; add one entry to the first PR at the end.

## 3. Launch

- One general-purpose agent per PR, `isolation: "worktree"`, all in one message, in the background.
- Do not do their work yourself while they run. Relay each result to the user as it lands: PR link, visible changes, risks.

## 4. Integrate and prove

```bash
git worktree add /tmp/<audit>/int origin/main
cd /tmp/<audit>/int && git checkout -b audit-integration
for b in <branches in merge order>; do git merge --no-edit "origin/$b" || { git diff --name-only --diff-filter=U; break; }; done
```

- Resolve each conflict, commit, continue. Write down each conflict and its resolution for the user.
- Typecheck the integration branch.
- Smoke-test in the running app if possible (see SKILL.md step 6).

## 5. Clean up

- `git worktree remove --force` every agent worktree and the integration worktree.
- Check `git ls-files -s .claude/worktrees` is empty on the session branch; `git rm --cached` any gitlinks.

## 6. Final report

A numbered merge order with one line per PR, then: expected conflicts with their fix, what was tested and what was not, every visible change (mark the ones you chose), open questions.
