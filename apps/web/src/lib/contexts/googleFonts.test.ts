import { afterEach, describe, expect, test, vi } from "vitest";
import { FONT_FAMILIES } from "./themeTokens";
import { GOOGLE_FONT_HREFS } from "./googleFonts";

const googleHrefCount = Object.values(GOOGLE_FONT_HREFS).filter(
  (href) => href !== null,
).length;

describe("GOOGLE_FONT_HREFS", () => {
  test("covers every picker family and leaves Geist without a Google file", () => {
    expect(Object.keys(GOOGLE_FONT_HREFS).sort()).toEqual(
      Object.keys(FONT_FAMILIES).sort(),
    );
    expect(GOOGLE_FONT_HREFS.geist).toBeNull();
    expect(GOOGLE_FONT_HREFS.inter).toContain("family=Inter:wght@400;500;600;700");
  });
});

describe("ensureGoogleFont", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test("injects a stylesheet once per href and skips Geist", async () => {
    vi.resetModules();
    type FontLink = {
      rel: string;
      href: string;
      media: string;
      onload: (() => void) | null;
      setAttribute: (name: string, value: string) => void;
    };
    const created: FontLink[] = [];
    const headLinks: { getAttribute: (name: string) => string | null }[] = [];
    vi.stubGlobal("document", {
      querySelectorAll: () => headLinks,
      createElement: (tag: string) => {
        expect(tag).toBe("link");
        const el: FontLink = {
          rel: "",
          href: "",
          media: "",
          onload: null,
          setAttribute: (name: string, value: string) => {
            if (name === "data-eva-font-href") {
              headLinks.push({
                getAttribute: (key: string) =>
                  key === "data-eva-font-href" ? value : null,
              });
            }
          },
        };
        created.push(el);
        return el;
      },
      head: {
        appendChild: () => undefined,
      },
    });
    const fonts = await import("./googleFonts");
    fonts.ensureGoogleFont("geist");
    expect(created).toHaveLength(0);
    fonts.ensureGoogleFont("inter");
    fonts.ensureGoogleFont("inter");
    expect(created).toHaveLength(1);
    expect(created[0]?.href).toBe(GOOGLE_FONT_HREFS.inter);
    fonts.preloadGoogleFontsForPicker();
    fonts.preloadGoogleFontsForPicker();
    expect(created).toHaveLength(googleHrefCount);
  });
});
