# Decision records moved out of comments: chrome-extension

Source: comment triage, 27 November 2026. Each line is file, symbol, decision. Written by Haiku agents; some entries state behaviour that the code already shows.

- apps/chrome-extension/src/background/convex.ts, getAuthedClient: a fresh Clerk JWT is fetched per call; reason: it survives token expiry and worker restarts, and the "convex" JWT template must match applicationID in the backend auth config or Convex rejects the token.
- apps/chrome-extension/src/background/convex.ts, getClerk: Clerk client sets syncHost so the extension inherits the Eva web session and follows the user's sign-in; reason: the user signs in once and the worker re-creates the client after a restart.
- apps/chrome-extension/src/background/convex.ts, module scope (void getClerk()): the Clerk client is warmed at worker start; reason: the first request is faster.
- apps/chrome-extension/src/background/index.ts, chrome.action.onClicked catch block: on a failed content-script message the visibility is reverted; reason: the badge and stored state must not drift from the real toolbar state on pages with no content script.
- apps/chrome-extension/src/background/index.ts, toolbar visibility (visKey/setVisibility): visibility is kept per tab in chrome.storage.session; reason: it survives worker restarts and navigations within a tab and resets when the browser session ends, so the toolbar defaults to hidden.
- apps/chrome-extension/src/content/AnnotationOverlay.tsx, task-id handling: new taskIds are persisted to saved pins; reason: they reach the backend, survive a reload, and the status poller reads tasks from the saved pins.
- apps/chrome-extension/src/content/index.ts, module scope (annotationMount): the annotation layer and toolbar mount eagerly; reason: both render nothing until activated, so an eager mount is cheap.
- apps/chrome-extension/src/content/react-extractor.ts, displayName extraction (function branch): displayName is narrowed with `in` instead of a type assertion; reason: React adds displayName as an extra property that the Function type does not declare, and the length check keeps the empty-name fallback to the function name.
- apps/chrome-extension/src/content/react-extractor.ts, parent walk: `parent` is annotated, not inferred; reason: inference from the narrowed `current` makes the two types mutually dependent (TS7022).
- apps/chrome-extension/src/content/toolbar-state.ts, inspect bridge (registerInspectController): the inspect overlay registers a controller from content/index.ts; reason: mode switching can start and stop it without this module depending on the React mount.
- apps/chrome-extension/src/shared/messaging.ts, background protocol banner: the content script calls the background worker through typed request messages instead of the removed side panel; reason: every backend call the side panel made now sits behind one of these message types, and the background does the Convex work.
- apps/chrome-extension/tailwind.config.js, accent-soft key: the accent-soft token is defined here; reason: the shared @eva/ui classes reference accent-soft for the soft fill.
- apps/chrome-extension/vite.config.ts, css.postcss: Tailwind v4 reads its config through @config in content.css and Lightning CSS handles prefixing, so autoprefixer is not used; reason: Lightning CSS makes autoprefixer unnecessary.
- apps/chrome-extension/vite.config.ts, resolve.dedupe: react, react-dom and @vvedantb/ui are deduplicated; reason: the UI provider and the toolbar must share one copy so the config applies.
