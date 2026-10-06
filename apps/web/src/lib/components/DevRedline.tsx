import { RedlineOverlay } from "@vvedantb/redline/overlay";

/**
 * Dev-only Redline overlay ([@vvedantb/redline](https://github.com/vvedantb/redline)).
 * Pins a baseline commit and outlines rendered elements whose source changed.
 * Includes floating toolbar + read-only history view-mode.
 */
export function DevRedline() {
  // Redline hides itself entirely under `prefers-reduced-motion: reduce`
  // (OS "Reduce motion"), and `?redline=1` does not override that. The
  // overlay has no motion worth respecting, so always show it in dev.
  return <RedlineOverlay respectReducedMotion={false} />;
}
