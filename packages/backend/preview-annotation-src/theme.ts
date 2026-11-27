/**
 * Eva's colours for the injected toolbar and selection card. Shared by both so
 * a theme message from Eva restyles them together.
 */

import type { PreviewToolbarTheme } from "@eva/shared/previewFrameMessages";

export type ToolbarTheme = PreviewToolbarTheme;

const BAR_SHADOW_BASE =
  "color(srgb 0 0 0 / 0.05) 0px 25px 50px 0px, color(srgb 0 0 0 / 0.04) 0px 12px 24px 0px, color(srgb 0 0 0 / 0.03) 0px 6px 12px 0px, color(srgb 0 0 0 / 0.02) 0px 3px 6px 0px, color(srgb 0 0 0 / 0.02) 0px 1.5px 3px 0px";
const TIP_SHADOW_BASE =
  "color(srgb 0 0 0 / 0.04) 0px 17.54px 23.39px 0px, color(srgb 0 0 0 / 0.03) 0px 9.4px 12.5px 0px, color(srgb 0 0 0 / 0.02) 0px 5.25px 7px 0px, color(srgb 0 0 0 / 0.01) 0px 2.79px 3.72px -2px, color(srgb 0 0 0 / 0.01) 0px 1.16px 1.5px 0px";

/**
 * Direct link: no Eva to read tokens from, so these are Eva's own resolved
 * values (measured from the app's light and dark themes with the probe in
 * `previewToolbarTheme.ts`), picked by the page's colour scheme. Re-measure
 * them if Eva's tokens change.
 */
export const LIGHT_THEME: ToolbarTheme = {
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  surface: "oklab(1 0 0 / 0.95)",
  surfaceText: "oklch(0.2103 0 0)",
  barShadow: `${BAR_SHADOW_BASE}, rgba(0, 0, 0, 0.05) 0px 0px 0px 1px`,
  tipShadow: `${TIP_SHADOW_BASE}, rgba(0, 0, 0, 0.05) 0px 0px 0px 1px`,
  tipRadius: "16px",
  idleText: "oklch(0.5517 0 0)",
  hoverBg: "oklab(0.9524 0 0 / 0.6)",
  hoverText: "oklch(0.2103 0 0)",
  activeBg: "oklch(0.94 0 0)",
  activeText: "oklch(0.2103 0 0)",
  badgeBg: "oklch(0.2103 0 0)",
  badgeText: "oklch(0.9702 0 0)",
  disc: "oklch(0.98 0 0)",
  destructive: "oklch(0.6532 0.2335 25.74)",
  border: "oklch(0.9 0 0)",
  primary: "oklch(0.2103 0 0)",
  primaryText: "oklch(0.9911 0 0)",
  field: "oklch(0.9702 0 0)",
  popover: "oklch(1 0 0)",
  muted: "oklch(0.9524 0 0)",
  warning: "oklch(0.7819 0.159 72.33)",
  tabTrack: "oklch(0.94 0 0)",
  tabPill: "oklch(1 0 0)",
};
export const DARK_THEME: ToolbarTheme = {
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  surface: "oklab(0.313316 0.000133276 -0.0054974 / 0.95)",
  surfaceText: "oklch(0.9911 0 0)",
  barShadow: `${BAR_SHADOW_BASE}, rgba(255, 255, 255, 0.18) 0px 0px 0px 1px`,
  tipShadow: `${TIP_SHADOW_BASE}, rgba(255, 255, 255, 0.18) 0px 0px 0px 1px`,
  tipRadius: "16px",
  idleText: "rgb(159, 160, 162)",
  hoverBg: "oklab(0.352463 0.000133812 -0.00533339 / 0.6)",
  hoverText: "rgb(250, 250, 250)",
  activeBg: "rgb(68, 69, 72)",
  activeText: "oklch(0.9911 0 0)",
  badgeBg: "rgb(250, 250, 250)",
  badgeText: "rgb(34, 35, 37)",
  disc: "rgb(48, 49, 52)",
  destructive: "oklch(0.594 0.1973 24.63)",
  border: "rgb(78, 79, 82)",
  primary: "oklch(0.9911 0 0)",
  primaryText: "oklch(0.2103 0 0)",
  field: "rgb(34, 35, 37)",
  popover: "rgb(48, 49, 52)",
  muted: "rgb(58, 59, 62)",
  warning: "oklch(0.8203 0.1392 76.34)",
  tabTrack: "rgb(48, 49, 52)",
  tabPill: "rgb(68, 69, 72)",
};

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
    "--tab-track": theme.tabTrack,
    "--tab-pill": theme.tabPill,
  };
  for (const [name, value] of Object.entries(vars)) {
    host.style.setProperty(name, value);
  }
}
