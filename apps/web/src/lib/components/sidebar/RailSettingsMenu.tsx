"use client";

import { Link, useLocation } from "@tanstack/react-router";
import { SettingsIcon, Sidebar } from "@vvedantb/ui";
import { GLOBAL_SETTINGS_NAV } from "@/lib/components/sidebar/globalSettingsNav";
import { isGlobalSettingsPath } from "@/lib/components/sidebar/homePaths";

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
    <Sidebar.RailItem asChild label="Settings" active={isActive}>
      <Link to={SETTINGS_LANDING_HREF} onClick={onNavigate}>
        <SettingsIcon size={22} variant="turn" className="shrink-0" />
      </Link>
    </Sidebar.RailItem>
  );
}
