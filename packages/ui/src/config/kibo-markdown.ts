import type { UiConfig } from "@vvedantb/ui";

// Eva's look for the kibo blocks on @vvedantb/ui. Only the parts that use
// eva-only utilities are here (`motion-press`, `scrollbar-none`, `text-3xs`,
// `smooth-shadow-ring-*` and the `--motion-*` duration tokens); every other
// class is the vvedantb default, which is eva's markup. Markdown needs no
// entry: its look is `markdown.css`.

export const kiboMarkdownConfig = {
  Gantt: {
    classes: {
      root: "gantt relative isolate grid h-full w-full flex-none select-none overflow-auto scrollbar-none rounded-surface bg-card",
      today:
        "group pointer-events-auto sticky top-0 z-1 flex select-auto flex-col flex-nowrap items-center justify-center whitespace-nowrap rounded-b-md bg-primary px-2 py-0.5 text-3xs font-medium text-primary-foreground",
      todayDate:
        "max-h-0 overflow-hidden opacity-90 transition-[max-height] duration-[var(--motion-base)] group-hover:max-h-8",
      dragHandle:
        "-translate-y-1/2 absolute top-1/2 h-[80%] w-1 rounded-sm bg-muted-foreground opacity-0 transition-[opacity,translate] duration-[var(--motion-fast)]",
      offscreenIndicator:
        "absolute top-1/2 z-4 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-control border border-border bg-background/95 px-2 py-0.5 text-3xs font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground",
    },
  },
  Kanban: {
    classes: {
      card: "cursor-grab transition-[opacity,transform,scale] duration-[var(--motion-fast)] active:scale-[0.98]",
    },
    cardTransition:
      "scale var(--motion-fast) var(--motion-ease-out), opacity var(--motion-fast) var(--motion-ease-out)",
  },
  ThemeSwitcher: {
    classes: {
      button: "relative h-6 w-6 rounded-full motion-press active:scale-[0.94] hit-target",
    },
  },
  VideoPlayer: {
    classes: {
      root: "overflow-hidden rounded-surface smooth-shadow-ring-lg shadow-black/20",
      controlBar: "bg-zinc-950/95 px-1 *:transition-colors *:duration-[var(--motion-fast)]",
    },
  },
} satisfies UiConfig;
