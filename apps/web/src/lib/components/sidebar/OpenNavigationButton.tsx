"use client";

import { Button, cn } from "@eva/ui";
import { IconMenu2 } from "@tabler/icons-react";
import { useSidebar } from "@/lib/contexts/SidebarContext";

/**
 * Opens the below-`lg` navigation drawer from page content.
 *
 * Some routes are nothing but "pick an item from the sidebar" (`/automations`,
 * a repo's Documents / Reviews / Testing Arena index). On desktop the list is
 * beside them; on a phone the sidebar is a closed drawer, so those pages were
 * dead ends with no visible way forward. `lg:hidden` keeps desktop unchanged.
 */
export function OpenNavigationButton({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const { setMobileOpen } = useSidebar();
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => setMobileOpen(true)}
      className={cn("motion-press lg:hidden active:scale-[0.96]", className)}
    >
      <IconMenu2 size={16} />
      {label}
    </Button>
  );
}
