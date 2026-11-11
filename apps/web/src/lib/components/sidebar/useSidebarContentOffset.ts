import { useLocation } from "@tanstack/react-router";
import {
  parseSidebarRepoRoute,
  routeHasSidePanel,
} from "@/lib/components/sidebar/sidebarPanelState";
import { useChromeSessionTabsActive } from "@/lib/components/sidebar/session-tabs/useChromeSessionTabs";
import { useSidebar } from "@/lib/contexts/SidebarContext";
import { IS_EMBEDDED } from "@/lib/embed/embedded";

/**
 * Padding that keeps routed content clear of the fixed sidebar in `Sidebar.tsx`.
 * Below `lg` it clears the mobile header (3.5rem plus the notch inset); on `lg+`
 * it clears the rail, or the rail plus panel. Uses the same `routeHasSidePanel`
 * as the sidebar, so the content and sidebar widths cannot drift. Padding is not
 * animated: animating `pl-*` on route change counts as layout shift (CLS).
 */
export function useSidebarContentOffset(): string | null {
  const { pathname } = useLocation();
  const { collapsed } = useSidebar();
  const useChromeSessionTabs = useChromeSessionTabsActive(pathname);
  // Embedded documents (inbox preview pane) have no sidebar or mobile header.
  if (IS_EMBEDDED) return null;
  const railOnly =
    collapsed ||
    !routeHasSidePanel({
      pathname,
      isRepoRoute: parseSidebarRepoRoute(pathname).isRepoRoute,
      useChromeSessionTabs,
    });
  // `20rem` matches the sidebar default until localStorage hydrates the width.
  return railOnly
    ? "pt-(--eva-mobile-header-height) lg:pt-0 lg:pl-16"
    : "pt-(--eva-mobile-header-height) lg:pt-0 lg:pl-(--eva-sidebar-width,20rem)";
}
