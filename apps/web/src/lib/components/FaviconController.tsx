import { useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useConvexAuth } from "convex/react";
import { DEFAULT_ACCENT_COLOR, api } from "@eva/backend";
import {
  ACCENT_COLORS,
  lookupAccent,
  type AccentColor,
} from "@/lib/contexts/themeTokens";
import { setDocumentUnreadCount } from "@/lib/hooks/useDocumentTitle";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import {
  SHELL_COLOR,
  evaMarkDataUri,
  formatBadgeLabel,
} from "@/lib/utils/evaMark";

const PLAIN_ICON_HREF = "/favicon.svg";

function badgeAccentColors(
  appearance: "light" | "neutral" | "dark",
  accentColor: AccentColor,
): { fill: string; fg: string } {
  const colors = lookupAccent(accentColor) ?? ACCENT_COLORS.zinc;
  const tone = appearance === "light" ? colors.light : colors.dark;
  return {
    fill: tone.primary,
    fg: tone.foreground,
  };
}

/**
 * Owns the browser tab's identity: the favicon and the theme-color meta.
 *
 * Both are document-level state that no React tree owns, so mirroring the theme
 * and a live query onto them is a genuine external-system effect. Keeping one
 * component in charge means one writer for the icon href — a separate
 * theme-watcher and badge-watcher would fight over it.
 *
 * Only the SVG icon link is touched: Chrome, Edge, and Firefox prefer it over
 * the PNG and ICO siblings, while Safari ignores SVG favicons entirely and
 * keeps showing the plain PNG. Safari therefore sees neither the theme surface
 * nor the badge rather than breaking.
 *
 * Reads the same cached `needsYou.list` subscription as the sidebar rail
 * badge (what waits for you to act), so it adds no extra server load.
 * Mounted above the auth gate so signed-out pages still get a themed icon,
 * which is why the query is skipped until Convex reports an identity.
 * Renders nothing.
 */
export function FaviconController() {
  const { appearance } = useThemeMode();
  const { isAuthenticated } = useConvexAuth();
  const needsYouCount = useQuery(
    api.needsYou.list,
    isAuthenticated ? {} : "skip",
  )?.length;
  const customTheme = useQuery(
    api.auth.getCustomTheme,
    isAuthenticated ? {} : "skip",
  );
  const accentColor = customTheme?.accentColor ?? DEFAULT_ACCENT_COLOR;

  useEffect(() => {
    setDocumentUnreadCount(needsYouCount ?? 0);

    const link = document.querySelector(
      'link[rel="icon"][type="image/svg+xml"]',
    );
    if (!(link instanceof HTMLLinkElement)) return;

    const hasBadge = needsYouCount !== undefined && needsYouCount > 0;
    const { fill, fg } = badgeAccentColors(appearance, accentColor);
    link.href = evaMarkDataUri(
      appearance,
      hasBadge ? formatBadgeLabel(needsYouCount) : null,
      fill,
      fg,
    );

    return () => {
      link.href = PLAIN_ICON_HREF;
    };
  }, [appearance, needsYouCount, accentColor]);

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!(meta instanceof HTMLMetaElement)) return;
    meta.content = SHELL_COLOR[appearance];
  }, [appearance]);

  return null;
}
