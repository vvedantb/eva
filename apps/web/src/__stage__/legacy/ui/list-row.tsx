import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "../utils/cn";
import { SURFACE_RADIUS_CLASS } from "../utils/surface-radius";

/**
 * Apply to any interactive control nested inside a `<ListRow>` — a checkbox, a
 * menu trigger, a dismiss button. It lifts the control above the row's stretched
 * click overlay so the control receives its own clicks instead of the row's.
 */
export const LIST_ROW_CONTROL_CLASS = "relative z-2";

/**
 * The shell every selectable list row shares: surface, hairline, accent stripe,
 * hover, selected state, press feedback, and focus ring.
 *
 * Three rows had hand-rolled this — project, quick task, notification — and they
 * had drifted on every one of those: 200ms vs 150ms, `w-1` vs `w-[3px]`,
 * `inset-y-2` vs `inset-y-1.5`, press feedback present or absent. Side by side
 * they read as three components rather than three instances of one.
 *
 * ## Why a stretched overlay rather than a wrapping button
 *
 * The obvious shape — make the whole row a `<button>` — is unusable here,
 * because these rows embed their own controls: a selection checkbox, tooltip
 * triggers, a dismiss action. A button inside a button is invalid HTML, and the
 * inner control never receives its clicks. That is exactly why the existing rows
 * reached for `role="button" tabIndex={0}` on a div, which then needed a
 * hand-written `Enter`/`Space` key handler and an `if (e.detail === 0) return`
 * guard to stop that handler firing twice.
 *
 * So the row body stays a plain `<div>`, and a real `<button>`, `<a>`, or router
 * `<Link>` (via {@link ListRowProps.link}) is stretched across it at `z-1`.
 * The native element supplies the keyboard behaviour, the accessible role, and
 * — for anchors/links — middle-click and Cmd-click. Nested controls opt above
 * the overlay with {@link LIST_ROW_CONTROL_CLASS}.
 *
 * Prefer {@link ListRowProps.link} with a router `<Link>` for in-app paths so
 * the router's `rewrite` owns the address-bar href. Use {@link ListRowProps.href}
 * only for external URLs (or when no router is available).
 *
 * The focus ring is drawn by the row, not the overlay. Rows clip their
 * decoration with `overflow-hidden` and a ring is a box-shadow, so a ring on the
 * overlay would be clipped away and keyboard focus would be invisible. The
 * `has-[…]` selector is scoped to the overlay's `data-slot` so a focused nested
 * control does not also light up the whole row.
 *
 * ## Why it forwards a ref and spreads the rest
 *
 * Rows are the child of a `<ContextMenuTrigger asChild>`. Radix's `asChild`
 * clones the child to inject its own ref and `onContextMenu`/`onPointerDown`
 * handlers, so a row that neither forwards a ref nor spreads what it is handed
 * drops every one of them and the right-click menu silently never opens.
 */
export interface ListRowProps extends Omit<
  React.ComponentPropsWithoutRef<"div">,
  "onClick" | "children"
> {
  children: React.ReactNode;
  /**
   * Background class for the 4px stripe down the leading edge — the row's
   * status colour. Omit for rows that carry no status.
   */
  accentClassName?: string;
  /** Current row. Fills the surface and recolours the hairline. */
  selected?: boolean;
  /**
   * Router link (or any single element) used as the stretched overlay. Props
   * are merged via Radix `Slot`. Prefer this over {@link href} for in-app
   * navigation so rewrites apply to the rendered `href`.
   */
  link?: React.ReactElement;
  /**
   * Renders the overlay as a raw `<a>`. Use for external URLs. In-app paths
   * should use {@link link} instead.
   */
  href?: string;
  /**
   * Fires on plain (non-modified) clicks. With {@link link}, call
   * `event.preventDefault()` to cancel navigation (e.g. selection mode). With
   * {@link href}, the row always prevents the browser navigation and expects
   * this handler to navigate in-app if needed.
   */
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  /**
   * Names the row for screen readers, since the overlay has no text of its own.
   * Lands on the overlay rather than the shell, so it labels the control that
   * actually carries the role.
   */
  "aria-label"?: string;
  className?: string;
  /** Padding for the row body. Defaults to the standard row inset. */
  contentClassName?: string;
  /** Content layered behind the row body, such as a hover glow. */
  decoration?: React.ReactNode;
}

function isModifiedClick(event: React.MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

const ListRow = React.forwardRef<HTMLDivElement, ListRowProps>(function ListRow(
  {
    children,
    accentClassName,
    selected = false,
    link,
    href,
    onClick,
    className,
    contentClassName,
    decoration,
    "aria-label": ariaLabel,
    ...props
  },
  ref,
) {
  const interactive =
    link !== undefined || href !== undefined || onClick !== undefined;

  const overlayClasses =
    "absolute inset-0 z-1 cursor-pointer focus-visible:outline-hidden";

  return (
    <div
      ref={ref}
      {...props}
      className={cn(
        "group relative overflow-hidden",
        SURFACE_RADIUS_CLASS,
        "transition-[background-color] duration-[var(--motion-base)]",
        "has-[[data-slot=row-control]:focus-visible]:ring-2 has-[[data-slot=row-control]:focus-visible]:ring-ring/35",
        interactive && "motion-press active:scale-[0.99]",
        selected
          ? "bg-primary/5 ring-1 ring-primary/30"
          : "bg-card hover:bg-muted",
        className,
      )}
    >
      {decoration}
      {accentClassName ? (
        <div
          className={cn(
            "absolute inset-y-2 left-0 w-1 rounded-r-full",
            accentClassName,
          )}
        />
      ) : null}
      {link !== undefined ? (
        <Slot
          data-slot="row-control"
          aria-label={ariaLabel}
          className={overlayClasses}
          onClick={(event: React.MouseEvent<HTMLElement>) => {
            // Modified clicks are for new tab / window — leave navigation alone.
            if (!isModifiedClick(event)) {
              onClick?.(event);
            }
            // Own the click so a wrapping parent (e.g. KanbanCard) does not
            // also treat it as a row activation.
            event.stopPropagation();
          }}
        >
          {link}
        </Slot>
      ) : href !== undefined ? (
        <a
          href={href}
          onClick={(event) => {
            if (onClick === undefined) return;
            // A modified click is the entire reason this is an `<a>` — let the
            // browser open the new tab or window itself. A plain click is
            // handled in-app, so the navigation has to be cancelled or the
            // row would also hard-reload the page out from under the router.
            if (isModifiedClick(event)) return;
            event.preventDefault();
            onClick(event);
            event.stopPropagation();
          }}
          data-slot="row-control"
          aria-label={ariaLabel}
          className={overlayClasses}
        />
      ) : onClick !== undefined ? (
        <button
          type="button"
          onClick={(event) => {
            onClick(event);
            event.stopPropagation();
          }}
          data-slot="row-control"
          aria-label={ariaLabel}
          className={overlayClasses}
        />
      ) : null}
      <div className={cn("relative p-2.5 pl-3 text-left", contentClassName)}>
        {children}
      </div>
    </div>
  );
});

export { ListRow };
