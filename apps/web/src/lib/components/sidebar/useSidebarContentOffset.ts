import { useLocation } from "@tanstack/react-router";
import {
  parseSidebarRepoRoute,
  routeHasSidePanel,
} from "@/lib/components/sidebar/sidebarPanelState";
import { useChromeSessionTabsActive } from "@/lib/components/sidebar/session-tabs/useChromeSessionTabs";
import { useSidebar } from "@/lib/contexts/SidebarContext";
import { IS_EMBEDDED } from "@/lib/embed/embedded";

/**
 * The routed content card. On `lg+` it sits inset in the shell (8px gap from
 * `useSidebarContentOffset`) as a rounded `bg-surface` card, as in the
 * `@vvedantb/ui` `AppShell.Content`. Below `lg` it stays full-bleed.
 */
export const SHELL_CONTENT_CARD_CLASS =
  "bg-background lg:overflow-hidden lg:rounded-lg lg:bg-surface";

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
  // `lg:p-2` is the 8px inset around the content card; the left pad adds the
  // same 0.5rem to the sidebar width. `20rem` matches the sidebar default
  // until localStorage hydrates the width.
  return railOnly
    ? "pt-(--eva-mobile-header-height) lg:p-2 lg:pl-[calc(4rem+0.5rem)]"
    : "pt-(--eva-mobile-header-height) lg:p-2 lg:pl-[calc(var(--eva-sidebar-width,20rem)+0.5rem)]";
}
