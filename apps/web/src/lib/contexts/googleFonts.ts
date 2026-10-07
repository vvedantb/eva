import type { FontFamily } from "./themeTokens";

function googleCss2(familyQuery: string): string {
  return `https://fonts.googleapis.com/css2?family=${familyQuery}&display=swap`;
}

/**
 * One CSS2 stylesheet per picker family. Geist is a system stack — Google
 * never served it, even on the old kitchen-sink link.
 *
 * Keep these hrefs in sync with the `fontHrefs` map in `apps/web/index.html`
 * (the boot script cannot import this module).
 */
export const GOOGLE_FONT_HREFS: Record<FontFamily, string | null> = {
  geist: null,
  inter: googleCss2("Inter:wght@400;500;600;700"),
  roboto: googleCss2("Roboto:wght@400;500;700"),
  poppins: googleCss2("Poppins:wght@400;500;600;700"),
  "dm-sans": googleCss2("DM+Sans:wght@400;500;600;700"),
  "space-grotesk": googleCss2("Space+Grotesk:wght@400;500;600;700"),
  "host-grotesk": googleCss2("Host+Grotesk:wght@400;500;600;700"),
  "source-serif": googleCss2("Source+Serif+4:wght@400;500;600;700"),
  jakarta: googleCss2("Plus+Jakarta+Sans:wght@400;500;600;700"),
  outfit: googleCss2("Outfit:wght@400;500;600;700"),
  nunito: googleCss2("Nunito:wght@400;500;600;700"),
  "ibm-plex": googleCss2("IBM+Plex+Sans:wght@400;500;600;700"),
  figtree: googleCss2("Figtree:wght@400;500;600;700"),
};

const injectedHrefs = new Set<string>();

function injectGoogleFontStylesheet(href: string): void {
  if (typeof document === "undefined") return;
  if (injectedHrefs.has(href)) return;
  const links = document.querySelectorAll("link[data-eva-font-href]");
  for (const link of links) {
    if (link.getAttribute("data-eva-font-href") === href) {
      injectedHrefs.add(href);
      return;
    }
  }
  injectedHrefs.add(href);
  const el = document.createElement("link");
  el.rel = "stylesheet";
  el.href = href;
  el.media = "print";
  el.onload = () => {
    el.media = "all";
  };
  el.setAttribute("data-eva-font-href", href);
  document.head.appendChild(el);
}

export function ensureGoogleFont(fontFamily: FontFamily): void {
  const href = GOOGLE_FONT_HREFS[fontFamily];
  if (href === null) return;
  injectGoogleFontStylesheet(href);
}

/** Load every picker family. Call from the typography picker while it is on screen. */
export function preloadGoogleFontsForPicker(): void {
  for (const href of Object.values(GOOGLE_FONT_HREFS)) {
    if (href === null) continue;
    injectGoogleFontStylesheet(href);
  }
}
