import type { ComponentType } from "react";
import {
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@eva/ui";
import { TablerIconByName } from "@/lib/components/TablerIconByName";

/**
 * Why two kinds: a single `bg-primary` dot used to mean both "the agent is
 * driving Chrome right now" and "a plan landed, go read it". Those are
 * different asks — `activity` pulses because it is live and stops on its own,
 * `content` sits still because it waits for the user to act.
 */
type SandboxTabIndicator = "activity" | "content";

/**
 * Builtin tabs import their icon statically; user-defined tabs store a free-text
 * Tabler name resolved lazily at render. A union keeps that difference explicit
 * instead of asking the builder to wrap the name in a fresh component per
 * render, which would remount the icon on every keystroke elsewhere in the tree.
 */
type SandboxTabIcon =
  | { kind: "component"; Icon: ComponentType<{ className?: string }> }
  | { kind: "name"; name: string };

export interface SandboxTabDescriptor {
  /** Builtin tab id (`SandboxTab`) or a custom tab's name slug. */
  value: string;
  label: string;
  icon: SandboxTabIcon;
  indicator?: SandboxTabIndicator;
  /** Accessible name for the indicator dot. */
  indicatorLabel?: string;
  /**
   * How many items this tab holds. A count says more than the plain `content`
   * dot, so when it is present (and non-zero) the badge replaces the dot.
   */
  count?: number;
}

/**
 * How one chip is arranged. The three cases are genuinely different shapes, so
 * they are named rather than derived from booleans at each call site:
 * `row` is the phone strip (icon beside label), `icon` is the 44px desktop rail
 * and the crowded phone strip (label in a tooltip), `stacked` is the labelled
 * desktop rail (icon over label).
 */
export type SandboxTabLayout = "row" | "icon" | "stacked";

/* The chip: `TabsTrigger` already supplies `rounded-lg`, `motion-press`,
   `relative z-1` and the active text colour, and the active *fill* is the
   `TabsList` sliding pill gliding underneath. Only the resting/hover tones and
   the tighter panel density belong here. */
/* `max-sm:h-10`: the phone strip is the only place these are tapped, and 32px
   sits under the comfortable-tap floor. `hit-target` is the wrong tool here —
   its 8px bleed would overlap the neighbouring chip across the 4px gap. */
const TAB_CLASS =
  "h-8 max-sm:h-10 shrink-0 gap-1.5 px-2.5 text-xs data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-secondary data-[state=inactive]:hover:text-foreground";

/* Geometry only — the `md:` prefixes hold because the two rail layouts are
   chosen off the same 768px breakpoint the media query reads. */
const TAB_LAYOUT_CLASS: Record<SandboxTabLayout, string> = {
  row: "",
  icon: "md:w-8 md:justify-center md:px-0",
  stacked:
    "md:h-auto md:w-full md:flex-col md:justify-center md:gap-0.5 md:px-1 md:py-1.5",
};

const ICON_CLASS = "size-4 shrink-0";

/* Two-digit counts still fit: the pill grows from a 14px circle via `px-1`
   rather than being fixed-width, and `tabular-nums` keeps it from twitching as
   the number changes. */
const COUNT_BADGE_CLASS =
  "inline-flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full bg-primary px-1 font-medium text-[9px] text-primary-foreground leading-none tabular-nums";

function TabIcon({ icon }: { icon: SandboxTabIcon }) {
  if (icon.kind === "name") {
    return <TablerIconByName name={icon.name} className={ICON_CLASS} />;
  }
  const { Icon } = icon;
  return <Icon className={ICON_CLASS} />;
}

interface SandboxTabTriggerProps {
  tab: SandboxTabDescriptor;
  /** Defaults to the icon rail — the shape every surface but the phone uses. */
  layout?: SandboxTabLayout;
  /**
   * Fired on click when this tab is already selected. Radix skips
   * `onValueChange` in that case, so a collapsed rail would otherwise ignore
   * the click that should expand onto the current view.
   */
  onReselect?: () => void;
}

export function SandboxTabTrigger({
  tab,
  layout = "icon",
  onReselect,
}: SandboxTabTriggerProps) {
  const labelHidden = layout === "icon";
  const count = tab.count !== undefined && tab.count > 0 ? tab.count : undefined;
  const trigger = (
    <TabsTrigger
      value={tab.value}
      aria-label={labelHidden ? tab.label : undefined}
      className={cn(TAB_CLASS, TAB_LAYOUT_CLASS[layout])}
      onClick={onReselect}
    >
      <TabIcon icon={tab.icon} />
      {layout === "row" ? tab.label : null}
      {layout === "stacked" ? (
        /* One line, clipped: a rail that reflows per tab name would make the
           whole column ragged, and the tooltip is gone at this width. */
        <span className="w-full truncate text-[10px] leading-3">
          {tab.label}
        </span>
      ) : null}
      {count !== undefined ? (
        <span
          aria-label={tab.indicatorLabel}
          className={cn(
            COUNT_BADGE_CLASS,
            layout !== "row" && "absolute right-0 top-0",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : tab.indicator ? (
        <span
          aria-label={tab.indicatorLabel}
          className={cn(
            "size-1.5 shrink-0 rounded-full bg-primary",
            layout !== "row" && "absolute right-0.5 top-0.5",
            tab.indicator === "activity" &&
              "animate-pulse ring-2 ring-primary/30",
          )}
        />
      ) : null}
    </TabsTrigger>
  );
  // A visible label needs no tooltip repeating it.
  if (!labelHidden) return trigger;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Span keeps Tooltip `data-state` off the trigger — Radix Tabs also
            uses `data-state` for active/inactive. */}
        <span className="inline-flex">{trigger}</span>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        {tab.label}
      </TooltipContent>
    </Tooltip>
  );
}
