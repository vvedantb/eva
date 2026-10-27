import { createElement, type CSSProperties } from "react";
import { Spinner, type UiConfig } from "@vvedantb/ui";

// Eva's look for the foundations family (spinners, loaders, status dot, list
// row, toaster, card, table, progress, separator, label, settings cards) on
// @vvedantb/ui.

// Eva logo colours (match public/icon.svg). Loaders use these, not theme
// tokens, so they read the same on every surface and theme. The web app's
// `.beam-colorful` mirrors them as `--eva-purple` / `--eva-blue`.
const EVA_PURPLE = "#8B3FB8";
const EVA_BLUE = "#3B7DD8";

// Eva logo geometry (matches public/icon.svg): the two halves of the mark.
const PURPLE_MARK = "0,256 217,237 256,64 295,237 512,256";
const BLUE_MARK = "0,256 217,275 256,449 295,275 512,256";

/**
 * Sonner keeps a handful of rules that are not gated on `data-styled`, and
 * they out-specify utility classes. Pointing these variables at design tokens
 * keeps the dark-theme close chip on the same colours as its classes below.
 * `fontFamily: inherit` beats sonner's hardcoded system font stack.
 */
const TOASTER_STYLE: CSSProperties & Record<`--${string}`, string> = {
  fontFamily: "inherit",
  "--normal-bg": "rgb(var(--card))",
  "--normal-border": "rgb(var(--border))",
  "--normal-text": "rgb(var(--foreground))",
  "--normal-bg-hover": "rgb(var(--muted))",
  "--normal-border-hover": "rgb(var(--border))",
};

