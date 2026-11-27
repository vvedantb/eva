import type { ThemeAppearance } from "@/lib/hooks/useThemeMode";

export {
  EVA_MARK_TOP_POINTS,
  EVA_MARK_BOTTOM_POINTS,
  EVA_DISC_STAR_TOP_POINTS,
  EVA_DISC_STAR_BOTTOM_POINTS,
  EVA_DISC_STAR_SCALE,
  EVA_MARK_PURPLE,
  EVA_MARK_BLUE,
} from "@eva/shared/evaMark";
import {
  EVA_DISC_STAR_BOTTOM_POINTS,
  EVA_DISC_STAR_SCALE,
  EVA_DISC_STAR_TOP_POINTS,
  EVA_MARK_BLUE,
  EVA_MARK_PURPLE,
} from "@eva/shared/evaMark";

const FAVICON_SURFACE: Record<ThemeAppearance, string> = {
  light: "#FFFFFF",
  dark: "#FFFFFF",
  neutral: "#FFFFFF",
};

/** Browser/OS chrome colour per theme, mirroring `--app-shell` in globals.css. */
export const SHELL_COLOR: Record<ThemeAppearance, string> = {
  light: "#F5F5F5",
  dark: "#060606",
  neutral: "#222325",
};

const DISC_CX = 256;
const DISC_CY = 256;
const DISC_R = 256;
const BADGE_CENTER = 340;
const BADGE_CUTOUT_RADIUS = 210;
const BADGE_RADIUS = 198;

function badgeFontSize(label: string): number {
  if (label.length >= 3) return 180;
  if (label.length === 2) return 290;
  return 400;
}

function markGroup(surface: string): string {
  return (
    `<defs><clipPath id="eva-disc"><circle cx="${DISC_CX}" cy="${DISC_CY}" r="${DISC_R}"/></clipPath></defs>` +
    `<circle cx="${DISC_CX}" cy="${DISC_CY}" r="${DISC_R}" fill="${surface}"/>` +
    `<g clip-path="url(#eva-disc)" transform="translate(${DISC_CX} ${DISC_CY}) scale(${EVA_DISC_STAR_SCALE}) translate(-256 -256)">` +
    `<polygon points="${EVA_DISC_STAR_TOP_POINTS}" fill="${EVA_MARK_PURPLE}"/>` +
    `<polygon points="${EVA_DISC_STAR_BOTTOM_POINTS}" fill="${EVA_MARK_BLUE}"/>` +
    `</g>`
  );
}

function badgeGroup(label: string, fill: string, fg: string): string {
  return (
    `<circle cx="${BADGE_CENTER}" cy="${BADGE_CENTER}" r="${BADGE_CUTOUT_RADIUS}" fill="#060606"/>` +
    `<circle cx="${BADGE_CENTER}" cy="${BADGE_CENTER}" r="${BADGE_RADIUS}" fill="${fill}"/>` +
    `<text x="${BADGE_CENTER}" y="${BADGE_CENTER}" text-anchor="middle" dominant-baseline="central" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="${badgeFontSize(label)}" fill="${fg}">${label}</text>`
  );
}

/** Counts above 99 show as "99+". */
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
