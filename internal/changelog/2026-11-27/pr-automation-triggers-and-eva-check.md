# PR automation triggers and Eva commit check

- New trigger "a commit is pushed to a PR" runs an automation on every push to an open PR.
- New trigger "a PR is opened or a commit is pushed to it" covers the opening and every later push in one automation.
- Pushes that land during the 60 s debounce fold into one run, and the run uses the newest commit.
- The trigger event block in the agent's prompt now names the PR's head commit for opened, pushed and merged PRs.
- PR-event automations now show an "Eva: <automation title>" check on the PR's head commit, like Vercel's deploy check.
- The check shows running, then finished, cancelled or failed, and links to the automation's run history in Eva.
- A failed run shows a neutral grey mark, not a red failure, so an Eva or sandbox problem never blocks a merge.
