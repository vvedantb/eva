# Eva UI conventions

Read this when doing frontend / design work in `apps/web`.

Skeleton loading states: see `docs/skullet.md` (use `LoadingSkeleton`, not `skullet/react`).

## Surfaces (tone-based)

Surface tokens map 1:1 to the HeroUI palette: `--background` (page canvas) → `--card`/`--popover` (surface, elevated) → `--muted` (surface-secondary) → `--secondary` (default). Accent (`--primary`/`--accent`/`--ring`/`--chart-1`/sidebar accent), `--radius`, and `--font-*` are user-defined via theme settings — never hardcode them.

**Borders**

- Cards, surfaces, and content containers are defined by tone (`bg-card` / `bg-muted`) — no decorative hairline. Prefer `<Surface>` / `<Card>` / `ui-surface` over hand-rolled classes.
- Layout regions inside a page (list/detail dividers) are separated by a hairline `border-border`. The app chrome has no resting lines: see "Rails, tracks and the sandbox card".
- Tab strips and panel headers have no bottom hairline: whitespace and the tone step to the content separate them.
- Active/selected items use a surface fill (and `ring-*` when emphasis is needed); avoid relying on a resting hairline.
- Inputs/selects keep their form-affordance border. Floating overlays use `smooth-shadow-ring-*` (not a separate hairline).

**Shadows**

- Cards and surfaces are tone only (no `shadow-sm`). Floating overlays (dialogs, popovers, menus, tooltips, toasts) use `smooth-shadow-ring-*` from `shadow-plugin` — one continuous edge, never `border` + `shadow` on the same element.
- Non-modal overlays (popover, menu, tooltip, hover-card, select) use light glass (`bg-popover/95 backdrop-blur-md`) and Radix `origin-(--radix-*-transform-origin)`. Modal dialogs stay opaque with a scrim.

**Layout & surface colors**

- Sidebar shares the canvas tone (`--sidebar` = `--background`); neither the rail nor the panel has an edge line.
- Hierarchy comes from: surface tone steps > whitespace > typography weight/size.

**Hover & interaction**

- Hover: `hover:bg-*` (background shift). Active/selected: surface fill (and `ring-*` if extra emphasis is needed).
- Press: respond on pointer-down with `motion-press` + `active:scale-[0.9x]` on controls (buttons, tabs, selects, switches, menu items). Keep color transitions slower than the press transform.
- Enter/exit along the same path; default UI springs critically damped (`bounce: 0` / high damping). No `prefers-reduced-motion` support — never add `useReducedMotion` gates.
- Never remount `.beam-halo` or put `filter: blur()` / `drop-shadow()` on a continuously animated beam. The halo was the leftover GPU floor (composer ~3.2→1.0 cores, lock pane ~7.4→2.5).

**Spacing**

- Use whitespace/padding (Gestalt Law of Proximity) to group related elements; reach for borders/dividers only for structural separation (layout regions), not to outline soft surfaces.

## Rails, tracks and the sandbox card

Groups of controls sit on a **track**: the segmented-tabs trough (`--secondary` light, `--card` dark), with the active item on the lighter pill (`--segment-active`). The gap between tracks divides groups, so the chrome has no edge lines, separators or resting dividers.

**App rail**

