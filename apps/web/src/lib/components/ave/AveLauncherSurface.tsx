"use client";

import { AveLauncherButton } from "@/lib/components/ave/AveLauncherButton";
import { AvePanel } from "@/lib/components/ave/AvePanel";
import { useAveLauncherPosition } from "@/lib/components/ave/useAveLauncherPosition";

function preloadAvePanelBody() {
  void import("@/lib/components/ave/AvePanelBody");
}

/**
 * Owns where the launcher sits, and renders the two surfaces that depend on it.
 *
 * Separate from `AveLauncherProvider` on purpose: a drag sets state on every
 * pointer move, and the provider wraps the entire app, so keeping the position
 * here confines those renders to the launcher and the popover.
 *
 * `display: contents` — the wrapper exists only to carry the custom properties
 * both children read, and must not introduce a box (a containing block here
 * would reinterpret their `fixed` offsets against it rather than the viewport).
 */
export function AveLauncherSurface({
  isOpen,
  isMounted,
  isHidden,
  onOpen,
  onMinimize,
}: {
  isOpen: boolean;
  /** The panel keeps its chat once opened, so mounting outlives being open. */
  isMounted: boolean;
  /** On `/ave` the page is the chat; hide the floating copy of it. */
  isHidden: boolean;
  onOpen: () => void;
  onMinimize: () => void;
}) {
  const { cssVars, dragHandlers, isDragging, shouldIgnoreClick } =
    useAveLauncherPosition();

  return (
    <div className="contents" style={cssVars}>
      {isMounted ? (
        <AvePanel visible={isOpen && !isHidden} onMinimize={onMinimize} />
      ) : null}
      {isHidden ? null : (
        <AveLauncherButton
          isOpen={isOpen}
          onIntent={preloadAvePanelBody}
          onToggle={isOpen ? onMinimize : onOpen}
          dragHandlers={dragHandlers}
          isDragging={isDragging}
          shouldIgnoreClick={shouldIgnoreClick}
        />
      )}
    </div>
  );
}
