/** Per-machine experimental flag. JSON boolean via `useLocalStorage`. */
export const DISABLE_PAGE_MOTION_KEY = "eva:disable-page-motion";

export function readDisablePageMotion(): boolean {
  try {
    const raw = window.localStorage.getItem(DISABLE_PAGE_MOTION_KEY);
    if (raw === null) return false;
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

/** Stamp `html[data-page-motion]` before paint so first CSS enter is skipped. */
export function applyPageMotionDataset(disabled = readDisablePageMotion()): void {
  document.documentElement.dataset.pageMotion = disabled ? "off" : "on";
}
