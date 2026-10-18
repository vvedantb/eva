# `@vvedantb/ui@0.2.2` adoption notes

Date: 2026-10-18.

## Moved to the package

- **Toaster:** `AppToaster` uses `SonnerToaster` with `toastRadius="surface"`, `toastIcons="filled24"`, `closeButtonStyle="hoverChip"`, `sonnerVars` and `descriptionMuted`, plus `gap={8}`.
- **Eva merges** (`EVA_TOAST_CLASS_NAMES` in `AppToaster.tsx`): `cursor-pointer`, `gap-x-4`, `p-3`, icon and content layout, `me-4 wrap-break-word`, `rounded-control h-7 motion-press active:scale-[0.96]` on action and cancel, and `duration-[var(--motion-base)]` on the close chip. Classes that fight a package utility use `!` because the package classes come first and CSS order decides ties.
- **Reply chime:** `useAgentReplyChime` calls `useReplyChime`. The package tones match Eva's old ones (880 Hz and 1174.66 Hz, same gains). `isOwnTurn` and the `replyChime` flag stay in Eva.
- **Kept in Eva:** `toast` re-export and `Toaster` in `packages/ui` (unused now), and `playNotificationBell`.

## Remaining gaps

- **Toaster, not verified in a browser.** Check these by eye: title and description size and line height (package `leading-snug`, `text-[13px]` overridden with `text-sm! leading-5!`), action and cancel hover and transition (package `transition-opacity` stays), close chip fade.
- **Sessions `SessionsHoverCard` not adopted.** Its content has no `Portal` (Eva's `HoverCardContent` portals, so the sidebar list cannot clip it), uses `bg-overlay rounded-lg` instead of `bg-popover/95 backdrop-blur-md rounded-surface`, and has no `max-sm:scrollbar`. Overriding with `className` would race `rounded-lg` against `rounded-surface` (tailwind-merge does not know the custom utility).
- **Chrome tabs.** `SessionChromeTab` nests `ContextMenuTrigger` around `HoverCardTrigger`. `SessionsHoverCard` owns its trigger and does not forward props or refs, so the context menu cannot attach.
- **Chime floor.** The 1 second floor is no longer shared with the bell. A reply chime and a bell in the same second can overlap.

## Suggested package changes

- `SessionsHoverCard`: wrap content in `HoverCardPrimitive.Portal`, accept `contentClassName` that replaces the surface classes, and forward trigger props and ref.
- `SonnerToaster`: accept `toastLayout="compact"` (`p-3 gap-x-4`) and `buttonRadius="control"` so apps need no `!` overrides.

## Colour check

`compat-shadcn-rgb.css` adds `--color-card: rgb(var(--card))` and `--color-muted: rgb(var(--muted))`. It does not redefine `--card` or `--muted`. A Tailwind compile of `bg-card`, `bg-card/95`, `bg-muted` and `bg-muted/80` with Eva's `tailwind.config.js` still reads `--card` and `--muted`. The only change is `rgb(var(--card) / 1)` to `rgb(var(--card))`, which renders the same. Eva's `tokens.css`, `base.css`, `tabs-pills.css` and `utilities.css` stay unimported (Eva defines `rounded-surface`).
