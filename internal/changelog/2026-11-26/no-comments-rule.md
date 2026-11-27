# No comments across the monorepo

- New `no-comments` skill and `comment-sicko` agent, adapted from pstack. The skill spawns the agent, which deletes comments and flags code that needs a comment to make sense.
- New oxlint rule `no-comments/no-comments` (`scripts/oxlint/no-comments.mjs`), an error for the whole repo. It keeps lint and tool directives, `*-ignore` pragmas, license headers, `/** */` doc comments on exports, and comments with a link.
- Ratchet: the last override in `.oxlintrc.json` turns the rule off for the files that still hold untriaged comments. Clean a file, then remove it from that list. Never add a file.
- The rule autofixes. `pnpm no-comments <path>` runs only this rule with `--fix`.
- Triage of apps, packages and scripts: 23 Haiku agents deleted tautology and stale comments. Decision records went to `docs/adr/comments-*.md`. Excuses went to `docs/comment-excuses.md`, one line each, to fix in code.
- The vendored `stageshow` folder stays as is.
