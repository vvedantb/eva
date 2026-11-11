import { DEFAULT_ACCENT_COLOR, type Doc } from "@eva/backend";

/**
 * Tailwind chromatic accents, the Tailwind grey ramps, and four muted hues of
 * our own (taupe/mauve/mist/olive). `zinc` is the monochrome default — it is
 * the only entry that reads as pure black/white rather than a mid tone.
 */
export type CustomTheme = NonNullable<Doc<"users">["customTheme"]>;
export type AccentColor = NonNullable<CustomTheme["accentColor"]>;
export type RadiusSize = NonNullable<CustomTheme["radius"]>;
export type FontFamily = NonNullable<CustomTheme["fontFamily"]>;
export type LetterSpacing = NonNullable<CustomTheme["letterSpacing"]>;

export interface ResolvedCustomTheme {
  accentColor: AccentColor;
  radius: RadiusSize;
  fontFamily: FontFamily;
  letterSpacing: LetterSpacing;
}

const CUSTOM_THEME_DEFAULTS: ResolvedCustomTheme = {
  accentColor: DEFAULT_ACCENT_COLOR,
  radius: "xl",
  fontFamily: "inter",
  letterSpacing: "tight",
};

export function resolveCustomTheme(custom: CustomTheme): ResolvedCustomTheme {
  return {
    accentColor: custom.accentColor ?? CUSTOM_THEME_DEFAULTS.accentColor,
    radius: custom.radius ?? CUSTOM_THEME_DEFAULTS.radius,
    fontFamily: custom.fontFamily ?? CUSTOM_THEME_DEFAULTS.fontFamily,
    letterSpacing: custom.letterSpacing ?? CUSTOM_THEME_DEFAULTS.letterSpacing,
  };
}

export const FONT_FAMILIES: Record<
  FontFamily,
  { label: string; variable: string; stack: string }
