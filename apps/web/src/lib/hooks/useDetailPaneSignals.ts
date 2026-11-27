"use client";

import { useState } from "react";

/**
 * Two counters that track which pane a phone should be on in a master/detail
 * `ResizablePanelLayout`: `expand` increments each time an entity becomes the
 * selected one (including the first paint of a deep link), `collapse`
 * increments each time the selection is cleared. `ResizablePanelLayout` only
 * reacts to a value changing, so plain booleans would not fire again after the
 * user had switched panes by hand.
 *
 * Both are adjusted during render (rather than in an effect) so the pane lands
 * in the same commit as the selection — `useEffect` is banned here. `nudge`
 * covers the case the URL cannot: re-tapping the entity that is *already* in
 * the URL after switching back to the list, which changes no route state at all.
 *
 * Takes a plain `string` so the quick-task and project task lists can share it;
 * Convex `Id`s are branded strings and assign to it directly.
 */
export function useDetailPaneSignals(selectedId: string | undefined) {
  const [signal, setSignal] = useState(() => ({
    selectedId,
    // Deep-linking straight to an entity must land on the detail, not the list.
    expand: selectedId === undefined ? 0 : 1,
    collapse: 0,
  }));
  if (signal.selectedId !== selectedId) {
    const cleared = selectedId === undefined;
    setSignal({
      selectedId,
      // Clearing the selection must not expand the (now empty) detail pane; it
      // sends the phone back to the list instead. Either way the old id is
      // forgotten, so re-picking that entity counts as a new selection.
      expand: cleared ? signal.expand : signal.expand + 1,
      collapse: cleared ? signal.collapse + 1 : signal.collapse,
    });
  }
  return {
    expandRightSignal: signal.expand,
    collapseRightSignal: signal.collapse,
    nudge: () => setSignal((prev) => ({ ...prev, expand: prev.expand + 1 })),
  };
}
