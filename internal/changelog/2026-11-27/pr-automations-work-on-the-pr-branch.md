# PR automations work on the PR branch and comment their result

- Automations triggered by a PR being opened or pushed to now check out the PR's own branch, not the default branch.
- Edits from those runs are pushed to the PR branch, instead of opening a separate Eva PR.
- A push an automation makes to a PR does not trigger another run, so automations cannot loop on their own commits.
- Fork PRs and merged PRs keep the old behaviour, because Eva cannot push to those branches.
- Each successful PR-event run posts its result as a new PR comment, which notifies PR watchers.
- The automation's previous comment on that PR is hidden as outdated, so only the latest result stays expanded.
