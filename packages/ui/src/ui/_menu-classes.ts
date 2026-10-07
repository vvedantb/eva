import { SURFACE_RADIUS_CLASS } from "../utils/surface-radius";

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
    SURFACE_RADIUS_CLASS,
    origin,
    "duration-150 data-[state=closed]:duration-75 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
  ].join(" ");
}

/**
 * `min-h-10` below `sm` puts menu rows at the 40px comfortable-tap floor while
 * desktop keeps the tighter intrinsic height.
 *
 * A responsive *padding* (`py-2.5 sm:py-2`) would read more naturally and is
 * what this originally used, but `tailwind-merge` only resolves conflicts within
 * a variant group: a call site passing `py-1` would keep the primitive's
 * `sm:py-2` and lose control of its own inset above the breakpoint. That trap is
 * documented — and locked by `apps/web/src/designTokens.test.ts` — in
 * `card.tsx`. Growing the box instead of its padding sidesteps it.
 */
export const menuSubTriggerClass =
  "flex cursor-pointer items-center gap-1.5 rounded-menu-item px-2.5 py-2 max-sm:min-h-10 text-sm outline-hidden transition-colors motion-press active:scale-[0.98] focus:bg-muted data-[state=open]:bg-muted [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

export const menuItemClass =
  "relative flex cursor-pointer select-none items-center gap-1.5 rounded-menu-item px-2.5 py-2 max-sm:min-h-10 text-sm outline-hidden transition-colors motion-press active:scale-[0.98] focus:bg-muted focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0";

export const menuCheckboxRadioItemClass =
  "relative flex cursor-pointer select-none items-center gap-1.5 rounded-menu-item py-2 max-sm:min-h-10 pl-9 pr-2.5 text-sm outline-hidden transition-colors motion-press active:scale-[0.98] focus:bg-muted focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50";

export const menuLabelClass =
  "px-2.5 py-1 text-2xs font-medium tracking-[-0.01em] text-muted-foreground";

export const menuSeparatorClass = "-mx-1.5 my-1.5 h-px bg-border";

export const menuShortcutClass =
  "ml-auto text-2xs tracking-[0.08em] text-muted-foreground";
