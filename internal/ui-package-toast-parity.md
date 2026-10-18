# `@vvedantb/ui@0.2.3` adoption notes

Date: 2026-10-18.

## Moved to the package

- **Subpath imports:** the `apps/web/src/lib/vvedantbUi.ts` shim is gone. Code imports `SonnerToaster` from `@vvedantb/ui/sonner`, and `useReplyChime` and `playTone` from `@vvedantb/ui/audio`. Never use the root barrel (its `speech-input.tsx` clashes with Eva's `Window.SpeechRecognition`).
- **Toaster:** `AppToaster` keeps `toastRadius="surface"`, `toastIcons="filled24"`, `closeButtonStyle="hoverChip"`, `sonnerVars`, `descriptionMuted`, `gap={8}` and `position="top-right"`. It does not use `density="compact"` (`text-xs`, `py-2`, `gap-2` worsen parity with Eva's `text-sm`, `p-3`, `gap-x-4`). It does not use `toastRadius="control"` (that is `rounded-field`, not Eva's `rounded-control`).
- **Eva merges, now smaller:** dropped `gap-x-4!` (property order lets `gap-x` beat `gap`), `py-3!` (same as the package), `text-sm! leading-5!` on the title (the toast already sets `text-sm`) and the collapsed-content opacity rule (the package `sonner.css` hides it). Kept `px-3!`, `text-sm! leading-5!` on the description, and the `rounded-control!`, fill and hover merges on both buttons.
- **Local `Toaster`:** deleted from `packages/ui/src/ui/sonner.tsx`, with its icons. The file now only re-exports `toast`, so `import { toast } from "@eva/ui"` still works.
- **Audio floor:** `notificationChime.ts` calls `playTone(NOTIFICATION_BELL)`. The bell and the reply chime now share one 1 second floor. The bell has the same frequencies, durations and gains as before. Eva has no private `AudioContext` any more. `playTone` is not wrapped in `withAudioFloor`, because it already takes the floor.
- **Hover cards:** `SidebarSessionItem` (`openDelay` 250, `closeDelay` 100, `right`, `start`, offset 8, `surface="glass"`) and `SessionChromeTab` (`openDelay` 400, `bottom`, `start`, offset 6, `surface="glass"`) use `SessionsHoverCard` with `SessionHoverCardBody` as `body`. The tab nests `ContextMenu > SessionsHoverCard > ContextMenuTrigger asChild`. `globals.css` has a `@source` for `shell/`.

## Remaining gaps

- **Not checked in a browser.** Check by eye: toast padding and type size, button hover, close chip fade, hover card glass fill and radius, and that the tab context menu and the hover card both open.
- **Hover card body wrapper.** The package wraps `body` in `text-sm text-muted-foreground`. `SessionHoverCardBody` sets its own classes, but confirm that no text turns muted.
- **Width and padding.** The package default `w-64 p-3` matches Eva's old `className`.
- **Not migrated:** Docs, Testing Arena and Automation lists still use `SidebarListHoverCard` on `@eva/ui` `HoverCard`.
- **`!` merges left:** the package toaster has no prop for Eva's button radius (`rounded-control`), `px-3` or description size, so those stay as `!` merges.

## Colour check

Still OK. `compat-shadcn-rgb.css` adds `--color-card: rgb(var(--card))` and `--color-muted: rgb(var(--muted))`. It does not redefine `--card` or `--muted`, so `bg-card/95`, `bg-muted` and `bg-muted/80` still read Eva's variables. Eva's `tokens.css`, `base.css`, `tabs-pills.css` and `utilities.css` stay unimported.
