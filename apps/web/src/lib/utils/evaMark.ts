import type { ThemeAppearance } from "@/lib/hooks/useThemeMode";

/**
 * Eva's mark: a filled circle with a two-tone star across its middle.
 *
 * Single source of truth for the geometry. `EvaIcon` and `LogoMark` render it
 * as JSX; `evaMarkDataUri` serialises it for the favicon. The two static files
 * in public/ (`icon.svg`, `favicon.svg`) mirror these numbers by hand — edit
 * them alongside anything here.
 */
export const EVA_MARK_TOP_POINTS = "0,256 217,237 256,64 295,237 512,256";
export const EVA_MARK_BOTTOM_POINTS = "0,256 217,275 256,449 295,275 512,256";
export const EVA_MARK_PURPLE = "#8B3FB8";
export const EVA_MARK_BLUE = "#3B7DD8";

/**
 * Favicon disc colours. Must read against OS tab chrome, not the app shell.
 * Discord keeps one bright mark; we do the same — light tile in every theme
 * so the disc silhouette never vanishes on a dark tab bar.
 */
const FAVICON_SURFACE: Record<ThemeAppearance, string> = {
  light: "#FFFFFF",
  dark: "#FFFFFF",
  neutral: "#FFFFFF",
};

/** Browser/OS chrome colour per theme, mirroring `--app-shell` in globals.css. */
export const SHELL_COLOR: Record<ThemeAppearance, string> = {
  light: "#F4F5F6",
  dark: "#020202",
  neutral: "#222325",
};

/**
 * Favicon layout, in the 512 viewBox.
 *
 * Only the white disc + star are rounded-full. They sit inset toward the
 * top-left so the unread bubble can rest on the disc's bottom-right edge
 * without being clipped by the canvas — the badge is drawn after the mark
 * (on top), not inside a clipped circle. Same layout with or without a
 * count so the tab icon does not resize as notifications arrive and clear.
 */
/** Disc centre nudged TL; radius leaves a BR gutter for the badge. */
const DISC_CX = 210;
const DISC_CY = 210;
const DISC_R = 210;
/** Star geometry is authored for a 256-radius disc; scale into this disc. */
const FAVICON_STAR_SCALE = (1.45 * DISC_R) / 256;
/**
 * Badge centre on the disc's BR (drawn after it = on top). Nudged into the
 * corner; outer red may kiss the viewBox like Discord. Digit is slightly
 * under 2× so it stays readable when the bubble hangs off the edge.
 */
const BADGE_CENTER = 340;
/** Thin dark separator only; red gets almost the whole bubble. */
const BADGE_CUTOUT_RADIUS = 210;
const BADGE_RADIUS = 198;

/** Slightly under 2× the pre-enlarge badges (220 / 160 / 100). */
function badgeFontSize(label: string): number {
  if (label.length >= 3) return 180;
  if (label.length === 2) return 290;
  return 400;
}

/** Inset rounded-full disc + enlarged star, clipped to the disc. */
function markGroup(surface: string): string {
  return (
    `<defs><clipPath id="eva-disc"><circle cx="${DISC_CX}" cy="${DISC_CY}" r="${DISC_R}"/></clipPath></defs>` +
    `<circle cx="${DISC_CX}" cy="${DISC_CY}" r="${DISC_R}" fill="${surface}"/>` +
    `<g clip-path="url(#eva-disc)" transform="translate(${DISC_CX} ${DISC_CY}) scale(${FAVICON_STAR_SCALE}) translate(-256 -256)">` +
    `<polygon points="${EVA_MARK_TOP_POINTS}" fill="${EVA_MARK_PURPLE}"/>` +
    `<polygon points="${EVA_MARK_BOTTOM_POINTS}" fill="${EVA_MARK_BLUE}"/>` +
    `</g>`
  );
}

/** Unread bubble drawn after the mark so it sits on top of the disc edge. */
function badgeGroup(label: string, fill: string, fg: string): string {
  return (
    `<circle cx="${BADGE_CENTER}" cy="${BADGE_CENTER}" r="${BADGE_CUTOUT_RADIUS}" fill="#020202"/>` +
    `<circle cx="${BADGE_CENTER}" cy="${BADGE_CENTER}" r="${BADGE_RADIUS}" fill="${fill}"/>` +
    `<text x="${BADGE_CENTER}" y="${BADGE_CENTER}" text-anchor="middle" dominant-baseline="central" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="${badgeFontSize(label)}" fill="${fg}">${label}</text>`
  );
}

/** `countUnread` saturates at 100, so anything above 99 is reported as "99+". */
export function formatBadgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * Eva's mark in the active theme's surface colour, optionally carrying an
 * unread count, as a data URI ready for a `<link rel="icon">` href.
 * `badgeFill` / `badgeFg` are the user's accent (`--primary` /
 * `--primary-foreground`) when a count is shown.
 */
export function evaMarkDataUri(
  appearance: ThemeAppearance,
  badgeLabel: string | null,
  badgeFill: string,
  badgeFg: string,
): string {
  const surface = FAVICON_SURFACE[appearance];
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
    markGroup(surface) +
    (badgeLabel === null ? "" : badgeGroup(badgeLabel, badgeFill, badgeFg)) +
    "</svg>";
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
