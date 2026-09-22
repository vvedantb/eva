import type { ComponentType } from "react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import {
  DocumentsIcon,
  ProjectsIcon,
  QuickTasksIcon,
  ReviewsIcon,
  SettingsIcon,
  TestingArenaIcon,
} from "@/lib/components/sidebar/icons/AnimatedNavIcons";
import {
  sidebarNavLinkClass,
  sidebarSectionLabelClass,
} from "@/lib/components/sidebar/SharedLayoutNav";
import { SANDBOX_STATUS_STYLES } from "@/lib/components/sandbox/sandboxStatusStyles";
import type { SandboxStatus } from "@/lib/components/sandbox/sandboxStatusStyles";
import { EASE_OUT } from "../../_components/DeckPrimitives";

type NavIcon = ComponentType<{ size?: number; className?: string }>;

export interface EvaNavItem {
  name: string;
  icon: NavIcon;
  active?: boolean;
  badge?: string;
  /** Rows `RepoNavSections` drops when the Simple Mode flag is on. */
  simpleHidden?: boolean;
}

export interface EvaNavGroup {
  label: string;
  items: readonly EvaNavItem[];
}

/**
 * The real Ship / Test / More groups, in the order the app renders them.
 * Drafts, Today and Stats are left out so the panel fits the slide at a scale
 * a projector audience can read; nothing shown here is invented.
 */
export const NAV_GROUPS: readonly EvaNavGroup[] = [
  {
    label: "Ship",
    items: [
      { name: "Projects", icon: ProjectsIcon },
      { name: "Quick Tasks", icon: QuickTasksIcon, active: true, badge: "2" },
    ],
  },
  {
    label: "Test",
    items: [
      { name: "Documents", icon: DocumentsIcon },
      { name: "Reviews", icon: ReviewsIcon, simpleHidden: true },
      { name: "Testing Arena", icon: TestingArenaIcon },
    ],
  },
  {
    label: "More",
    items: [{ name: "Settings", icon: SettingsIcon, simpleHidden: true }],
  },
];

export interface EvaSessionRowData {
  title: string;
  when: string;
  status: SandboxStatus;
  selected?: boolean;
}

export const SESSION_ROWS: readonly EvaSessionRowData[] = [
  {
    title: "Referral portal dashboard",
    when: "12m",
    status: "active",
    selected: true,
  },
  { title: "AQP map", when: "1h", status: "closed" },
];

const ROW_HEIGHT = 30;

export function EvaSidebarGroupLabel({ label }: { label: string }) {
  return <p className={sidebarSectionLabelClass}>{label}</p>;
}

/** One nav row, styled with the app's own `sidebarNavLinkClass`. */
export function EvaNavRow({
  item,
  index,
}: {
  item: EvaNavItem;
  index: number;
}) {
  const active = item.active === true;
  return (
    <m.div
      className="relative overflow-hidden"
      initial={{ opacity: 1, height: ROW_HEIGHT }}
      animate={{ opacity: 1, height: ROW_HEIGHT }}
      exit={{
        opacity: 0,
        height: 0,
        transition: { duration: 0.32, ease: EASE_OUT, delay: index * 0.09 },
      }}
      transition={{ duration: 0.32, ease: EASE_OUT }}
    >
      {active ? (
        <div className="pointer-events-none absolute inset-0 rounded-menu-item bg-sidebar-accent" />
      ) : null}
      <div className={cn("relative z-10", sidebarNavLinkClass(active))}>
        <item.icon
          size={19}
          className={cn(
            "shrink-0",
            active ? "text-sidebar-primary" : "text-muted-foreground",
          )}
        />
        <span className="truncate">{item.name}</span>
        {item.badge ? (
          <span className="ml-auto shrink-0 rounded-full bg-sidebar-accent px-1.5 text-[10px] leading-4 font-medium text-muted-foreground">
            {item.badge}
          </span>
        ) : null}
      </div>
    </m.div>
  );
}

/** A session row, matching `SidebarSessionItem`'s compact layout. */
export function EvaSessionRow({ row }: { row: EvaSessionRowData }) {
  const style = SANDBOX_STATUS_STYLES[row.status];
  return (
    <div className="block rounded-menu-item px-4 py-1.5 text-[13px] leading-[18px]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex shrink-0 items-center">
          <span className={cn("size-2 shrink-0 rounded-full", style.dot)} />
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            row.selected === true
              ? "font-medium text-sidebar-primary"
              : "text-sidebar-foreground/80",
          )}
        >
          {row.title}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {row.when}
        </span>
      </div>
    </div>
  );
}
