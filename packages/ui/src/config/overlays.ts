// eva's look for the @vvedantb/ui overlay family: Dialog, SideSheet (eva's
// old `Sheet`), Popover, HoverCard, Tooltip, DropdownMenu, ContextMenu, Select
// and Command. The class strings are the ones the old @eva/ui components
// rendered; `__parity__/overlays.test.tsx` checks the DOM stays the same.
import { createElement } from "react";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCircleFilled,
  IconSearch,
} from "@tabler/icons-react";
import type { UiConfig } from "@vvedantb/ui";

/**
 * Radix defaults to 700ms open / 300ms close. Call sites had drifted to 0, 200,
 * 250 and 400 — the same gesture felt different depending on which chip you
 * hovered. One pair of values here; sites only override to opt out (0) or to
 * ask for a longer wait where the card is easy to trip over.
 */
export const HOVER_CARD_OPEN_DELAY_MS = 250;
export const HOVER_CARD_CLOSE_DELAY_MS = 100;

/**
 * Radix defaults to a 700ms open delay. On a desktop tool with a precise
 * pointer that reads as lag, and most providers in the app never passed a
 * value — so the house default is set here rather than at 23 call sites.
 */
export const TOOLTIP_DELAY_MS = 300;

const overlayClass =
  "fixed inset-0 z-50 bg-black/80 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

/** Popover, hover card and select panels slide in from the side they open on. */
const floatingMotionClass =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:data-[side=bottom]:slide-out-to-top-2 data-[state=closed]:data-[side=left]:slide-out-to-right-2 data-[state=closed]:data-[side=right]:slide-out-to-left-2 data-[state=closed]:data-[side=top]:slide-out-to-bottom-2";

/**
 * Scale+fade from the trigger, matching `PopoverContent` — menus and popovers are
 * the same class of non-modal overlay, so they move the same way.
 *
 * The exit is deliberately faster than the enter (75ms vs 150ms). An earlier
 * symmetric version made composer menus (traits, model) feel sticky on click:
 * the cost was the menu lingering *after* a selection, not the open itself, so
 * the fix is a quick outbound path rather than no motion at all.
 *
 * `origin` must be the Radix transform-origin var class for the specific
 * primitive — pass it literally so Tailwind can see it.
 */
export function menuContentClass(origin: string): string {
  return [
    // Height cap + internal scroll (`dvh`, never `vh`) so a long menu stays on
    // screen on a phone, and a width cap so `min-w-48` cannot widen the page at
    // a 320px viewport.
    "z-50 min-w-48 overflow-hidden max-sm:max-w-[calc(100vw-2rem)] max-sm:max-h-[85dvh] max-sm:overflow-y-auto bg-popover/95 p-1.5 text-popover-foreground backdrop-blur-md smooth-shadow-ring-lg",
    "rounded-surface",
    origin,
    "duration-150 data-[state=closed]:duration-75 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
  ].join(" ");
}

const dropdownMenuContentClass = menuContentClass(
  "origin-(--radix-dropdown-menu-content-transform-origin)",
);
const contextMenuContentClass = menuContentClass(
  "origin-(--radix-context-menu-content-transform-origin)",
);

/**
 * `min-h-10` below `sm` puts menu rows at the 40px comfortable-tap floor while
 * desktop keeps the tighter intrinsic height. Growing the box instead of its
 * padding keeps a call site's `py-*` in control above the breakpoint
 * (`tailwind-merge` only resolves conflicts within one variant group).
 */
const menuRowClasses = {
  subTrigger:
    "flex cursor-pointer items-center gap-1.5 rounded-menu-item px-2.5 py-2 max-sm:min-h-10 text-sm outline-hidden transition-colors motion-press active:scale-[0.98] focus:bg-muted data-[state=open]:bg-muted [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  item: "relative flex cursor-pointer select-none items-center gap-1.5 rounded-menu-item px-2.5 py-2 max-sm:min-h-10 text-sm outline-hidden transition-colors motion-press active:scale-[0.98] focus:bg-muted focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
  checkboxItem:
    "relative flex cursor-pointer select-none items-center gap-1.5 rounded-menu-item py-2 max-sm:min-h-10 pl-9 pr-2.5 text-sm outline-hidden transition-colors motion-press active:scale-[0.98] focus:bg-muted focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
  radioItem:
    "relative flex cursor-pointer select-none items-center gap-1.5 rounded-menu-item py-2 max-sm:min-h-10 pl-9 pr-2.5 text-sm outline-hidden transition-colors motion-press active:scale-[0.98] focus:bg-muted focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
  label: "px-2.5 py-1 text-2xs font-medium tracking-[-0.01em] text-muted-foreground",
  separator: "-mx-1.5 my-1.5 h-px bg-border",
  shortcut: "ml-auto text-2xs tracking-[0.08em] text-muted-foreground",
};

