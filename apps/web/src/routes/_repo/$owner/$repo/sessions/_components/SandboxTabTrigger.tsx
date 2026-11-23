import type { ComponentType } from "react";
import { SidePanelTabs, type SidePanelTabLayout } from "@vvedantb/ui";
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
type TabIconComponent = ComponentType<{ className?: string }>;

/**
 * `ActiveIcon` is the filled Tabler variant shown while the tab is selected.
 * Not every icon has one; those fall back to a bolder outline stroke.
 */
type SandboxTabIcon =
  | { kind: "component"; Icon: TabIconComponent; ActiveIcon?: TabIconComponent }
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

/* eva's idle-tab hover: the secondary tone, not the package's half pill. */
const TAB_HOVER_CLASS = "data-[state=inactive]:hover:bg-secondary";

function tabIcons(icon: SandboxTabIcon) {
  if (icon.kind === "name") {
    return {
      icon: <TablerIconByName name={icon.name} />,
      activeIcon: <TablerIconByName name={icon.name} variant="filled" />,
    };
  }
  const { Icon, ActiveIcon } = icon;
  return {
    icon: <Icon />,
    activeIcon: ActiveIcon ? <ActiveIcon /> : undefined,
  };
}

interface SandboxTabTriggerProps {
  tab: SandboxTabDescriptor;
  /** Defaults to the icon rail — the shape every surface but the phone uses. */
  layout?: SidePanelTabLayout;
  /**
   * Fired on a press of this tab while it is already selected (the rail uses
   * it to show or hide the card). Radix skips `onValueChange` in that case.
   */
  onReselect?: () => void;
  /** Second tooltip line for the selected tab: what a press does. */
  reselectHint?: string;
}

/** One sandbox tab: the descriptor on the package `SidePanelTabs.Tab`. */
export function SandboxTabTrigger({
  tab,
  layout = "icon",
  onReselect,
  reselectHint,
}: SandboxTabTriggerProps) {
  const { icon, activeIcon } = tabIcons(tab.icon);
  return (
    <SidePanelTabs.Tab
      value={tab.value}
      label={tab.label}
      icon={icon}
      activeIcon={activeIcon}
      layout={layout}
      count={tab.count}
      indicator={tab.indicator}
      indicatorLabel={tab.indicatorLabel}
      onReselect={onReselect}
      reselectHint={reselectHint}
      className={TAB_HOVER_CLASS}
    />
  );
}
