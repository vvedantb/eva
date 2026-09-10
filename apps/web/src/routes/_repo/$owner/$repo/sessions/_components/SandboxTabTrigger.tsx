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
}

/* The chip: `TabsTrigger` already supplies `rounded-lg`, `motion-press`,
   `relative z-1` and the active text colour, and the active *fill* is the
   `TabsList` sliding pill gliding underneath. Only the resting/hover tones and
   the tighter panel density belong here. */
/* `max-sm:h-10`: the phone strip is the only place these are tapped, and 32px
   sits under the comfortable-tap floor. `hit-target` is the wrong tool here —
   its 8px bleed would overlap the neighbouring chip across the 4px gap. */
const TAB_CLASS =
  "h-8 max-sm:h-10 shrink-0 gap-1.5 px-2.5 text-xs data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-secondary data-[state=inactive]:hover:text-foreground md:w-8 md:justify-center md:px-0";

const ICON_CLASS = "size-4 shrink-0";

function TabIcon({ icon }: { icon: SandboxTabIcon }) {
  if (icon.kind === "name") {
    return <TablerIconByName name={icon.name} className={ICON_CLASS} />;
  }
  const { Icon } = icon;
  return <Icon className={ICON_CLASS} />;
}

interface SandboxTabTriggerProps {
  tab: SandboxTabDescriptor;
  /** Icon-only, label moved into a tooltip — desktop rail, or a crowded mobile strip. */
  labelHidden?: boolean;
  /**
   * Fired on click when this tab is already selected. Radix skips
   * `onValueChange` in that case, so a collapsed rail would otherwise ignore
   * the click that should expand onto the current view.
   */
  onReselect?: () => void;
}

export function SandboxTabTrigger({
  tab,
  labelHidden = false,
  onReselect,
}: SandboxTabTriggerProps) {
  const trigger = (
    <TabsTrigger
      value={tab.value}
      aria-label={labelHidden ? tab.label : undefined}
      className={TAB_CLASS}
      onClick={onReselect}
    >
      <TabIcon icon={tab.icon} />
      {labelHidden ? null : tab.label}
      {tab.indicator ? (
        <span
          aria-label={tab.indicatorLabel}
          className={cn(
            "size-1.5 shrink-0 rounded-full bg-primary",
            labelHidden && "absolute right-0.5 top-0.5",
            tab.indicator === "activity" &&
              "animate-pulse ring-2 ring-primary/30",
          )}
        />
      ) : null}
    </TabsTrigger>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Span keeps Tooltip `data-state` off the trigger — Radix Tabs also
            uses `data-state` for active/inactive. */}
        <span className="inline-flex">{trigger}</span>
      </TooltipTrigger>
      <TooltipContent
        side={labelHidden ? "left" : "bottom"}
        className="text-xs"
      >
        {tab.label}
      </TooltipContent>
    </Tooltip>
  );
}
