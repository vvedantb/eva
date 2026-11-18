# Skullet (skeleton loading states)

Read this before you add a skeleton loading state in `apps/web`.

## What it is

- [skullet](https://github.com/lochie/skullet) (MIT, one maintainer) draws a skeleton in the exact shape of the content it replaces. It works with React, Vue and Svelte.
- It renders the content out of sight, measures each element, and draws grey bars and blocks over it.
- We pin `0.0.3` in `apps/web`. It is an early release. Expect API changes.

## How we use it

Use our wrapper `LoadingSkeleton` (`apps/web/src/lib/components/LoadingSkeleton.tsx`). Do not import `skullet/react` directly.

```tsx
<LoadingSkeleton id="teams-list" data={teams} label="Loading teams" empty={<EmptyState … />}>
  {(rows) => <Grid rows={rows} />}
</LoadingSkeleton>
```

- `data` is a Convex list query result (`undefined` while loading).
- `id` must be unique per list. It keys the remembered shape.
- Put the wrapper in the component that calls `useQuery`. If a child fetches its own data, move the query up first.
- Pages that use it now: Artifacts (`artifacts-global`), Teams (`teams-list`).

## What the wrapper fixes

| Case | Raw Skullet | `LoadingSkeleton` |
| --- | --- | --- |
| First visit (no saved shape) | Blank area, then a layout jump | `CenteredSpinner` |
| Revisit | Remembered shape | Remembered shape (same) |
| Empty list | Saves an empty shape for next time | Shows `empty`; saves no shape |

- The first-visit check reads Skullet's internal localStorage key `skullet:shapes` (format `v: 2`) through Zod. If Skullet changes that format, the parse fails and the page shows the spinner. Nothing breaks.

## Gotchas

- **No `sample` prop for Convex rows.** `sample` must be a full row with real `Id<…>` values. That needs a type cast, which we ban. We rely on the remembered shape (`id`) instead.
- **`loading` with data present draws nothing.** Holding `loading` on while `data` is set gives a zero-height skeleton in 0.0.3. Do not use `loading` as a refetch indicator.
- **Shapes over 20,000 characters stay in memory only.** Skullet does not write them to localStorage, so after a reload the wrapper shows the spinner.
- **Saved shapes hold no text, but they show list sizes.** Follow-up: call `forgetShapes()` on sign-out.
- **The skeleton rarely shows on a cold load.** On a full reload, the Convex auth screen gates the whole app. When the page mounts, its query is usually only milliseconds away.
- **A shared query makes the skeleton never show.** The sidebar subscribes to `api.teams.list`, so client navigation to Teams has data at once. The `convex-helpers` query cache also keeps results for 5 minutes after unmount.
- **Best fit:** pages with slow queries that no other mounted component already loads.

## How to see a skeleton in dev

A normal load is too fast to see or screenshot. For a manual check:

1. Load the page once, so Skullet saves its shape.
2. Make a temporary edit: pass `data={undefined}` to the wrapper. Revert it after the check.
3. Reload. You see the remembered skeleton.
4. Clear `skullet:shapes` in localStorage and reload. You see the first-visit spinner.

Approaches that did not work: CDP `Network.setBlockedURLs` (does not block the Convex websocket), CPU throttling (data still won the race), and going offline before client navigation (lazy route chunks fail and Chrome does a full load).

## Dependency policy

- `pnpm-workspace.yaml` blocks packages younger than 7 days (`minimumReleaseAge`). Skullet `0.0.3` (published 31 October 2026) has an exclusion entry. That entry can go now, because the version is past the 7-day soak.
- Debug output: add `?skullet-debug` to the URL, or set `skullet:debug` = `1` in localStorage.
