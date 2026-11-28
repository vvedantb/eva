import { createElement } from "react";
import { IconChevronDown, IconSearch } from "@tabler/icons-react";
import { triggerZoomAnimateClass, type UiConfig } from "@vvedantb/ui";

const HOVER_CARD_OPEN_DELAY_MS = 250;
const HOVER_CARD_CLOSE_DELAY_MS = 100;

const TOOLTIP_DELAY_MS = 300;

const overlayClass =
  "fixed inset-0 z-50 bg-black/80 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

const floatingMotionClass =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:data-[side=bottom]:slide-out-to-top-2 data-[state=closed]:data-[side=left]:slide-out-to-right-2 data-[state=closed]:data-[side=right]:slide-out-to-left-2 data-[state=closed]:data-[side=top]:slide-out-to-bottom-2";

function menuContentClass(maxHeight: string): string {
  return [
    "z-50 min-w-48 overflow-x-hidden overflow-y-auto scrollbar max-sm:max-w-[calc(100vw-2rem)] bg-popover/95 p-1 text-popover-foreground backdrop-blur-md smooth-shadow-ring-lg",
    "rounded-menu",
    maxHeight,
    triggerZoomAnimateClass,
  ].join(" ");
}

const dropdownMenuContentClass = menuContentClass(
  "max-h-(--radix-dropdown-menu-content-available-height)",
);
const contextMenuContentClass = menuContentClass(
  "max-h-(--radix-context-menu-content-available-height)",
);

const menuRowClasses = {
  subTrigger:
    "flex cursor-pointer items-center gap-1.5 rounded-menu-item px-2.5 py-1.5 max-sm:min-h-10 text-sm outline-hidden motion-press active:scale-[0.98] focus:bg-muted data-[state=open]:bg-muted [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  item: "relative flex cursor-pointer select-none items-center gap-1.5 rounded-menu-item px-2.5 py-1.5 max-sm:min-h-10 text-sm outline-hidden motion-press active:scale-[0.98] focus:bg-muted focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
  checkboxItem:
    "relative flex cursor-pointer select-none items-center gap-1.5 rounded-menu-item py-1.5 max-sm:min-h-10 pl-9 pr-2.5 text-sm outline-hidden motion-press active:scale-[0.98] focus:bg-muted focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
  radioItem:
    "relative flex cursor-pointer select-none items-center gap-1.5 rounded-menu-item py-1.5 max-sm:min-h-10 pl-9 pr-2.5 text-sm outline-hidden motion-press active:scale-[0.98] focus:bg-muted focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
  label:
    "px-2.5 py-1 text-2xs font-medium tracking-[-0.01em] text-muted-foreground",
  separator: "-mx-1 my-1 h-px bg-border",
  shortcut: "ml-auto text-2xs tracking-[0.08em] text-muted-foreground",
};


export const overlaysConfig = {
  Dialog: {
    viewportAware: false,
    classes: {
      trigger: "cursor-pointer",
      overlay: overlayClass,
      content:
        "t-modal fixed left-[50%] top-[50%] z-50 flex flex-col w-[92vw] max-sm:w-[calc(100vw-2rem)] max-w-lg max-h-[90dvh] gap-4 rounded-surface bg-card p-6 smooth-shadow-ring-xl overflow-hidden",
      centered: "",
      close:
        "max-sm:hit-target absolute right-4 top-4 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground motion-press active:scale-[0.94] hover:bg-muted hover:text-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none",
      header: "flex shrink-0 flex-col gap-1.5 text-center sm:text-left",
      body: "flex-1 min-h-0 overflow-y-auto -mx-6 px-6",
      footer:
        "flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end pb-[max(0px,env(safe-area-inset-bottom,0px))] [&_button]:max-sm:min-h-11",
      title: "text-lg font-semibold leading-none tracking-[-0.02em]",
      description: "text-sm text-muted-foreground",
    },
  },
  ConfirmDialog: {
    classes: {
      content: "sm:max-w-md",
      header: "pb-0",
      description: "py-0 text-base",
      body: "-mt-1",
      footer: "pt-0",
    },
  },
  Popover: {
    sideOffset: 4,
    collisionPadding: 8,
    classes: {
      trigger: "cursor-pointer",
      content: `z-50 w-72 max-sm:max-w-[calc(100vw-2rem)] max-sm:max-h-[85dvh] max-sm:overflow-y-auto max-sm:scrollbar bg-popover/95 p-4 text-popover-foreground backdrop-blur-md smooth-shadow-ring-lg outline-hidden rounded-surface ${triggerZoomAnimateClass}`,
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
    classes: {
      ...menuRowClasses,
      content: contextMenuContentClass,
      subContent: contextMenuContentClass,
    },
  },
  Select: {
    triggerSlot: true,
    collisionPadding: 8,
    icons: {
      trigger: createElement(IconChevronDown, {
        size: 16,
        className: "opacity-60",
      }),
    },
    classes: {
      trigger:
        "flex h-10 w-full max-sm:min-w-0 cursor-pointer items-center justify-between whitespace-nowrap border border-input bg-card px-3.5 py-2 text-base sm:text-sm ring-offset-background motion-press active:scale-[0.98] placeholder:text-muted-foreground focus:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 rounded-control",
      scrollButton: "flex cursor-pointer items-center justify-center py-1",
      content: `relative z-50 max-h-96 min-w-48 max-sm:max-h-[85dvh] max-sm:max-w-[calc(100vw-2rem)] overflow-hidden bg-popover/95 text-popover-foreground backdrop-blur-md smooth-shadow-ring-lg origin-(--radix-select-content-transform-origin) rounded-menu ${floatingMotionClass}`,
      label:
        "px-2.5 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground",
      item: "relative flex w-full cursor-pointer select-none items-center py-1.5 max-sm:min-h-10 pl-2.5 pr-8 text-sm outline-hidden motion-press active:scale-[0.98] focus:bg-muted focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 rounded-menu-item",
      separator: "-mx-1 my-1 h-px bg-border",
    },
  },
  Command: {
    emptyClassNameReplaces: true,
    icons: {
      search: createElement(IconSearch, {
        className: "size-4 shrink-0 text-muted-foreground",
      }),
    },
    classes: {
      root: "flex h-full w-full flex-col overflow-hidden border border-border bg-popover/95 text-popover-foreground backdrop-blur-md rounded-menu",
      dialogContent: "overflow-hidden p-0",
      dialogCommand:
        "**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.08em] **:[[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-1 **:[[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:size-5 **:[[cmdk-input]]:h-12 **:[[cmdk-item]]:px-3 **:[[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:size-4",
      inputWrapper: "flex items-center gap-2 border-b border-border px-3.5",
      input:
        "flex h-11 w-full max-sm:min-w-0 rounded-none bg-transparent py-3 text-base sm:text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
      list: "max-h-[320px] max-sm:max-h-[60dvh] overflow-y-auto overflow-x-hidden scrollbar",
      empty: "py-6 text-center text-sm",
      group:
        "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-2xs **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.08em] **:[[cmdk-group-heading]]:text-muted-foreground",
      separator: "-mx-1 h-px bg-border",
      item: "relative flex cursor-pointer gap-2 select-none items-center px-2.5 py-1.5 max-sm:min-h-10 text-sm outline-hidden motion-press active:scale-[0.98] data-[disabled=true]:pointer-events-none data-[selected=true]:bg-muted data-[selected=true]:text-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 rounded-lg",
      shortcut: "ml-auto text-xs tracking-widest text-muted-foreground",
    },
  },
} satisfies UiConfig;
