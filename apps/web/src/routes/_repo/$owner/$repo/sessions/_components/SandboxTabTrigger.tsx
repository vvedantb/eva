import type { ComponentType } from "react";
import { SidePanelTabs, type SidePanelTabLayout } from "@vvedantb/ui";
import { TablerIconByName } from "@/lib/components/TablerIconByName";

type SandboxTabIndicator = "activity" | "content";

type TabIconComponent = ComponentType<{ className?: string }>;

type SandboxTabIcon =
  | { kind: "component"; Icon: TabIconComponent; ActiveIcon?: TabIconComponent }
  | { kind: "name"; name: string };

export interface SandboxTabDescriptor {
  value: string;
  label: string;
  icon: SandboxTabIcon;
  indicator?: SandboxTabIndicator;
  indicatorLabel?: string;
  count?: number;
}

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
  layout?: SidePanelTabLayout;
  onReselect?: () => void;
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
