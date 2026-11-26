"use client";

import { Button, ErrorBoundary } from "@vvedantb/ui";
import { AveActiveDot } from "@/lib/components/ave/AveActiveDot";
import { AveBadge } from "@/lib/components/ave/AveBadge";
import { AveMark } from "@/lib/components/ave/AveMark";
import { useAveLauncher } from "@/lib/components/ave/AveLauncherContext";

/**
 * The mobile summon button for Manager Ave, in the fixed header next to the
 * theme toggle.
 *
 * Below `md` the floating launcher is not merely inconvenient — a 48px FAB
 * parked at the bottom-right sits on top of the chat composer's send button,
 * the plan-question action row and the last inbox row's controls, all of which
 * are then untappable. The header is the one strip of chrome that is always
 * free, so the summon affordance moves into it and the FAB becomes desktop-only.
 */
export function AveHeaderButton() {
  const { isOpen, isHidden, toggle } = useAveLauncher();
  if (isHidden) return null;

  return (
    <Button
      shape="rounded"
      size="icon"
      variant="ghost"
      onClick={toggle}
      aria-label={isOpen ? "Close Manager Ave" : "Manager Ave"}
      aria-expanded={isOpen}
      className="relative shrink-0 [&_svg]:size-5"
    >
      <AveMark size={20} />
      <ErrorBoundary>
        <AveActiveDot />
        <AveBadge />
      </ErrorBoundary>
    </Button>
  );
}
