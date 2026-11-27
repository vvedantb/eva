import type { PreviewToolbarTheme } from "@eva/shared/previewFrameMessages";

/** Throwaway element carrying the same classes Eva's own controls use. */
function probe(className: string, text = "x"): HTMLElement {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = text;
  element.style.cssText = "position:fixed;left:-9999px;top:0;pointer-events:none";
  return element;
}

/**
 * Reads Eva's resolved tokens for the preview toolbar by styling probe
 * elements with the classes the old in-app bar used, so the page-side toolbar
 * matches it in light and dark. Tailwind emits these classes because the
 * strings below are in the source. Call again when the theme changes.
 */
export function readPreviewToolbarTheme(): PreviewToolbarTheme {
  const surface = probe("bg-popover/95 text-foreground smooth-shadow-ring-lg");
  const tip = probe(
    "bg-popover/95 text-popover-foreground smooth-shadow-ring-md rounded-surface text-xs",
  );
  const idle = probe("text-muted-foreground");
  const hover = probe("bg-muted/60 text-foreground");
  const active = probe("bg-secondary text-primary");
  const badge = probe("bg-foreground text-background");
  const disc = probe("bg-card");
  const destructive = probe("text-destructive");
  const border = probe("border border-border");
  const primary = probe("bg-primary text-primary-foreground");
  const field = probe("bg-background");
  const popover = probe("bg-popover");
  const muted = probe("bg-muted");
  const warning = probe("text-warning");
  // A real <textarea>: element rules in globals.css change its border.
  const input = document.createElement("textarea");
  input.className = "border border-input";
  input.style.cssText = "position:fixed;left:-9999px;top:0;pointer-events:none";
  const focus = document.createElement("textarea");
  focus.className = "border border-ring/50";
  focus.style.cssText = input.style.cssText;
  const secondary = probe("text-secondary-foreground");
  // The segmented tabs use the trough `--default` in light, `--surface-card`
  // in dark, and the pill `--segment` (globals.css `.tabs-segmented`).
  const tabTrack = probe("");
  tabTrack.style.backgroundColor = document.documentElement.classList.contains("dark")
    ? "var(--surface-card)"
    : "var(--default)";
  const tabPill = probe("");
  tabPill.style.backgroundColor = "var(--segment)";
  const probes = [
    surface,
    tip,
    idle,
    hover,
    active,
    badge,
    disc,
    destructive,
    border,
    primary,
    field,
    popover,
    muted,
    warning,
    tabTrack,
    tabPill,
    input,
    focus,
    secondary,
  ];
  document.body.append(...probes);
  try {
    const surfaceStyle = getComputedStyle(surface);
    const hoverStyle = getComputedStyle(hover);
    const activeStyle = getComputedStyle(active);
    const badgeStyle = getComputedStyle(badge);
    return {
      fontFamily: surfaceStyle.fontFamily,
      surface: surfaceStyle.backgroundColor,
      surfaceText: surfaceStyle.color,
      barShadow: surfaceStyle.boxShadow,
      tipShadow: getComputedStyle(tip).boxShadow,
      tipRadius: getComputedStyle(tip).borderRadius,
      idleText: getComputedStyle(idle).color,
      hoverBg: hoverStyle.backgroundColor,
      hoverText: hoverStyle.color,
      activeBg: activeStyle.backgroundColor,
      activeText: activeStyle.color,
      badgeBg: badgeStyle.backgroundColor,
      badgeText: badgeStyle.color,
      disc: getComputedStyle(disc).backgroundColor,
      destructive: getComputedStyle(destructive).color,
      border: getComputedStyle(border).borderTopColor,
      primary: getComputedStyle(primary).backgroundColor,
      primaryText: getComputedStyle(primary).color,
      field: getComputedStyle(field).backgroundColor,
      popover: getComputedStyle(popover).backgroundColor,
      muted: getComputedStyle(muted).backgroundColor,
      warning: getComputedStyle(warning).color,
      inputBorder: getComputedStyle(input).borderTopColor,
      focusBorder: getComputedStyle(focus).borderTopColor,
      secondaryText: getComputedStyle(secondary).color,
      tabTrack: getComputedStyle(tabTrack).backgroundColor,
      tabPill: getComputedStyle(tabPill).backgroundColor,
    };
  } finally {
    for (const element of probes) element.remove();
  }
}
