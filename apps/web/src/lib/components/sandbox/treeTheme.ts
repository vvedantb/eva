import type { CSSProperties } from "react";

/**
 * Maps HeroUI surface tokens onto the tree's themeable custom properties. They
 * inherit through the tree's shadow DOM and resolve to `rgb(var(--token))`, so
 * they re-resolve automatically when the `.dark` class toggles. `colorScheme`
 * (set per render at the call site) pins the tree's `light-dark()` git-status
 * and icon colours to the app theme, since those key off `color-scheme`, not
 * the class. Typed via index signature so CSS custom properties are allowed.
 */
export const treeThemeVars: CSSProperties & Record<`--${string}`, string> = {
  "--trees-bg-override": "rgb(var(--background))",
  "--trees-fg-override": "rgb(var(--foreground))",
  "--trees-fg-muted-override": "rgb(var(--muted-foreground))",
  "--trees-bg-muted-override": "rgb(var(--muted))",
  "--trees-border-color-override": "rgb(var(--border))",
  "--trees-accent-override": "rgb(var(--primary))",
  // Rows carry state with fill alone — hover tint, muted fill when selected —
  // and no outline on the clicked or focused row.
  "--trees-focus-ring-color-override": "transparent",
  "--trees-focus-ring-width-override": "0px",
  "--trees-selected-focused-border-color-override": "transparent",
  "--trees-selected-bg-override": "rgb(var(--muted))",
  // The tree defaults to `system-ui`; point it at the app's own sans stack so
  // it follows the user's theme font like every other surface.
  "--trees-font-family-override": "var(--font-sans)",
};

/**
 * Passed as the tree's `unsafeCSS`. Its built-in search field otherwise draws a
 * hard-coded 2px focus ring; this makes it focus like the app's own inputs —
 * the 1px border darkens and nothing else.
 */
export const TREE_UNSAFE_CSS = `
  [data-file-tree-search-input]:focus-visible,
  [data-file-tree-search-input][data-file-tree-search-input-fake-focus="true"] {
    outline: none;
    border-color: rgb(var(--ring) / 0.5);
  }
`;
