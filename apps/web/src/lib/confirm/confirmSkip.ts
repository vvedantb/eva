/**
 * Whether this activation should skip the confirmation dialog.
 *
 * `event.altKey` covers the click itself. `altHeld` covers Radix `onSelect`
 * (and keyboard activation) which do not carry the modifier.
 */
export function shouldSkipConfirm(
  altHeld: boolean,
  event?: { altKey?: boolean } | null,
): boolean {
  return altHeld || event?.altKey === true;
}

/** Open the dialog, or run the action immediately when Alt is held. */
export function requestConfirm(
  altHeld: boolean,
  open: () => void,
  confirm: () => void,
  event?: { altKey?: boolean } | null,
): void {
  if (shouldSkipConfirm(altHeld, event)) {
    confirm();
    return;
  }
  open();
}
