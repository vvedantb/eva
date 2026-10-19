---
name: redline-review
description: Screenshot every page a pull request changes in apps/web, at main and at the branch, and post a Redline summary on the PR. Use after pushing UI changes to apps/web, or when asked what a change did on screen.
---

# Redline review

Redline builds `main` and the branch, signs in as the agent user, screenshots the pages the change reaches, and reports what changed. Config: `apps/web/redline.config.json`. Hooks: `apps/web/redline.hooks.mjs`.

1. Push the branch and open its PR first: `--comment auto` finds the PR for the current branch.
2. Optional, once per sandbox: `pnpm --filter @eva/web redline:snapshot`. Both commits then see the same local Convex data, and screenshots are cached between runs.
3. Run `pnpm --filter @eva/web redline:pr`. It takes 1–5 minutes and posts or updates one comment on the PR.
4. Read `apps/web/.redline/report/summary.md`. Look at every page under "Looks broken" and "Pages to review" in `apps/web/.redline/report/index.html`. Fix what is wrong, or say in the PR why a change is intended.

Rules:
- Never commit `.redline/`. It holds screenshots and the data snapshot.
- Screenshots show local data. Do not post them outside the PR or this chat.
- Do not run it while the Preview Console dev server is compiling for the first time: two Vite builds at once can run the VM out of memory.
