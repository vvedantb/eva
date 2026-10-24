// eva's look for the @vvedantb/ui controls family: buttons, badges, fields,
// toggles, tabs, accordion and friends. Each string is the exact class list the
// legacy @eva/ui component rendered, so the swap changes no DOM.
import { createElement } from "react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { getDefaultClassNames } from "react-day-picker";
import { CalendarDayButton, type UiConfig } from "@vvedantb/ui";
import { cn } from "../utils/cn";

const buttonBase =
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-[-0.01em] motion-press focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 active:scale-[0.96] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

const buttonVariant = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  outline: "border border-border bg-transparent text-foreground hover:bg-muted/60",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
  link: "text-primary underline-offset-4 hover:underline",
};

// Sizes under the 40px tap floor carry `hit-target` (an 8px pseudo-element
// bleed). `sm`/`icon-sm` gate it to `max-sm` so desktop targets stay 32px.
const buttonSize = {
  default: "h-10 px-4 py-2",
  xs: "h-7 rounded-md px-2 text-2xs hit-target [&_svg]:size-3.5",
  sm: "h-8 rounded-lg px-3 text-xs max-sm:hit-target",
  lg: "h-11 rounded-lg px-6",
  icon: "h-10 w-10",
  "icon-sm": "h-8 w-8 max-sm:hit-target",
  "icon-xs": "h-7 w-7 hit-target [&_svg]:size-3.5",
};

/** `buttonVariants({ variant: "ghost" })` of the legacy Button, for the calendar. */
const ghostButton = cn(buttonBase, buttonVariant.ghost, buttonSize.default);

// 16px below `sm`: iOS Safari zooms the page when a focused field's computed
// font-size is under 16px.
const fieldClasses =
  "flex h-10 w-full max-sm:min-w-0 border border-input bg-card px-3.5 py-2 text-base sm:text-sm transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/90 focus-visible:border-ring/50 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 rounded-control";

const calendarNavButton = cn(
  ghostButton,
  "size-8 p-0 text-muted-foreground aria-disabled:opacity-50 select-none",
);

const rdp = getDefaultClassNames();

