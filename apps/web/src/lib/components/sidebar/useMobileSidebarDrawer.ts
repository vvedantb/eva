import { useState } from "react";
import { type PanInfo } from "motion/react";
import { projectVelocity } from "@eva/ui";

interface MobileSidebarDrawerInput {
  pathname: string;
  isDesktop: boolean;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

/** Close, swipe-to-close and Escape handling for the sub-`lg` sidebar drawer. */
export function useMobileSidebarDrawer({
  pathname,
  isDesktop,
  mobileOpen,
  setMobileOpen,
}: MobileSidebarDrawerInput) {
  // The drawer lives above the router, so navigating does not unmount it. Close
  // it here rather than relying on every nested link remembering to call
  // `onNavigate` (adjust-state-during-render, not an effect).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  const closeMobileSidebar = () => setMobileOpen(false);

  const handleMobileDrawerDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (isDesktop || !mobileOpen) return;
    const projected = info.offset.x + projectVelocity(info.velocity.x);
    if (info.offset.x < -72 || info.velocity.x < -500 || projected < -120) {
      closeMobileSidebar();
    }
  };

  // Escape closes the drawer. Opening it leaves focus on the trigger in the
  // header, so the handler has to sit on both regions — the `aside` alone only
  // fires once focus has already moved inside the drawer.
  const closeOnEscape = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && !isDesktop && mobileOpen)
      closeMobileSidebar();
  };

  return { closeMobileSidebar, handleMobileDrawerDragEnd, closeOnEscape };
}