- `RepoRail` uses `Sidebar.RailGroup` (`@vvedantb/ui`) with `railGroupThemeClass` (`rail-track` in `globals.css`, which also fixes the package's dark-mode pill). Three groups: Home / Inbox / Sessions, the repos (centred with `justify-center-safe`), and the bottom actions.
- One pill per group slides to the active tile with the tabs motion (`--tabs-dur`, `--tabs-ease`); moving to another group snaps.
- No rail edge, no `RailSeparator`. The sidebar panel beside it has no edge line either; its own nav highlight stays the grey `bg-sidebar-accent` (a list, not a tab group).
- Rail icons are 22px. Home uses the package `IconEva`, with no disc, so its pill shows.
- An uploaded repo banner in the panel header is inset — its top level with the rail's first track (12px), ~8px from the rail track and the panel edge — with `rounded-t-surface` corners, in a 128px header (`h-32`, reserved for every repo so a loading banner does not shift the nav); the panel itself has no fill, margin or radius.

**Button tracks**

- Header actions (session, quick task and project) sit on one track: `CHAT_HEADER_ACTIONS_CLASS` (`ChatPageWrapper`); it hides when empty.
- Buttons on any `rail-track` are flat: no resting fill; hover is half the pill. Carry state with the icon colour — wake is a green play, sleep a red stop — never a filled destructive button on a track.
- Primary filled actions (Run, Build, Stop Build) stay outside the track.

**Sandbox rail and card**

- The sandbox rail puts the tools on a `SANDBOX_RAIL_GROUP_CLASS` track and the tabs on a `tabs-segmented` list, centred in the rail. There is no collapse button: pressing the active tab shows or hides the card (Ctrl+Alt+B too). Empty rails (no sandbox yet) keep `SandboxPanelToggleButton`.
- The sandbox split has no resting divider (`ResizablePanelLayout` `seamlessSeparator`; the line and grip show on hover and drag).
- The content is a `bg-card` card (`md:my-2 md:mr-1.5 md:rounded-surface`) with an arrow at the active rail tab (`SandboxPanelFrame`, `.sandbox-tab-arrow`). Panels inside stay transparent so the card shows through — no `bg-background` on a panel root. The arrow renders before the positioned card, so the card covers its inner half.
- The card moves like a macOS dock window (`dockMotion.ts` via `sandboxCardMotion.ts`): it grows out of the active tab on open, shrinks back into it on close, and settles on a tab switch. The left sidebar panel uses the same motion on hide and show only, into the "Hide sidebar" tile (`sidebarPanelMotion.ts`); app switches do not move it. Only "Disable page animations" skips them.
- Desktop only: the phone tab strip keeps its own layout.

**Radius**

- Use the theme radius tokens (`rounded-surface`, `rounded-control`, `rounded-menu-item`, `rounded-full`); `scripts/design-check.mjs` rejects raw `rounded-lg/xl/[…]` in new code.

## Component structure

- Max ~250 lines per client component
- Route-level `*Client.tsx` = thin orchestrator (queries, top-level state, layout composition)
- Route-local child components go in `_components/` folder
- Pure helper functions go in `_utils.ts` at route level
- Presentational components (no hooks, no `"use client"`) stay as plain function components
- Only add `"use client"` to child components that use hooks/interactivity
- Inline sub-components defined in the same file should be extracted to `_components/`

## TanStack Router

- Never use `window.location.href` for navigation. Always use `useNavigate` from `@tanstack/react-router` or the `<Link>` component.
- `window.location.href` causes a full page reload, losing client-side state. TanStack Router navigation preserves SPA behavior.
- Primary tabs = path segments + index redirect to default; avoid local-only Tabs when the view must be linkable. Exception: a session's chat tab is `?chat=N` (`chatParser`), because the chat axis is orthogonal to the `$sandboxTab` / `review/*` segments already under `$numId`.

## Vite (`apps/web`)

- Any package using React Context must be in `resolve.dedupe` in `vite.config.ts`. pnpm can install multiple copies (different peer deps), causing "Context not found" runtime errors.
- When adding a new dependency that provides React hooks/context (e.g. `@tanstack/*`, `@clerk/*`, state managers), add it to the dedupe array.

## Nuqs

- Filters / sort state: use nuqs (`searchParams.ts` + `useQueryState` / `useQueryStates`), not local state — keeps shareable URL state.

## React Compiler (`apps/web`)

- Do not add `useMemo`/`useCallback` by default; only for proven identity/perf needs the compiler cannot cover.
- Compiler bails on a whole file for `finally`, a catch-less `try`, or `throw`/`?:`/`&&`/`??`/`?.`/loops inside `try` (`vvedantb/no-value-block-in-try`).
- Never call a component as a function in render (`SessionChatHeader({...})`): the compiler memoises capitalised calls like pure values, so a cache hit skips the call, and if the callee runs hooks React throws #300 "Rendered fewer hooks than expected" (see PR #755/#758). Render components with JSX and name any hook-calling helper `use*`; `react/capitalized-calls` lints this as an error. A genuinely pure PascalCase call (e.g. `Intl.DateTimeFormat`) needs `new` or a lowercase local name.
- `pnpm lint`, `pnpm typecheck`, `node scripts/compiler-check.mjs` and `node scripts/design-check.mjs` run in CI on every PR, so a new compiler bailout, design-system drift, or lint error blocks merge.
