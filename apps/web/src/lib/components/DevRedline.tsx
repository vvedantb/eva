import { RedlineOverlay } from "@vedantb/redline";

/**
 * Dev-only Redline overlay ([@vedantb/redline](https://github.com/vvedantb/redline)).
 * Pins a baseline commit and outlines rendered elements whose source changed.
 * Includes floating toolbar + read-only history view-mode.
 */
export function DevRedline() {
  return <RedlineOverlay />;
}
