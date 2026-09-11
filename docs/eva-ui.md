# Eva UI conventions

Read this when doing frontend / design work in `apps/web`.

## Surfaces (tone-based)

Surface tokens map 1:1 to the HeroUI palette: `--background` (page canvas) → `--card`/`--popover` (surface, elevated) → `--muted` (surface-secondary) → `--secondary` (default). Accent (`--primary`/`--accent`/`--ring`/`--chart-1`/sidebar accent), `--radius`, and `--font-*` are user-defined via theme settings — never hardcode them.

**Borders**

- Cards, surfaces, and content containers are defined by tone (`bg-card` / `bg-muted`) — no decorative hairline. Prefer `<Surface>` / `<Card>` / `ui-surface` over hand-rolled classes.
- Layout regions (sidebar edge, list/detail dividers) are separated by a hairline `border-border`/`border-sidebar-border`, not tonal contrast.
- Active/selected items use a surface fill (and `ring-*` when emphasis is needed); avoid relying on a resting hairline.
- Inputs/selects keep their form-affordance border. Floating overlays use `smooth-shadow-ring-*` (not a separate hairline).

**Shadows**

- Cards and surfaces are tone only (no `shadow-sm`). Floating overlays (dialogs, popovers, menus, tooltips, toasts) use `smooth-shadow-ring-*` from `shadow-plugin` — one continuous edge, never `border` + `shadow` on the same element.
- Non-modal overlays (popover, menu, tooltip, hover-card, select) use light glass (`bg-popover/95 backdrop-blur-md`) and Radix `origin-(--radix-*-transform-origin)`. Modal dialogs stay opaque with a scrim.

**Layout & surface colors**

- Sidebar shares the canvas tone (`--sidebar` = `--background`); it is distinguished by the region-divider border, not by being darker.
- Hierarchy comes from: surface tone steps > whitespace > typography weight/size.

**Hover & interaction**

- Hover: `hover:bg-*` (background shift). Active/selected: surface fill (and `ring-*` if extra emphasis is needed).
- Press: respond on pointer-down with `motion-press` + `active:scale-[0.9x]` on controls (buttons, tabs, selects, switches, menu items). Keep color transitions slower than the press transform.
- Enter/exit along the same path; default UI springs critically damped (`bounce: 0` / high damping). No `prefers-reduced-motion` support — never add `useReducedMotion` gates.
  **Spacing**

- Use whitespace/padding (Gestalt Law of Proximity) to group related elements; reach for borders/dividers only for structural separation (layout regions), not to outline soft surfaces.

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
- Primary tabs = path segments + index redirect to default; avoid local-only Tabs when the view must be linkable.

## Vite (`apps/web`)

- Any package using React Context must be in `resolve.dedupe` in `vite.config.ts`. pnpm can install multiple copies (different peer deps), causing "Context not found" runtime errors.
- When adding a new dependency that provides React hooks/context (e.g. `@tanstack/*`, `@clerk/*`, state managers), add it to the dedupe array.

## Nuqs

- Filters / sort state: use nuqs (`searchParams.ts` + `useQueryState` / `useQueryStates`), not local state — keeps shareable URL state.

## React Compiler (`apps/web`)

- Do not add `useMemo`/`useCallback` by default; only for proven identity/perf needs the compiler cannot cover.
- Compiler bails on a whole file for `finally`, a catch-less `try`, or `throw`/`?:`/`&&`/`??`/`?.`/loops inside `try` (`eva/no-value-block-in-try`).
- Never call a component as a function in render (`SessionChatHeader({...})`): the compiler memoises capitalised calls like pure values, so a cache hit skips the call, and if the callee runs hooks React throws #300 "Rendered fewer hooks than expected" (see PR #755/#758). Render components with JSX and name any hook-calling helper `use*`; `react/capitalized-calls` lints this as an error. A genuinely pure PascalCase call (e.g. `Intl.DateTimeFormat`) needs `new` or a lowercase local name.
- `pnpm lint`, `pnpm typecheck` and `node scripts/compiler-check.mjs` run in CI on every PR, so a new compiler bailout or lint error blocks merge.
