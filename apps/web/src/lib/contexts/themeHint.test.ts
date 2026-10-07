import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CUSTOM_THEME_HINT_KEY,
  readThemeHintSeed,
  writeCustomThemeHint,
  writeThemeAppearanceHint,
} from "./themeHint";

/**
 * The FOUC hint is the only thing that survives a reload before Convex answers,
 * so it has to carry the *preference*, not just the appearance it resolved to
 * (e5ecaa85d, 2026-09-16). "System" resolved to light or dark on the way out,
 * and a hint that stored only that came back as a fixed Light or Dark on the
 * next boot: the user's System choice was silently downgraded, and flipping the
 * OS theme stopped moving Eva.
 *
 * The other half of the round trip is the inline script in `index.html`, which
 * repaints from the same record — see `themeFoucScript.test.ts`.
 */

/** In-memory stand-in: the node test environment has no localStorage. */
function fakeStorage(seed?: string) {
  const store = new Map<string, string>();
  if (seed !== undefined) store.set(CUSTOM_THEME_HINT_KEY, seed);
  return {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    raw: () => store.get(CUSTOM_THEME_HINT_KEY),
  };
}

function install(storage: { getItem: unknown; setItem: unknown }) {
  vi.stubGlobal("localStorage", storage);
}

beforeEach(() => {
  install(fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme FOUC hint", () => {
  test("round-trips System as System, not as the theme it resolved to", () => {
    writeThemeAppearanceHint("dark", "system");

    expect(readThemeHintSeed()).toEqual({ mode: "system", appearance: "dark" });
  });

  test("keeps an explicit preference apart from its appearance", () => {
    writeThemeAppearanceHint("dark", "neutral");

    expect(readThemeHintSeed()).toEqual({
      mode: "neutral",
      appearance: "dark",
    });
  });

  test("saving a custom theme leaves the preference alone", () => {
    writeThemeAppearanceHint("light", "system");
    writeCustomThemeHint({
      accentColor: "#5b7cfa",
      radius: "md",
      fontFamily: "geist",
      letterSpacing: "tight",
    });

    expect(readThemeHintSeed()).toEqual({
      mode: "system",
      appearance: "light",
    });
  });

  test("changing the theme leaves the custom fields alone", () => {
    const storage = fakeStorage();
    install(storage);
    writeCustomThemeHint({
      accentColor: "#5b7cfa",
      radius: "md",
      fontFamily: "geist",
      letterSpacing: "tight",
    });
    writeThemeAppearanceHint("dark", "system");

    expect(JSON.parse(storage.raw() ?? "{}")).toMatchObject({
      accentColor: "#5b7cfa",
      fontFamily: "geist",
      mode: "system",
      appearance: "dark",
    });
  });

  test("a hint written before `mode` existed still yields its appearance", () => {
    install(fakeStorage(JSON.stringify({ appearance: "neutral" })));

    // `mode: undefined` is what tells the provider to fall back to the
    // appearance; reporting "neutral" here would invent a preference the user
    // never expressed.
    expect(readThemeHintSeed()).toEqual({
      mode: undefined,
      appearance: "neutral",
    });
  });

  test("ignores values that are not themes", () => {
    install(fakeStorage(JSON.stringify({ mode: "midnight", appearance: 7 })));

    expect(readThemeHintSeed()).toEqual({
      mode: undefined,
      appearance: undefined,
    });
  });

  test("survives a hint that is not an object", () => {
    install(fakeStorage("[]"));
    expect(readThemeHintSeed()).toEqual({
      mode: undefined,
      appearance: undefined,
    });

    install(fakeStorage("not json"));
    expect(readThemeHintSeed()).toEqual({
      mode: undefined,
      appearance: undefined,
    });
  });

  test("a storage that throws never breaks the render", () => {
    install({
      getItem: () => {
        throw new Error("private mode");
      },
      setItem: () => {
        throw new Error("private mode");
      },
    });

    expect(() => writeThemeAppearanceHint("dark", "system")).not.toThrow();
    expect(readThemeHintSeed()).toEqual({
      mode: undefined,
      appearance: undefined,
    });
  });
});
