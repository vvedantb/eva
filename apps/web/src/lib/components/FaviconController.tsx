import { useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useConvexAuth } from "convex/react";
import { api } from "@eva/backend";
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

/** The static icon shipped in public/, restored when this unmounts. */
const PLAIN_ICON_HREF = "/favicon.svg";

/** Theme tokens are space-separated sRGB channels — SVG fill needs `rgb()`. */
function rgbChannels(channels: string): string {
  return `rgb(${channels})`;
}

/**
 * Badge fill/fg from the chosen accent (Settings → Theme), matching how
 * `applyCustomThemeVars` paints `--primary` / `--primary-foreground`.
 */
function badgeAccentColors(
  appearance: "light" | "neutral" | "dark",
  accentColor: AccentColor,
): { fill: string; fg: string } {
  const colors = lookupAccent(accentColor) ?? ACCENT_COLORS.zinc;
  const tone = appearance === "light" ? colors.light : colors.dark;
  return {
    fill: rgbChannels(tone.primary),
    fg: rgbChannels(tone.foreground),
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
 * Reads the same cached `countUnread` subscription as the sidebar rail badge,
 * so it inherits that query's optimistic updates and adds no extra server load.
 * Mounted above the auth gate so signed-out pages still get a themed icon,
 * which is why the query is skipped until Convex reports an identity.
 * Renders nothing.
 */
export function FaviconController() {
  const { appearance } = useThemeMode();
  const { isAuthenticated } = useConvexAuth();
  const unreadCount = useQuery(
    api.notifications.countUnread,
    isAuthenticated ? {} : "skip",
  );
  const customTheme = useQuery(
    api.auth.getCustomTheme,
    isAuthenticated ? {} : "skip",
  );
  const accentColor = customTheme?.accentColor ?? "zinc";

  useEffect(() => {
    // The tab title carries the same count as the badge ("(3) … | Eva"), so it
    // is published from here rather than from a second subscription.
    setDocumentUnreadCount(unreadCount ?? 0);

    const link = document.querySelector(
      'link[rel="icon"][type="image/svg+xml"]',
    );
    if (!(link instanceof HTMLLinkElement)) return;

    const hasUnread = unreadCount !== undefined && unreadCount > 0;
    const { fill, fg } = badgeAccentColors(appearance, accentColor);
    link.href = evaMarkDataUri(
      appearance,
      hasUnread ? formatBadgeLabel(unreadCount) : null,
      fill,
      fg,
    );

    // Unmounting without clearing would leave a stale count on the tab.
    return () => {
      link.href = PLAIN_ICON_HREF;
    };
  }, [appearance, unreadCount, accentColor]);

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!(meta instanceof HTMLMetaElement)) return;
    meta.content = SHELL_COLOR[appearance];
  }, [appearance]);

  return null;
}
