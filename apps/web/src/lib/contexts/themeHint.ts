/** localStorage key for early-paint theme hint (read by index.html). */
export const CUSTOM_THEME_HINT_KEY = "eva-custom-theme-hint";

export type ThemeHintMode = "light" | "neutral" | "dark" | "system";

type ThemeHint = {
  accentColor?: string;
  radius?: string;
  fontFamily?: string;
  letterSpacing?: string;
  /** Resolved appearance for FOUC. Convex owns the real preference. */
  appearance?: "light" | "neutral" | "dark";
  /**
   * The preference behind `appearance`. Needed because "system" resolves to a
   * light/dark appearance, so the appearance alone cannot round-trip it.
   * Absent in hints written before this field existed.
   */
  mode?: ThemeHintMode;
};

function getStringProp(value: object, key: string): string | undefined {
  if (!(key in value)) return undefined;
  const prop = Reflect.get(value, key);
  return typeof prop === "string" ? prop : undefined;
}

function isAppearance(
  value: string | undefined,
): value is "light" | "neutral" | "dark" {
  return value === "light" || value === "neutral" || value === "dark";
}

function isMode(value: string | undefined): value is ThemeHintMode {
  return isAppearance(value) || value === "system";
}

function readThemeHint(): ThemeHint {
  try {
    const raw = localStorage.getItem(CUSTOM_THEME_HINT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const appearance = getStringProp(parsed, "appearance");
    const mode = getStringProp(parsed, "mode");
    return {
      accentColor: getStringProp(parsed, "accentColor"),
      radius: getStringProp(parsed, "radius"),
      fontFamily: getStringProp(parsed, "fontFamily"),
      letterSpacing: getStringProp(parsed, "letterSpacing"),
      ...(isAppearance(appearance) ? { appearance } : {}),
      ...(isMode(mode) ? { mode } : {}),
    };
  } catch {
    return {};
  }
}

function writeThemeHint(patch: ThemeHint) {
  try {
    localStorage.setItem(
      CUSTOM_THEME_HINT_KEY,
      JSON.stringify({ ...readThemeHint(), ...patch }),
    );
  } catch {
    // Ignore quota / private mode failures — live query still wins.
  }
}

/**
 * Merge the preference and its resolved appearance into the FOUC hint (no
 * `"theme"` localStorage). Both are needed: index.html paints from
 * `appearance`, but re-resolves it against the OS when `mode` is "system".
 */
export function writeThemeAppearanceHint(
  appearance: "light" | "neutral" | "dark",
  mode: ThemeHintMode,
) {
  writeThemeHint({ appearance, mode });
}

/**
 * Preference and resolved appearance from the FOUC hint, for seeding the first
 * client render. Hints written before `mode` existed return `mode: undefined`.
 */
export function readThemeHintSeed(): {
  mode: ThemeHintMode | undefined;
  appearance: "light" | "neutral" | "dark" | undefined;
} {
  const hint = readThemeHint();
  return { mode: hint.mode, appearance: hint.appearance };
}

/** Merge custom-theme fields into the FOUC hint. */
export function writeCustomThemeHint(fields: {
  accentColor: string;
  radius: string;
  fontFamily: string;
  letterSpacing: string;
}) {
  writeThemeHint(fields);
}
