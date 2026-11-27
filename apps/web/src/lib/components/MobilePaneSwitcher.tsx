"use client";

const MOBILE_PANE_BUTTON_CLASS =
  "motion-press h-10 min-w-0 flex-1 truncate rounded-lg px-3 text-sm font-medium text-muted-foreground active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 aria-pressed:bg-muted aria-pressed:text-foreground";

export interface MobilePaneLabels {
  left: string;
  right: string;
}

/**
 * Below `md` a two-pane layout shows one pane at a time (a 50/50 vertical split
 * gives two ~350px scroll areas on a phone, which is unusable), so it needs a
 * visible way to reach the pane that is currently hidden.
 *
 * Its own module rather than living inside either layout: both
 * `ResizablePanelLayout` and `ResizableSidebar` collapse to the same single-pane
 * model below `md`, and neither should have to import a UI control out of the
 * other. Buttons are 40px tall to clear the tap floor without `hit-target`,
 * whose 8px bleed would overlap the adjacent button.
 */
export function MobilePaneSwitcher({
  labels,
  showingRight,
  onSelect,
}: {
  labels: MobilePaneLabels;
  /** Which pane is on screen — drives `aria-pressed`. */
  showingRight: boolean;
  /** Called with the requested pane, including when it is already showing. */
  onSelect: (pane: "left" | "right") => void;
}) {
  return (
    <div
      role="group"
      aria-label="Choose pane"
      className="flex shrink-0 items-center gap-1 border-b border-border p-1"
    >
      <button
        type="button"
        aria-pressed={!showingRight}
        onClick={() => onSelect("left")}
        className={MOBILE_PANE_BUTTON_CLASS}
      >
        {labels.left}
      </button>
      <button
        type="button"
        aria-pressed={showingRight}
        onClick={() => onSelect("right")}
        className={MOBILE_PANE_BUTTON_CLASS}
      >
        {labels.right}
      </button>
    </div>
  );
}
