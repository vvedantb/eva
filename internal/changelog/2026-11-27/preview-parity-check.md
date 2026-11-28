# Keep the injected preview UI the same as Eva's

- `pnpm preview:parity` (in `/preflight`, not CI: it needs a browser) measures Eva's real `AnnotationCommentCard` and `PreviewCommentsDrawer` on the new dev route `/dev/preview-parity`, and the copies the proxy injects, on a mock page with a stub API and the same data. It compares padding, margins, type, radii, colours and borders in light and dark, and fails with the exact property that differs. Checked by changing one padding: it reports eight differences.
- `pnpm preview:parity --write-theme` re-measures Eva's tokens with `readPreviewToolbarTheme` and rewrites `themeFallback.generated.ts`, the palette a direct link uses. `theme.ts` no longer holds hand-typed colours.
- The first run found real gaps, fixed here: letter spacing on the field, the heading and feedback; the foreground colour; the field's focus border; the tab trough colour and gap; the secondary button colour. New tokens: `inputBorder`, `focusBorder`, `secondaryText`.
- `/preflight` lists the step.