const menuIcons = {
  check: createElement(IconCheck, { size: 16 }),
  radio: createElement(IconCircleFilled, { size: 8, className: "fill-current" }),
};

export const overlaysConfig = {
  Dialog: {
    // A centred dialog at every size; eva has no mobile bottom sheet.
    viewportAware: false,
    classes: {
      trigger: "cursor-pointer",
      overlay: overlayClass,
      // `dvh`, not `vh`: mobile browser chrome makes `100vh` taller than the
      // visible area, so a `90vh` dialog runs off the bottom of the screen.
      content:
        "t-modal fixed left-[50%] top-[50%] z-50 flex flex-col w-[92vw] max-sm:w-[calc(100vw-2rem)] max-w-lg max-h-[90dvh] gap-4 rounded-surface bg-card p-6 smooth-shadow-ring-xl overflow-hidden",
      centered: "",
      close:
        "max-sm:hit-target absolute right-4 top-4 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground motion-press active:scale-[0.94] hover:bg-muted hover:text-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none",
      header: "flex shrink-0 flex-col gap-1.5 text-center sm:text-left",
      body: "flex-1 min-h-0 overflow-y-auto -mx-6 px-6",
      footer: "flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      title: "text-lg font-semibold leading-none tracking-[-0.02em]",
      description: "text-sm text-muted-foreground",
    },
  },
  SideSheet: {
    classes: {
      trigger: "cursor-pointer",
      overlay: overlayClass,
      // `dvh` + a viewport width guard so the panel cannot exceed the visible
      // area on a phone when a caller forgets to size it.
      content:
        "fixed z-50 flex flex-col h-full top-0 max-sm:h-dvh max-sm:max-w-[100vw] border-border bg-card smooth-shadow-ring-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out",
      left: "left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
      right:
        "right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
      close:
        "absolute right-3 top-3 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground motion-press active:scale-[0.94] hover:text-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 after:absolute after:inset-[-6px]",
    },
  },
  Popover: {
    sideOffset: 4,
    collisionPadding: 8,
    classes: {
      trigger: "cursor-pointer",
      // Caps its height and scrolls internally so a long popover cannot run
      // off a phone screen; `max-w` keeps `w-72` inside a 320px viewport.
      content: `z-50 w-72 max-sm:max-w-[calc(100vw-2rem)] max-sm:max-h-[85dvh] max-sm:overflow-y-auto max-sm:scrollbar bg-popover/95 p-4 text-popover-foreground backdrop-blur-md smooth-shadow-ring-lg outline-hidden origin-(--radix-popover-content-transform-origin) rounded-surface ${floatingMotionClass}`,
    },
  },
  HoverCard: {
    openDelay: HOVER_CARD_OPEN_DELAY_MS,
    closeDelay: HOVER_CARD_CLOSE_DELAY_MS,
    portal: true,
    classes: {
      content: `z-50 w-64 max-sm:max-w-[calc(100vw-2rem)] max-sm:max-h-[85dvh] max-sm:overflow-y-auto max-sm:scrollbar bg-popover/95 p-4 text-popover-foreground backdrop-blur-md smooth-shadow-ring-lg outline-hidden rounded-surface ${floatingMotionClass} origin-(--radix-hover-card-content-transform-origin)`,
    },
  },
  Tooltip: {
    delayDuration: TOOLTIP_DELAY_MS,
    portal: true,
    classes: {
      content:
        "z-50 max-w-[calc(100vw-2rem)] overflow-hidden bg-popover/95 px-3 py-1.5 text-xs text-popover-foreground backdrop-blur-md smooth-shadow-ring-md animate-in origin-(--radix-tooltip-content-transform-origin) rounded-surface fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:data-[side=bottom]:slide-out-to-top-2 data-[state=closed]:data-[side=left]:slide-out-to-right-2 data-[state=closed]:data-[side=right]:slide-out-to-left-2 data-[state=closed]:data-[side=top]:slide-out-to-bottom-2",
    },
  },
  DropdownMenu: {
    collisionPadding: 8,
    icons: menuIcons,
    classes: {
      ...menuRowClasses,
      trigger: "cursor-pointer",
      content: dropdownMenuContentClass,
      subContent: dropdownMenuContentClass,
    },
  },
  ContextMenu: {
    collisionPadding: 8,
    subContentPortal: true,
    icons: menuIcons,
    classes: {
      ...menuRowClasses,
      content: contextMenuContentClass,
      subContent: contextMenuContentClass,
    },
  },
  Select: {
    // ButtonGroup's CSS finds select triggers by this slot.
    triggerSlot: true,
    collisionPadding: 8,
    icons: {
      trigger: createElement(IconChevronDown, { size: 16, className: "opacity-60" }),
      scrollUp: createElement(IconChevronUp, { size: 16 }),
      scrollDown: createElement(IconChevronDown, { size: 16 }),
      check: createElement(IconCheck, { size: 16 }),
    },
    classes: {
      // 16px below `sm` matches Input/Textarea: iOS zooms the page when a form
      // control smaller than that takes focus.
      trigger:
        "flex h-10 w-full max-sm:min-w-0 cursor-pointer items-center justify-between whitespace-nowrap border border-input bg-card px-3.5 py-2 text-base sm:text-sm ring-offset-background motion-press active:scale-[0.98] placeholder:text-muted-foreground focus:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 rounded-control",
      scrollButton: "flex cursor-pointer items-center justify-center py-1",
      content: `relative z-50 max-h-96 min-w-48 max-sm:max-h-[85dvh] max-sm:max-w-[calc(100vw-2rem)] overflow-hidden bg-popover/95 text-popover-foreground backdrop-blur-md smooth-shadow-ring-lg origin-(--radix-select-content-transform-origin) rounded-surface ${floatingMotionClass}`,
      viewport: "p-1.5",
      popperViewport:
        "h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)",
      label:
        "px-2.5 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground",
      item: "relative flex w-full cursor-pointer select-none items-center py-2 max-sm:min-h-10 pl-2.5 pr-8 text-sm outline-hidden motion-press active:scale-[0.98] focus:bg-muted focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 rounded-lg",
      separator: "-mx-1.5 my-1.5 h-px bg-border",
    },
  },
  Command: {
    // eva's CommandEmpty took a `className` as its whole class list.
    emptyClassNameReplaces: true,
    icons: {
      search: createElement(IconSearch, { className: "size-4 shrink-0 text-muted-foreground" }),
    },
    classes: {
      root: "flex h-full w-full flex-col overflow-hidden border border-border bg-popover/95 text-popover-foreground backdrop-blur-md rounded-surface",
      dialogContent: "overflow-hidden p-0",
      dialogCommand:
        "**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.08em] **:[[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-1 **:[[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:size-5 **:[[cmdk-input]]:h-12 **:[[cmdk-item]]:px-3 **:[[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:size-4",
      inputWrapper: "flex items-center gap-2 border-b border-border px-3.5",
      // 16px below `sm` — see the note in input.tsx.
      input:
        "flex h-11 w-full max-sm:min-w-0 rounded-none bg-transparent py-3 text-base sm:text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
      // `dvh` cap so the list never pushes the palette past the visible area on
      // a phone, where 320px of results plus the input exceeds the keyboard-free
      // space.
      list: "max-h-[320px] max-sm:max-h-[60dvh] overflow-y-auto overflow-x-hidden scrollbar",
      empty: "py-6 text-center text-sm",
      group:
        "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-2xs **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.08em] **:[[cmdk-group-heading]]:text-muted-foreground",
      separator: "-mx-1 h-px bg-border",
      item: "relative flex cursor-pointer gap-2 select-none items-center px-2.5 py-2 max-sm:min-h-10 text-sm outline-hidden motion-press active:scale-[0.98] data-[disabled=true]:pointer-events-none data-[selected=true]:bg-muted data-[selected=true]:text-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 rounded-lg",
      shortcut: "ml-auto text-xs tracking-widest text-muted-foreground",
    },
  },
} satisfies UiConfig;
