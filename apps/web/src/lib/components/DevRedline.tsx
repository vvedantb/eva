import { RedlineOverlay } from "@vvedantb/redline/overlay";

/**
 * Dev-only Redline overlay ([@vvedantb/redline](https://github.com/vvedantb/redline)).
 * Pins a baseline commit and outlines rendered elements whose source changed.
 * Includes floating toolbar + read-only history view-mode.
 */
export function DevRedline() {
  return <RedlineOverlay />;
}
