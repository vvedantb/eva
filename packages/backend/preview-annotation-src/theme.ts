/**
 * Eva's colours for the injected toolbar and selection card. Shared by both so
 * a theme message from Eva restyles them together.
 */

import type { PreviewToolbarTheme } from "@eva/shared/previewFrameMessages";
import { DARK_THEME, LIGHT_THEME } from "./themeFallback.generated";

export type ToolbarTheme = PreviewToolbarTheme;

let current: ToolbarTheme | null = null;

/** The theme Eva sent, or Eva's measured palette for the page's colour scheme. */
export function getTheme(): ToolbarTheme {
  if (current) return current;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? DARK_THEME
    : LIGHT_THEME;
}

export function setTheme(theme: ToolbarTheme): void {
  current = theme;
}

/** Writes the theme onto `host` as the CSS variables both stylesheets read. */
export function applyTheme(host: HTMLElement, theme: ToolbarTheme): void {
  const vars: Record<string, string> = {
    "--font": theme.fontFamily,
    "--surface": theme.surface,
    "--surface-text": theme.surfaceText,
    "--bar-shadow": theme.barShadow,
    "--tip-shadow": theme.tipShadow,
    "--tip-radius": theme.tipRadius,
    "--idle-text": theme.idleText,
    "--hover-bg": theme.hoverBg,
    "--hover-text": theme.hoverText,
    "--active-bg": theme.activeBg,
    "--active-text": theme.activeText,
    "--badge-bg": theme.badgeBg,
    "--badge-text": theme.badgeText,
    "--disc": theme.disc,
    "--destructive": theme.destructive,
    "--border": theme.border,
    "--primary": theme.primary,
    "--primary-text": theme.primaryText,
    "--field": theme.field,
    "--popover": theme.popover,
    "--muted": theme.muted,
    "--warning": theme.warning,
    "--input-border": theme.inputBorder,
    "--focus-border": theme.focusBorder,
    "--secondary-text": theme.secondaryText,
    "--tab-track": theme.tabTrack,
    "--tab-pill": theme.tabPill,
  };
  for (const [name, value] of Object.entries(vars)) {
    host.style.setProperty(name, value);
  }
}
