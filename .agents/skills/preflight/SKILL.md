---
name: preflight
description: >-
  Run repo health checks that used to live in husky hooks (typecheck, React
  Compiler bailouts, design-system drift, lint, tests). Use when the user says preflight, /preflight, run
  checks before push, or asks to typecheck the monorepo occasionally.
disable-model-invocation: true
---

# Preflight

On-demand replacement for disabled husky gates. Run from repo root. Fix failures before continuing; do not skip unless the user says so.

## Steps

1. **Typecheck** (web + backend + callback):

```bash
pnpm typecheck
```

2. **React Compiler bailouts**:

```bash
pnpm compiler:check
```

3. **Design-system drift**:

```bash
pnpm design:check
```

4. **Lint** (whole tree; former lint-staged scope was staged files only):

```bash
pnpm lint
```

5. **Preview parity** (only when the preview toolbar, comment card or comments drawer changed; needs the web dev server and `agent-browser`, so CI skips it):

```bash
pnpm preview:parity
```

   It compares Eva's `AnnotationCommentCard` and `PreviewCommentsDrawer` with the copies the proxy injects into a direct sandbox link. If only the colours moved, `pnpm preview:parity --write-theme` re-measures Eva's tokens and rewrites `themeFallback.generated.ts`.

6. **Tests** (web + backend `bun test`, script tests; CI runs the same command):

```bash
pnpm test
```

7. **Commit hygiene** (manual — hooks are off):
   - No `Co-authored-by: Cursor` / `Made-with: Cursor` in commit messages
   - No stray lone `@` line in the message (PowerShell here-string leak)

## Notes

- Do **not** run `convex codegen` as part of preflight (uploads to the linked deployment).
- Husky hooks under `.husky/` are commented out on purpose; re-enable there if you want gates back on every commit/push.
- Optional format pass on dirty files: `./node_modules/.bin/lint-staged` (needs staged files) or Prettier on specific paths.
