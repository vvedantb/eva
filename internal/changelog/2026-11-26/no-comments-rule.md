# No comments in apps/web

- New `no-comments` skill and `comment-sicko` agent, adapted from pstack. The skill spawns the agent, which deletes comments and flags code that needs a comment to make sense.
- New oxlint rule `no-comments/no-comments` (`scripts/oxlint/no-comments.mjs`), an error in `apps/web/src`. It keeps lint and tool directives, `*-ignore` pragmas, license headers, `/** */` doc comments on exports, and comments with a link.
- The rule autofixes. `pnpm no-comments <path>` runs only this rule with `--fix`, so another package can adopt it the same way.
- Applied to `apps/web/src`: about 7,800 comment lines removed from 816 files. The vendored `stageshow` folder stays as is.
- Suppressions such as `oxlint-disable ... -- reason` stay, so their reasons now carry what effect comments used to say.
