# Direct link: card and drawer match Eva's

- Sizes, spacing, type and radii now come from the real components, measured side by side (`AnnotationCommentCard`, `PreviewCommentsDrawer`, `PreviewCommentCard`) in light and dark. Only differences left are noted below.
- New theme tokens from Eva: popover, muted, warning, the tab trough and pill; the dark `border` and `field` values are fixed (they were measured without the neutral variant).
- Card: chevron disclosure with the element's HTML (copy button) and styles. Drawer: pages grouped under "All comments", Resolve and Reopen icons, "View in chat" (the token's grant carries the chat's Eva URL), a pulsing Working dot, the warning colour on Queued, floor-rounded times. Both fade in.
- Send to Eva now sends the element context object and Eva builds the prompt with the same code the Eva page uses: `parseAnnotationContext`, `buildAnnotationPrompt` and `annotationRef` moved to `@eva/shared/previewAnnotationContext`.
- Still different: Inter is not loaded on a direct link, so the font falls back; the React name chip needs a React page; Eva's spring motion is approximated with CSS; Sketch is Eva-only. `SCRIPT_VERSION` is `stream-v44`.
