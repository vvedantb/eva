import type { ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { cn } from "@eva/ui";
import {
  AutomationsIcon,
  InboxIcon,
  SessionsIcon,
  SettingsIcon,
} from "@/lib/components/sidebar/icons/AnimatedNavIcons";
import { LogoMark } from "@/lib/components/LogoMark";
import { railTileActiveClass } from "@/lib/components/sidebar/SharedLayoutNav";
import { EASE_OUT } from "../../_components/DeckPrimitives";

/** Copied from `RepoRail`, which cannot be reused here: it is router-driven. */
const RAIL_TILE_CLASS =
  "relative flex size-11 items-center justify-center rounded-lg border";

const RAIL_TILE_IDLE_CLASS = "border-transparent text-muted-foreground";

function RailDivider() {
  return <div className="h-px w-8 bg-sidebar-border" aria-hidden />;
}

function RailTile({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        RAIL_TILE_CLASS,
        active
          ? cn(railTileActiveClass, "opacity-100")
          : cn(RAIL_TILE_IDLE_CLASS, "opacity-75"),
      )}
    >
      {children}
    </div>
  );
}

function RepoTile({
  initial,
  colorClass,
  active = false,
}: {
  initial: string;
  colorClass: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        RAIL_TILE_CLASS,
        active
          ? cn(railTileActiveClass, "opacity-100")
          : "border-transparent opacity-50",
      )}
    >
      <span
        className={cn(
          "flex size-[30px] items-center justify-center rounded-md text-sm font-semibold text-white",
          colorClass,
        )}
      >
        {initial}
      </span>
    </div>
  );
}

/** Far-left icon rail: Eva, Inbox, Sessions, the repos, then Automations. */
export function EvaRail({ simple }: { simple: boolean }) {
  return (
    <div className="flex h-full w-16 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar">
      <div className="flex w-full flex-col items-center gap-1.5 pt-3">
        <RailTile>
          <span className="flex size-8 items-center justify-center rounded-full bg-white">
            <LogoMark size={20} className="shrink-0" />
          </span>
        </RailTile>
        <RailTile>
          <InboxIcon size={22} className="shrink-0" />
        </RailTile>
        <RailDivider />
        <RailTile>
          <SessionsIcon size={22} className="shrink-0" />
        </RailTile>
        <RailDivider />
      </div>
      <div className="flex w-full flex-1 flex-col items-center gap-1.5 py-2">
        <RepoTile initial="C" colorClass="bg-blue-500" active />
        <RepoTile initial="E" colorClass="bg-purple-500" />
      </div>
      <div className="flex w-full flex-col items-center gap-1.5 border-t border-sidebar-border py-3">
        <AnimatePresence initial={false}>
          {simple ? null : (
            <m.div
              key="automations"
              initial={{ opacity: 1, height: 44 }}
              animate={{ opacity: 1, height: 44 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.32, ease: EASE_OUT }}
            >
              <RailTile>
                <AutomationsIcon size={22} className="shrink-0" />
              </RailTile>
            </m.div>
          )}
        </AnimatePresence>
        <RailTile>
          <SettingsIcon size={22} className="shrink-0" />
        </RailTile>
      </div>
    </div>
  );
}
