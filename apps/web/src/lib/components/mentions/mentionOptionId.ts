/**
 * DOM id for one row of a mention / slash picker listbox.
 *
 * The editor is an ARIA 1.2 combobox, so `aria-activedescendant` has to name
 * the highlighted row by id. Item ids are domain ids — `owner/repo`,
 * `skill:name`, file paths — and React's `useId` is `:r1:`, so both carry
 * characters that are legal in an `id` attribute but not in the `#id`
 * selectors that assistive tech, `document.querySelector` and tests resolve
 * them through. Everything outside `[A-Za-z0-9_-]` collapses to `-`.
 *
 * Lives apart from `MentionPickerPopup` so it can be unit-tested: the web
 * vitest project runs in `node` with no React/CSS plugin, so a test may not
 * import a component module.
 */
export function optionId(listboxId: string, itemId: string): string {
  return `${toIdToken(listboxId)}-option-${toIdToken(itemId)}`;
}

function toIdToken(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9_-]/g, "-");
}
