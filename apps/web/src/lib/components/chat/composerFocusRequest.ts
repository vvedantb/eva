/** The window event a composer focus request sends (`ChatTypeToFocus` listens). */
export const COMPOSER_FOCUS_EVENT = "eva:focus-composer";

/**
 * Asks the composer on screen to take focus, on the next frame so a tab the
 * caller just showed is laid out first. Only a visible composer acts
 * (`isComposerVisible`). The project's "+" uses it to open Eva's message box.
 */
export function requestComposerFocus(): void {
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event(COMPOSER_FOCUS_EVENT));
  });
}