export const controlsConfig = {
  // eva's tailwind-merge does not know the `rounded-surface` / `-control` /
  // `-menu-item` radius tokens, so a caller `rounded-*` class sits next to them
  // and the CSS order decides. Keep that merge so call sites render as before.
  cn,
  Button: {
    classes: { base: buttonBase, variant: buttonVariant, size: buttonSize },
  },
  Badge: {
    classes: {
      base: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-[0.01em] transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2",
      variant: {
        default: "bg-primary/12 text-primary",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive/12 text-destructive",
        outline: "bg-muted text-foreground",
        success: "bg-success/12 text-success",
        warning: "bg-warning/12 text-warning",
      },
    },
  },
  Input: {
    classes: {
      base: "flex h-10 w-full max-sm:min-w-0 border border-input bg-card px-3.5 py-2 text-base sm:text-sm transition-[border-color,box-shadow,background-color] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/90 focus-visible:border-ring/50 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 rounded-control",
    },
  },
  Textarea: {
    classes: {
      base: "flex min-h-[84px] w-full max-sm:min-w-0 border border-input bg-card px-3.5 py-2.5 text-base sm:text-sm transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/90 focus-visible:border-ring/50 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 rounded-control",
    },
  },
  Checkbox: {
    classes: {
      root: "peer size-4 shrink-0 cursor-pointer rounded-[6px] border border-input bg-card motion-press active:scale-[0.9] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      indicator: "flex items-center justify-center text-current",
    },
    icon: createElement(IconCheck, { size: 14 }),
  },
  Switch: {
    classes: {
      root: "peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent motion-press active:scale-[0.96] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted",
      // Checked: primary-foreground, so a near-white primary keeps a visible knob.
      thumb:
        "pointer-events-none block size-5 rounded-full bg-white shadow-sm t-switch-thumb data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0.5",
    },
  },
  Slider: {
    classes: {
      root: "relative flex min-h-8 w-full cursor-pointer touch-none select-none items-center overflow-visible t-slider data-disabled:cursor-not-allowed data-disabled:opacity-50",
      track: "relative h-5 w-full grow overflow-hidden rounded-full bg-secondary",
      range: "absolute h-full bg-primary",
      thumb:
        "t-slider-thumb block size-8 shrink-0 rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
    },
  },
  ButtonGroup: {
    classes: {
      // Children abut, so the `max-sm` hit-target bleed of small buttons is
      // dropped rather than letting a neighbour steal taps.
      base: "flex w-fit items-stretch max-sm:[&>*]:after:content-none has-[>[data-slot=button-group]]:gap-2 focus-visible:*:relative focus-visible:*:z-10 [&>[data-slot=select-trigger]:last-of-type]:has-[select[aria-hidden=true]:last-child]:rounded-r-lg [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
      text: "bg-secondary flex items-center gap-2 border border-border px-4 text-sm font-medium [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none rounded-surface",
      separator: "bg-input relative m-0! self-stretch data-[orientation=vertical]:h-auto",
    },
  },
  InputGroup: {
    classes: {
      root: [
        "group/input-group border-input relative flex w-full items-center border bg-card outline-hidden transition-[color,box-shadow,border-color]",
        "h-10 has-[>textarea]:h-auto",
        "[&>input]:has-[>[data-align=inline-start]]:pl-2",
        "[&>input]:has-[>[data-align=inline-end]]:pr-2",
        "has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col [&>input]:has-[>[data-align=block-start]]:pb-3",
        "has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col [&>input]:has-[>[data-align=block-end]]:pt-3",
        "has-[[data-slot=input-group-control]:focus-visible]:ring-1 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/35",
        "has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[[data-slot][aria-invalid=true]]:border-destructive dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40",
      ].join(" "),
      addon: {
        base: "text-muted-foreground flex h-auto cursor-text select-none items-center justify-center gap-2 py-1.5 text-sm font-medium group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-4px)] [&>svg:not([class*='size-'])]:size-4",
        align: {
          "inline-start": "order-first pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]",
          "inline-end": "order-last pr-3 has-[>button]:mr-[-0.4rem] has-[>kbd]:mr-[-0.35rem]",
          "block-start":
            "[.border-b]:pb-3 order-first w-full justify-start px-3 pt-3 group-has-[>input]/input-group:pt-2.5",
          "block-end":
            "[.border-t]:pt-3 order-last w-full justify-start px-3 pb-3 group-has-[>input]/input-group:pb-2.5",
        },
      },
      button: {
        base: "flex items-center gap-2 text-sm shadow-none",
        size: {
          xs: "max-sm:hit-target h-6 gap-1 rounded-[calc(var(--radius)-4px)] px-2 has-[>svg]:px-2 [&>svg:not([class*='size-'])]:size-3.5",
          sm: "max-sm:hit-target h-8 gap-1.5 rounded-lg px-2.5 has-[>svg]:px-2.5",
          "icon-xs": "max-sm:hit-target size-6 rounded-[calc(var(--radius)-4px)] p-0 has-[>svg]:p-0",
          "icon-sm": "max-sm:hit-target size-8 p-0 has-[>svg]:p-0",
        },
      },
      text: "text-muted-foreground flex items-center gap-2 text-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none",
      input: "flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent",
      textarea:
        "flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none focus-visible:ring-0 dark:bg-transparent",
    },
  },
  ClearInput: {
    animation: "none",
    classes: {
      wrapper: "relative",
      input: fieldClasses,
      // The scale composes with the centring `-translate-y-1/2`, so the button
      // presses in place.
      button:
        "max-sm:hit-target motion-press absolute right-2 top-1/2 z-4 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.92] focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/35",
    },
  },
  SearchInput: {
    classNameTarget: "wrapper",
    label: false,
    placeholder: "Search...",
    clearLabel: "Clear",
    enterKeyHint: false,
    iconSize: 15,
    classes: {
      wrapper: "w-full max-w-sm",
      input: "h-9 pl-8 text-base sm:text-sm",
      icon: "pointer-events-none absolute left-3 top-1/2 z-3 -translate-y-1/2 text-muted-foreground",
    },
  },
  Calendar: {
    classes: {
      base: "border border-border bg-card p-3 rounded-surface",
      root: cn("w-fit", rdp.root),
      months: cn("flex gap-4 flex-col md:flex-row relative", rdp.months),
      month: cn("flex flex-col w-full gap-4", rdp.month),
      nav: cn("flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between", rdp.nav),
      button_previous: cn(calendarNavButton, rdp.button_previous),
      button_next: cn(calendarNavButton, rdp.button_next),
      month_caption: cn("flex items-center justify-center h-8 w-full px-8", rdp.month_caption),
      dropdowns: rdp.dropdowns,
      dropdown_root: rdp.dropdown_root,
      dropdown: rdp.dropdown,
      caption_label: cn("select-none font-medium text-sm", rdp.caption_label),
      month_grid: rdp.month_grid,
      weekdays: cn("flex", rdp.weekdays),
      weekday: cn(
        "text-muted-foreground flex-1 font-medium text-[0.76rem] uppercase tracking-[0.08em] select-none",
        "rounded-lg",
        rdp.weekday,
      ),
      week: cn("flex w-full mt-2", rdp.week),
      week_number_header: rdp.week_number_header,
      week_number: rdp.week_number,
      day: cn("relative w-full h-full p-0 text-center aspect-square select-none", rdp.day),
      day_button: cn(
        ghostButton,
        "h-8 w-8 p-0 font-normal",
        "data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:hover:bg-primary data-[selected=true]:hover:text-primary-foreground",
        rdp.day,
        rdp.day_button,
      ),
      range_start: rdp.range_start,
      range_middle: rdp.range_middle,
      range_end: rdp.range_end,
      today: cn("border border-primary/25 bg-primary/10 text-primary", "rounded-lg", rdp.today),
      outside: cn("text-muted-foreground aria-selected:text-muted-foreground", rdp.outside),
      disabled: cn("text-muted-foreground opacity-50", rdp.disabled),
      hidden: cn("invisible", rdp.hidden),
    },
    components: { DayButton: CalendarDayButton },
  },
  Carousel: {
    classes: {
      dots: "flex justify-center gap-1.5 pt-2",
      // The 10px width step is not animated: below the threshold where it reads
      // as motion, and width would relayout the dot row every frame.
      dot: "h-1.5 cursor-pointer rounded-full motion-press active:scale-90",
      dotActive: "w-4 bg-primary",
      dotInactive: "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50",
    },
  },
  Tabs: {
    variant: "segmented",
    pillMotion: "xy",
    classes: {
      // `justify-center-safe`: centred content that overflows would make the
      // leading tabs unreachable; safe alignment falls back to start.
      list: "relative inline-flex items-center justify-center bg-background p-1 text-muted-foreground max-sm:max-w-full max-sm:justify-center-safe max-sm:overflow-x-auto max-sm:scrollbar-none rounded-surface",
      size: {
        default: "h-10",
        sm: "h-8 [&_.t-tab]:px-2.5 [&_.t-tab]:py-1 [&_.t-tab]:text-xs",
      },
      pill: "t-tabs-pill rounded-lg bg-card",
      trigger:
        "t-tab relative z-1 inline-flex cursor-pointer items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-medium ring-offset-background motion-press active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground rounded-lg",
      content:
        "mt-3 ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2",
    },
  },
  Accordion: {
    classes: {
      item: "border-b border-border last:border-b-0",
      header: "flex flex-1",
      trigger:
        "group flex flex-1 cursor-pointer items-center justify-between py-3 text-sm font-medium motion-press active:scale-[0.99] hover:text-foreground [&[data-state=open]>svg]:rotate-180",
      // `t-accordion-content` (globals.css) animates both directions.
      content: "t-accordion-content text-sm",
      contentInner: "pb-3 pt-0",
    },
    // Same duration and easing as the panel, so chevron and content finish together.
    icon: createElement(IconChevronDown, {
      size: 16,
      className:
        "shrink-0 text-muted-foreground transition-transform duration-[var(--motion-base)] group-hover:text-foreground",
    }),
  },
  Collapsible: {
    // `t-collapsible-content` (globals.css) gives every panel the same
    // measured-height open and close.
    classes: { trigger: "cursor-pointer", content: "t-collapsible-content" },
  },
} satisfies UiConfig;