> = {
  inter: {
    label: "Inter",
    variable: "--font-inter",
    stack: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
  roboto: {
    label: "Roboto",
    variable: "--font-roboto",
    stack: "Roboto, ui-sans-serif, system-ui, sans-serif",
  },
  poppins: {
    label: "Poppins",
    variable: "--font-poppins",
    stack: "Poppins, ui-sans-serif, system-ui, sans-serif",
  },
  "dm-sans": {
    label: "DM Sans",
    variable: "--font-dm-sans",
    stack: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
  },
  "space-grotesk": {
    label: "Space Grotesk",
    variable: "--font-space-grotesk",
    stack: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  },
  "host-grotesk": {
    label: "Host Grotesk",
    variable: "--font-host-grotesk",
    stack: "'Host Grotesk', ui-sans-serif, system-ui, sans-serif",
  },
  geist: {
    label: "Geist",
    variable: "--font-geist-sans",
    stack: "'Geist Sans', ui-sans-serif, system-ui, sans-serif",
  },
  "source-serif": {
    label: "Source Serif",
    variable: "--font-source-serif",
    stack: "'Source Serif 4', Georgia, 'Times New Roman', serif",
  },
  jakarta: {
    label: "Jakarta Sans",
    variable: "--font-jakarta",
    stack: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
  },
  outfit: {
    label: "Outfit",
    variable: "--font-outfit",
    stack: "Outfit, ui-sans-serif, system-ui, sans-serif",
  },
  nunito: {
    label: "Nunito",
    variable: "--font-nunito",
    stack: "Nunito, ui-sans-serif, system-ui, sans-serif",
  },
  "ibm-plex": {
    label: "IBM Plex Sans",
    variable: "--font-ibm-plex",
    stack: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
  },
  figtree: {
    label: "Figtree",
    variable: "--font-figtree",
    stack: "Figtree, ui-sans-serif, system-ui, sans-serif",
  },
};

/**
 * Accent tokens from the Tailwind default palette (600 light / 400 dark).
 * Light/dark appearance swaps these automatically via `:root` / `.dark`.
 * `zinc` is the exception: it uses the ends of the ramp (950 light / 50 dark)
 * for a monochrome look, and its values are the ones baked into globals.css.
 * taupe/mauve/mist/olive are ours — muted hues Tailwind has no ramp for.
 * @see https://tailwindcss.com/docs/colors
 */
export const ACCENT_COLORS: Record<
  AccentColor,
  {
    label: string;
    preview: string;
    /** Dark checkmark on the swatch (yellow/white/etc.). */
    checkDark?: boolean;
    light: {
      primary: string;
      foreground: string;
      accent: string;
      accentFg: string;
    };
    dark: {
      primary: string;
      foreground: string;
      accent: string;
      accentFg: string;
    };
  }
> = {
  zinc: {
    label: "Zinc",
    preview: "#18181B",
    light: {
      primary: "9 9 11",
      foreground: "250 250 250",
      accent: "244 244 245",
      accentFg: "24 24 27",
    },
    dark: {
      primary: "250 250 250",
      foreground: "9 9 11",
      accent: "24 24 27",
      accentFg: "244 244 245",
    },
  },
  red: {
    label: "Red",
    preview: "#DC2626",
    light: {
      primary: "220 38 38",
      foreground: "255 255 255",
      accent: "254 226 226",
      accentFg: "153 27 27",
    },
    dark: {
      primary: "248 113 113",
      foreground: "40 8 8",
      accent: "58 20 20",
      accentFg: "254 202 202",
    },
  },
  orange: {
    label: "Orange",
    preview: "#EA580C",
    light: {
      primary: "234 88 12",
      foreground: "255 255 255",
      accent: "255 237 213",
      accentFg: "154 52 18",
    },
    dark: {
      primary: "251 146 60",
      foreground: "40 18 8",
      accent: "58 30 12",
      accentFg: "253 186 116",
    },
  },
  amber: {
    label: "Amber",
    preview: "#D97706",
    checkDark: true,
    light: {
      primary: "217 119 6",
      foreground: "255 255 255",
      accent: "254 243 199",
      accentFg: "146 64 14",
    },
    dark: {
      primary: "251 191 36",
      foreground: "26 19 4",
      accent: "55 37 10",
      accentFg: "253 230 138",
    },
  },
  yellow: {
    label: "Yellow",
    preview: "#CA8A04",
    checkDark: true,
    light: {
      primary: "202 138 4",
      foreground: "24 24 27",
      accent: "254 249 195",
      accentFg: "133 77 14",
    },
    dark: {
      primary: "250 204 21",
      foreground: "24 24 27",
      accent: "66 48 6",
      accentFg: "254 240 138",
    },
  },
  lime: {
    label: "Lime",
    preview: "#65A30D",
    checkDark: true,
    light: {
      primary: "101 163 13",
      foreground: "24 24 27",
      accent: "236 252 203",
      accentFg: "63 98 18",
    },
    dark: {
      primary: "163 230 53",
      foreground: "24 24 27",
      accent: "38 54 12",
      accentFg: "217 249 157",
    },
  },
  green: {
    label: "Green",
    preview: "#16A34A",
    light: {
      primary: "22 163 74",
      foreground: "255 255 255",
      accent: "220 252 231",
      accentFg: "21 128 61",
    },
    dark: {
      primary: "74 222 128",
      foreground: "8 30 18",
      accent: "18 46 28",
      accentFg: "187 247 208",
    },
  },
  emerald: {
    label: "Emerald",
    preview: "#059669",
    light: {
      primary: "5 150 105",
      foreground: "255 255 255",
      accent: "209 250 229",
      accentFg: "4 120 87",
    },
    dark: {
      primary: "52 211 153",
      foreground: "2 32 24",
      accent: "6 48 36",
      accentFg: "167 243 208",
    },
  },
  teal: {
    label: "Teal",
    preview: "#0D9488",
    light: {
      primary: "13 148 136",
      foreground: "255 255 255",
      accent: "204 251 241",
      accentFg: "15 118 110",
    },
    dark: {
      primary: "45 212 191",
      foreground: "4 28 26",
      accent: "19 52 48",
      accentFg: "153 246 228",
    },
  },
  cyan: {
    label: "Cyan",
    preview: "#0891B2",
    light: {
      primary: "8 145 178",
      foreground: "255 255 255",
      accent: "207 250 254",
      accentFg: "22 78 99",
    },
    dark: {
      primary: "34 211 238",
      foreground: "4 26 34",
      accent: "12 54 70",
      accentFg: "165 243 252",
    },
  },
  sky: {
    label: "Sky",
    preview: "#0284C7",
    light: {
      primary: "2 132 199",
      foreground: "255 255 255",
      accent: "224 242 254",
      accentFg: "3 105 161",
    },
    dark: {
      primary: "56 189 248",
      foreground: "8 28 40",
      accent: "12 40 58",
      accentFg: "186 230 253",
    },
  },
  blue: {
    label: "Blue",
    preview: "#2563EB",
    light: {
      primary: "37 99 235",
      foreground: "255 255 255",
      accent: "219 234 254",
      accentFg: "29 78 216",
    },
    dark: {
      primary: "96 165 250",
      foreground: "8 18 40",
      accent: "22 36 60",
      accentFg: "191 219 254",
    },
  },
  indigo: {
    label: "Indigo",
    preview: "#4F46E5",
    light: {
      primary: "79 70 229",
      foreground: "255 255 255",
      accent: "224 231 255",
      accentFg: "55 48 163",
    },
    dark: {
      primary: "129 140 248",
      foreground: "12 10 40",
      accent: "30 27 75",
      accentFg: "199 210 254",
    },
  },
  violet: {
    label: "Violet",
    preview: "#7C3AED",
    light: {
      primary: "124 58 237",
      foreground: "255 255 255",
      accent: "237 233 254",
      accentFg: "91 33 182",
    },
    dark: {
      primary: "167 139 250",
      foreground: "18 8 40",
      accent: "38 28 58",
      accentFg: "221 214 254",
    },
  },
  purple: {
    label: "Purple",
    preview: "#9333EA",
    light: {
      primary: "147 51 234",
      foreground: "255 255 255",
      accent: "243 232 255",
      accentFg: "126 34 206",
    },
    dark: {
      primary: "192 132 252",
      foreground: "30 8 48",
      accent: "46 16 68",
      accentFg: "233 213 255",
    },
  },
  fuchsia: {
    label: "Fuchsia",
    preview: "#C026D3",
    light: {
      primary: "192 38 211",
      foreground: "255 255 255",
      accent: "250 232 255",
      accentFg: "162 28 175",
    },
    dark: {
      primary: "232 121 249",
      foreground: "40 8 44",
      accent: "58 16 64",
      accentFg: "240 171 252",
    },
  },
  pink: {
    label: "Pink",
    preview: "#DB2777",
    light: {
      primary: "219 39 119",
      foreground: "255 255 255",
      accent: "252 231 243",
      accentFg: "157 23 77",
    },
    dark: {
      primary: "244 114 182",
      foreground: "40 8 22",
      accent: "62 20 42",
      accentFg: "251 207 232",
    },
  },
  rose: {
    label: "Rose",
    preview: "#E11D48",
    light: {
      primary: "225 29 72",
      foreground: "255 255 255",
      accent: "255 228 230",
      accentFg: "159 18 57",
    },
    dark: {
      primary: "251 113 133",
      foreground: "40 8 18",
      accent: "58 20 30",
      accentFg: "253 164 175",
    },
  },
  slate: {
    label: "Slate",
    preview: "#475569",
    light: {
      primary: "71 85 105",
      foreground: "255 255 255",
      accent: "241 245 249",
      accentFg: "30 41 59",
    },
    dark: {
      primary: "148 163 184",
      foreground: "15 23 42",
      accent: "30 41 59",
      accentFg: "226 232 240",
    },
  },
  gray: {
    label: "Gray",
    preview: "#4B5563",
    light: {
      primary: "75 85 99",
      foreground: "255 255 255",
      accent: "243 244 246",
      accentFg: "31 41 55",
    },
    dark: {
      primary: "156 163 175",
      foreground: "17 24 39",
      accent: "31 41 55",
      accentFg: "229 231 235",
    },
  },
  neutral: {
    label: "Neutral",
    preview: "#525252",
    light: {
      primary: "82 82 82",
      foreground: "255 255 255",
      accent: "245 245 245",
      accentFg: "38 38 38",
    },
    dark: {
      primary: "163 163 163",
      foreground: "23 23 23",
      accent: "38 38 38",
      accentFg: "229 229 229",
    },
  },
  stone: {
    label: "Stone",
    preview: "#57534E",
    light: {
      primary: "87 83 78",
      foreground: "255 255 255",
      accent: "245 245 244",
      accentFg: "41 37 36",
    },
    dark: {
      primary: "168 162 158",
      foreground: "28 25 23",
      accent: "41 37 36",
      accentFg: "231 229 228",
    },
  },
  taupe: {
    label: "Taupe",
    preview: "#6F6259",
    light: {
      primary: "111 98 89",
      foreground: "255 255 255",
      accent: "242 238 235",
      accentFg: "69 60 54",
    },
    dark: {
      primary: "179 161 150",
      foreground: "36 31 27",
      accent: "45 40 36",
      accentFg: "222 211 203",
    },
  },
  mauve: {
    label: "Mauve",
    preview: "#7A6A7D",
    light: {
      primary: "122 106 125",
      foreground: "255 255 255",
      accent: "243 238 244",
      accentFg: "76 65 80",
    },
    dark: {
      primary: "185 166 189",
      foreground: "36 30 39",
      accent: "43 36 46",
      accentFg: "220 207 224",
    },
  },
  mist: {
    label: "Mist",
    preview: "#64798A",
    light: {
      primary: "100 121 138",
      foreground: "255 255 255",
      accent: "237 242 245",
      accentFg: "61 75 87",
    },
    dark: {
      primary: "168 188 201",
      foreground: "23 32 40",
      accent: "33 44 52",
      accentFg: "203 219 228",
    },
  },
  olive: {
    label: "Olive",
    preview: "#6B7250",
    light: {
      primary: "107 114 80",
      foreground: "255 255 255",
      accent: "240 242 232",
      accentFg: "67 72 48",
    },
    dark: {
      primary: "175 182 140",
      foreground: "29 32 19",
      accent: "39 43 28",
      accentFg: "220 224 198",
    },
  },
};

export const RADIUS_VALUES: Record<RadiusSize, string> = {
  none: "0rem",
  sm: "0.25rem",
  md: "0.5rem",
  lg: "0.75rem",
  xl: "1rem",
  full: "9999px",
};

export const LETTER_SPACING_VALUES: Record<
  LetterSpacing,
  { label: string; value: string }
> = {
  tighter: { label: "Tighter", value: "-0.04em" },
  tight: { label: "Tight", value: "-0.02em" },
  normal: { label: "Normal", value: "-0.012em" },
  wide: { label: "Wide", value: "0.01em" },
  wider: { label: "Wider", value: "0.03em" },
};

/**
 * Accent tokens for a stored accent name, or `undefined` when this build does
 * not define that accent.
 *
 * `ACCENT_COLORS` is keyed by a closed union, so a direct index read is typed
 * as always-present. That is a lie for any name that came out of the database
 * rather than out of this build, and reading `.light` off the miss throws
 * during render. Going through a `Partial` view is what makes the gap visible
 * to the compiler — no cast, no non-null assertion.
 *
 * ══════════ CLEAN UP ONCE `staging` IS MERGED INTO `main` ══════════
 *
 * Why it exists: `main` defines 11 accents, `staging` defines 26. Someone who
 * picks a staging-only accent (`olive`, say) and then loads a `main` deploy
 * hits the miss, and the whole app drops to the error boundary over a colour.
 * Both branches are live at once while the landing page ships ahead of the rest
 * of staging, so the two sets can and do disagree today.
 *
 * When to remove: as soon as both branches ship the same accents. Check by
 * diffing the `AccentColor` union across the branches; once they match, a miss
 * is unreachable and this is dead weight.
 *
 * What to remove, exactly — and nothing else:
 *   1. This function, along with this comment.
 *   2. In `applyCustomThemeVars`: delete the `if (colors === undefined)` branch
 *      and change `const colors = lookupAccent(accentColor)` back to
 *      `const colors = ACCENT_COLORS[accentColor]`.
 *   3. In `theme/_components/ThemePreview.tsx`: delete the `accent` local and
 *      its `??` fallbacks, restoring `ACCENT_COLORS[accentColor].preview` and
 *      `ACCENT_COLORS[accentColor].label`, then drop the `lookupAccent` import.
 *
 * Leave `clearAccentOverride` in place — the default-accent early return in
 * `applyCustomThemeVars` calls it too.
 */
export function lookupAccent(accentColor: AccentColor) {
  const table: Partial<typeof ACCENT_COLORS> = ACCENT_COLORS;
  return table[accentColor];
}
