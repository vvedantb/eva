// eva's look for the @vvedantb/ui AI chat family: Conversation, Message,
// PromptInput (+ settings, traits), Queue, Shimmer, CodeBlock, Artifact and
// Attachments. The class strings are the ones the old @eva/ui components
// rendered; `__parity__/aichat.test.tsx` checks the DOM stays the same.
// FileChip and PromptInputSpeech moved as they were and need no entry.
import { createElement } from "react";
import { IconArrowUp, IconChevronDown } from "@tabler/icons-react";
import {
  getProviderLabel,
  ProviderIcon,
  Spinner,
  type UiConfig,
} from "@vvedantb/ui";

export const aichatConfig = {
  Conversation: {
    classes: {
      content: "flex flex-col gap-8 p-4",
      scroll: "scrollbar scroll-fade",
      download:
        "absolute top-4 right-4 rounded-full bg-background hover:bg-muted",
      // The pill sits in a static frame; the animated wrapper has no class.
      scrollButtonFrame:
        "pointer-events-none absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 justify-center",
      scrollButtonMotion: "",
      scrollButton:
        "pointer-events-auto h-7 gap-1.5 rounded-full border border-border/60 bg-card px-3 text-xs font-normal text-muted-foreground hover:border-border hover:bg-card hover:text-foreground",
    },
    scrollButton: {
      label: "Scroll to end",
      icon: createElement(IconChevronDown, { className: "size-3.5" }),
      // Brief stick-to-bottom settles and thread switches must not flash it.
      showDelay: 150,
      size: "sm",
      // Rises from, and sinks back toward, the bottom edge it points at.
      initial: { opacity: 0, y: 8, scale: 0.94 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: 8, scale: 0.94 },
      // `motionSpring` (utils/motion.ts).
      transition: { type: "spring", bounce: 0, duration: 0.35 },
    },
  },
  Message: {
    // A long chat has hundreds of action buttons; tooltips mount on first hover.
    lazyActionTooltips: true,
    classes: {
      root: "group flex w-full flex-col gap-0.5",
      user: "is-user ml-auto max-w-[95%] justify-end",
      content: [
        "flex min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
        "group-[.is-user]:ml-auto group-[.is-user]:w-fit group-[.is-user]:rounded-surface group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
        "group-[.is-assistant]:w-full group-[.is-assistant]:text-foreground",
      ].join(" "),
      branchSelector:
        "[&>*:not(:first-child)]:rounded-l-lg [&>*:not(:last-child)]:rounded-r-lg",
      branchIcon: "size-3.5",
    },
  },
  PromptInput: {
    classes: {
      // A file drag is the composer's only feedback, so the border takes the
      // primary colour and the field tints. Colour only, on the fast token.
      group:
        "overflow-hidden shadow-none transition-[color,box-shadow,border-color,border-radius] duration-[var(--motion-fast)]",
      groupIdle: "border-border",
      groupDragOver: "border-primary bg-primary/5",
      groupDefault: "rounded-control",
      textarea: "field-sizing-content min-h-16 max-h-40 overflow-y-auto",
      // The footer carries the model picker, selects and send button, wider
      // than a phone-width composer: wrap instead of squashing.
      footer: "justify-between gap-1 max-sm:flex-wrap",
      submit: "rounded-full",
      tabItem: "flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent",
    },
    submitIcons: {
      send: createElement(IconArrowUp, { className: "size-4" }),
      submitted: createElement(Spinner),
    },
    submitCrossfade: true,
    menuTriggerAsChild: true,
  },
  PromptInputSettings: {
    providerLabel: getProviderLabel,
    providerIcon: (provider) =>
      createElement(ProviderIcon, { provider, size: 14 }),
    classes: {
      trigger:
        "motion-press rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground active:scale-[0.92] disabled:opacity-50",
    },
  },
  TraitsPanel: {
    classes: {
      label:
        "w-[4.75rem] shrink-0 pt-1 text-2xs font-medium text-muted-foreground",
      empty: "flex h-6 items-center text-2xs text-muted-foreground/70",
      option:
        "h-6 rounded-md px-2 text-2xs font-medium motion-press transition-colors active:scale-[0.96]",
      note: "pl-[5.375rem] text-2xs leading-snug text-muted-foreground/80",
    },
  },
  Queue: {
    classes: {
      sectionTrigger:
        "group motion-press flex w-full items-center rounded-md px-1 py-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground active:scale-[0.99]",
    },
  },
  Shimmer: {
    // Compositor sweep with the `.shimmer-*` classes in apps/web globals.css.
    mode: "mask",
    as: "p",
  },
  CodeBlock: {
    // Plain text; callers pass their own `pre` as children.
    plain: true,
    // eva's copy button copies on every click, also while it shows the check.
    copyEveryClick: true,
    copyButtonSize: "sm",
    copyLabel: "Copy code",
    classes: {
      container: "relative bg-secondary rounded-surface",
      pre: "overflow-x-auto p-3 text-xs",
      copyButton:
        "absolute right-2 top-2 size-7 p-0 text-muted-foreground hover:text-foreground after:absolute after:inset-[-6px]",
      copyIcon: "size-3.5",
    },
  },
  Artifact: {
    actionSize: "sm",
    actionLabel: "sr-only",
    classes: {
      root: "flex flex-col overflow-hidden border bg-background rounded-surface",
      header:
        "flex items-center justify-between border-b bg-muted/50 px-4 py-3",
      description: "text-muted-foreground text-sm",
      action: "size-8 p-0 text-muted-foreground hover:text-foreground",
      content: "flex-1 overflow-auto p-4",
    },
  },
  Attachments: {
    classes: {
      item: {
        grid: "size-24 overflow-hidden rounded-surface",
        inline:
          "flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-surface border border-border px-1.5 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        list: "flex w-full items-center gap-3 border p-3 rounded-surface hover:bg-accent/50",
      },
      preview: {
        grid: "size-full bg-muted",
        inline: "size-5 rounded bg-background",
        list: "size-12 rounded bg-muted",
      },
      // `reveal-on-hover`: touch has no hover, so the button ships visible below `sm`.
      remove: {
        grid: "absolute top-2 right-2 size-6 rounded-full p-0 bg-background/80 reveal-on-hover transition-opacity hover:bg-background [&>svg]:size-3 after:absolute after:inset-[-7px]",
        inline:
          "size-5 rounded p-0 reveal-on-hover transition-opacity [&>svg]:size-2.5 relative after:absolute after:inset-[-10px]",
      },
    },
  },
} satisfies UiConfig;
