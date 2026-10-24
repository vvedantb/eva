"use client";

import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@eva/ui";
import {
  SettingsIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import { GLOBAL_SETTINGS_NAV } from "@/lib/components/sidebar/globalSettingsNav";
import { isGlobalSettingsPath } from "@/lib/components/sidebar/homePaths";
import { railTileActiveClass } from "@/lib/components/sidebar/SharedLayoutNav";

/** First entry in the global Settings sidebar — rail gear lands here. */
const SETTINGS_LANDING_HREF = GLOBAL_SETTINGS_NAV[0].href;

/**
 * Compact settings gear under the rail avatar. Opens the global Settings panel
 * on the first nav route (Theme) — user-level, not per-repo.
 */
export function RailSettingsMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const showTesting = import.meta.env.DEV;
  const isActive =
    isGlobalSettingsPath(pathname) ||
    (showTesting &&
      (pathname === "/testing" || pathname.startsWith("/testing/")));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={SETTINGS_LANDING_HREF}
          onClick={onNavigate}
          title="Settings"
          aria-label="Settings"
          className={cn(
            "group relative flex size-11 items-center justify-center rounded-lg border motion-press active:scale-[0.96] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring/35",
            isActive
              ? railTileActiveClass
              : "border-transparent text-muted-foreground opacity-75 hover:bg-sidebar-accent/50 hover:opacity-100 hover:text-sidebar-foreground",
          )}
        >
          <SettingsIcon size={22} variant="turn" className="shrink-0" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">Settings</TooltipContent>
    </Tooltip>
  );
}
