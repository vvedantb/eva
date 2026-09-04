"use client";

import { Button } from "@eva/ui";
import { AveActiveDot } from "@/lib/components/ave/AveActiveDot";
import { AveMark } from "@/lib/components/ave/AveMark";
import { useAveLauncher } from "@/lib/components/ave/AveLauncherContext";
import { QueryErrorBoundary } from "@/lib/components/QueryErrorBoundary";

/**
 * The mobile summon button for Manager Ave, in the fixed header next to the
 * theme toggle.
 *
 * Below `lg` the floating launcher is not merely inconvenient — a 48px FAB
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
      size="icon"
      variant="ghost"
      onClick={toggle}
      aria-label={isOpen ? "Close Manager Ave" : "Manager Ave"}
      aria-expanded={isOpen}
      // `relative` anchors the sandbox pip, which hangs off the corner and so
      // must not be clipped. `[&_svg]:size-5` beats the variant's `size-4`
      // floor for icon glyphs: the mark is a filled disc, not a stroke icon,
      // and has to fill the 20px box its wrapper reserves.
      className="relative shrink-0 [&_svg]:size-5"
    >
      <AveMark size={20} />
      <QueryErrorBoundary>
        <AveActiveDot />
      </QueryErrorBoundary>
    </Button>
  );
}
