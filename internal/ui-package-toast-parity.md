# `@vvedantb/ui` toast parity gap

Date: 2026-10-18. Eva keeps `Toaster` from `@eva/ui` (`packages/ui/src/ui/sonner.tsx`). `SonnerToaster` in `@vvedantb/ui@0.2.1` does not match it.

`SonnerToaster` spreads `{...props}` after its own `toastOptions`. Passing `toastOptions` from Eva would replace all of its classes. A wrapper would then copy Eva's whole toaster, so switching has no benefit.

## What the package needs for parity

- **Radius:** use `rounded-surface` (`clamp(0.75rem, var(--radius), 1rem)`), not `rounded-lg`.
- **Layout:** use `p-3 gap-x-4 cursor-pointer font-sans`, not `px-4 py-3 gap-3`.
- **Gap and stacking:** Eva uses `gap={8}`. The package uses `gap={12}`, `expand={false}`, `visibleToasts={4}`.
- **Icons:** Eva passes 24px HeroUI-style icons for success, info, warning and error. It uses a `CircleSpinner` for loading and a 14px round cross for close. The package uses sonner defaults (16px).
- **Close button:** Eva uses a circular chip at the top-right (`-right-2 -top-2`). It shows on hover (`group-hover`) and always on small screens (`max-sm`). The package renders a text-style button (`bg-default px-2.5 py-1`) in flow.
- **Font:** Eva sets `fontFamily: "inherit"` in `style` so toasts follow `--font-sans`. The package uses `!font-sans`. Check that `--font-sans` reaches it.
- **Sonner variables:** Eva sets `--normal-bg`, `--normal-border`, `--normal-text`, `--normal-bg-hover`, `--normal-border-hover` from `rgb(var(--card|border|foreground|muted))`. The package sets none.
- **Description colour:** Eva uses `text-muted-foreground!`. The `!` is needed because sonner's dark-theme description rule wins otherwise. The package uses no `!`.
- **Action and cancel buttons:** Eva uses `rounded-control`, `h-7`, `motion-press` and `active:scale-[0.96]`.
- **Title:** Eva wraps long text (`wrap-break-word`, `me-4`). The package sets none.
- **Fill:** `glass-panel-strong` is defined in Eva's `globals.css` as `bg-card/95 backdrop-blur-md`. This matches.
- **Variant tints:** Eva tints icons through the icon components. The package uses `[&_[data-icon]]:text-*`. This needs sonner to render `data-icon`, which is not confirmed with custom icons.
- **Not in `@vvedantb/ui`:** `smooth-shadow-ring-md`, `motion-press`, `hit-target` and `reveal-on-hover` are Eva utilities. Eva defines them, so they work here.

## Suggested package change

Export a `createToasterClassNames` option or accept `classNames` and `icons` as merged props, so an app can override pieces without replacing the whole `toastOptions`.