export const foundationsConfig = {
  Spinner: {
    mark: {
      viewBox: "0 0 512 512",
      strokeWidth: 40,
      dashArray: "0.28 0.72",
      shapes: [
        { points: PURPLE_MARK, stroke: EVA_PURPLE },
        { points: BLUE_MARK, stroke: EVA_BLUE },
      ],
    },
    circle: { track: EVA_PURPLE, arc: EVA_PURPLE, lead: EVA_BLUE },
  },
  LoadingState: {
    label: "Churning",
    // Brand purple→blue sweep; blue leads, as on the circle Spinner's arc.
    colors: [
      EVA_PURPLE,
      `color-mix(in oklab, ${EVA_PURPLE}, ${EVA_BLUE})`,
      EVA_BLUE,
    ],
    classes: {
      label: "shimmer-text bg-clip-text text-2sm font-medium text-transparent",
    },
    labelStyle: {
      // Eva tokens are `R G B` triplets — wrap with rgb() for gradients.
      backgroundImage:
        "linear-gradient(90deg, rgb(var(--muted-foreground)) 35%, rgb(var(--foreground)) 50%, rgb(var(--muted-foreground)) 65%)",
      backgroundSize: "200% 100%",
    },
  },
  StatusDot: {
    classes: {
      tone: {
        progress: "bg-status-progress-bar",
        "business-review": "bg-status-business-review-bar",
        "code-review": "bg-status-code-review-bar",
        done: "bg-status-done-bar",
        cancelled: "bg-status-cancelled-bar",
        active: "bg-success",
        critical: "bg-destructive",
        neutral: "bg-muted-foreground/60",
      },
    },
  },
  ListRow: {
    classes: {
      root: "group relative overflow-hidden rounded-surface transition-[background-color] duration-[var(--motion-base)] has-[[data-slot=row-control]:focus-visible]:ring-2 has-[[data-slot=row-control]:focus-visible]:ring-ring/35",
      interactive: "motion-press active:scale-[0.99]",
    },
  },
  SonnerToaster: {
    closeButton: true,
    gap: 8,
    // Sonner's own default; the package default is 4.
    visibleToasts: 3,
    toastIcons: "filled24",
    // Replaces sonner's 16px bar spinner so the loading slot matches the 24px icons.
    loadingIcon: createElement(Spinner, {
      variant: "circle",
      size: "md",
      "aria-hidden": "true",
    }),
    style: TOASTER_STYLE,
    classes: {
      toaster: "",
      toast: [
        "group flex w-full cursor-pointer items-center gap-x-4 p-3 font-sans text-sm",
        "rounded-surface",
        "bg-card/95 text-foreground backdrop-blur-md smooth-shadow-ring-md",
        // Hides the content of collapsed toasts behind the front one.
        "[&[data-expanded=false][data-front=false]>*]:opacity-0",
      ].join(" "),
      // `relative` anchors sonner's absolutely-positioned `.sonner-loader`.
      icon: "relative flex h-6 w-6 shrink-0 items-center justify-center",
      content: "flex min-w-0 grow flex-col",
      title: "me-4 wrap-break-word font-medium text-foreground",
      // `!` beats sonner's `[data-sonner-theme=dark] [data-description]` colour.
      description: "me-4 wrap-break-word text-muted-foreground!",
      actionButton:
        "h-7 shrink-0 rounded-control bg-primary px-2.5 text-xs font-medium text-primary-foreground motion-press active:scale-[0.96] hover:bg-primary/90",
      cancelButton:
        "h-7 shrink-0 rounded-control bg-muted px-2.5 text-xs font-medium text-muted-foreground motion-press active:scale-[0.96] hover:bg-muted/80",
      closeButton:
        "pointer-events-none absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground opacity-0 transition-opacity duration-[var(--motion-base)] hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring group-hover:pointer-events-auto group-hover:opacity-100 max-sm:pointer-events-auto max-sm:opacity-100 max-sm:hit-target",
      // Eva's toasts carry no per-type or loader classes.
      loader: "",
      success: "",
      error: "",
      warning: "",
      info: "",
    },
  },
  Card: {
    classes: {
      root: "rounded-surface bg-card text-card-foreground",
      // No `md:` step: a call-site `p-3` must win outright (tailwind-merge
      // resolves conflicts within a variant, not across them).
      header: "flex flex-col gap-1.5 p-5",
      content: "p-5 pt-0",
      footer: "flex items-center p-5 pt-0",
    },
  },
  Table: {
    classes: {
      // `min-w-0` so the wrapper shrinks as a flex/grid child instead of
      // widening the page.
      wrapper: "relative w-full overflow-auto max-sm:min-w-0 max-sm:max-w-full",
      header: "[&_tr]:border-b",
      row: "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      head: "h-10 px-2 text-left align-middle font-medium text-muted-foreground has-[[role=checkbox]]:pr-0 *:[[role=checkbox]]:translate-y-[2px]",
      cell: "p-2 align-middle has-[[role=checkbox]]:pr-0 *:[[role=checkbox]]:translate-y-[2px]",
    },
  },
  Progress: {
    classes: {
      root: "relative h-2 w-full overflow-hidden rounded-full bg-secondary",
      indicator:
        "h-full w-full flex-1 bg-primary transition-transform duration-[var(--motion-base)]",
    },
  },
  Separator: {
    classes: { root: "shrink-0 bg-border" },
  },
  Label: {
    classes: {
      root: "text-sm font-semibold leading-none tracking-[-0.01em] cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
    },
  },
  // Settings cards sit on `bg-card` with eva's clamped surface radius; fields
  // inside step to `bg-muted` rather than the card tone.
  SettingsSection: {
    classes: {
      card: "rounded-surface bg-card [&_input]:bg-muted [&_textarea]:bg-muted [&_[data-slot=select-trigger]]:bg-muted [&_[role=combobox]]:border-input [&_[role=combobox]]:bg-muted",
      footer:
        "flex items-center justify-end gap-2 rounded-b-surface bg-muted px-4 py-3",
      body: { list: "divide-y divide-border/50 p-0" },
    },
  },
  SettingsEmptyState: {
    classes: { icon: "mb-5 text-muted-foreground" },
  },
} satisfies UiConfig;
