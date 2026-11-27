import { useState } from "react";

/**
 * Where the observed element sits relative to its scroll viewport.
 * - `pending`: not observed yet, or below the viewport. Shows nothing, so an
 *   element already on screen at mount does not flash a pointer for one frame.
 * - `above`: scrolled past, above the viewport, not seen yet.
 * - `seen`: was in view at least once. Latches until `resetKey` changes.
 */
export type SeenOnceStatus = "pending" | "above" | "seen";

/** Nearest ancestor that scrolls vertically, the right IntersectionObserver root. */
function findScrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === "auto" || overflowY === "scroll") return el;
  }
  return null;
}

/**
 * Tracks whether one element has been in view since `resetKey` last changed.
 *
 * Status is stored with the key it was measured for, and a key mismatch reads
 * as `pending`. So a new key gets a fresh status by derivation: no reset
 * effect, no render-time setState. The ref callback closes over `resetKey`,
 * so the compiler gives it a new identity when the key changes and React
 * re-attaches the observer.
 */
export function useSeenOnce(resetKey: string | undefined) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [measured, setMeasured] = useState<{
    key: string | undefined;
    status: SeenOnceStatus;
  }>({ key: undefined, status: "pending" });
  const status: SeenOnceStatus =
    measured.key === resetKey ? measured.status : "pending";

  const markSeen = () => setMeasured({ key: resetKey, status: "seen" });

  const ref = (node: HTMLElement | null) => {
    if (!node) return;
    setElement(node);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setMeasured({ key: resetKey, status: "seen" });
            observer.disconnect();
            return;
          }
          const viewportTop = entry.rootBounds?.top ?? 0;
          const isAbove = entry.boundingClientRect.bottom <= viewportTop;
          setMeasured((prev) =>
            prev.key === resetKey && prev.status === "seen"
              ? prev
              : { key: resetKey, status: isAbove ? "above" : "pending" },
          );
        }
      },
      { root: findScrollParent(node) },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      setElement(null);
    };
  };

  return { ref, element, status, markSeen };
}
