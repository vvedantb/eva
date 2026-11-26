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
      primary: "rgb(9 9 11)",
      foreground: "rgb(250 250 250)",
      accent: "rgb(244 244 245)",
      accentFg: "rgb(24 24 27)",
    },
    dark: {
      primary: "rgb(250 250 250)",
      foreground: "rgb(9 9 11)",
      accent: "rgb(24 24 27)",
      accentFg: "rgb(244 244 245)",
    },
  },
  red: {
    label: "Red",
    preview: "#DC2626",
    light: {
      primary: "rgb(220 38 38)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(254 226 226)",
      accentFg: "rgb(153 27 27)",
    },
    dark: {
      primary: "rgb(248 113 113)",
      foreground: "rgb(40 8 8)",
      accent: "rgb(58 20 20)",
      accentFg: "rgb(254 202 202)",
    },
  },
  orange: {
    label: "Orange",
    preview: "#EA580C",
    light: {
      primary: "rgb(234 88 12)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(255 237 213)",
      accentFg: "rgb(154 52 18)",
    },
    dark: {
      primary: "rgb(251 146 60)",
      foreground: "rgb(40 18 8)",
      accent: "rgb(58 30 12)",
      accentFg: "rgb(253 186 116)",
    },
  },
  amber: {
    label: "Amber",
    preview: "#D97706",
    checkDark: true,
    light: {
      primary: "rgb(217 119 6)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(254 243 199)",
      accentFg: "rgb(146 64 14)",
    },
    dark: {
      primary: "rgb(251 191 36)",
      foreground: "rgb(26 19 4)",
      accent: "rgb(55 37 10)",
      accentFg: "rgb(253 230 138)",
    },
  },
  yellow: {
    label: "Yellow",
    preview: "#CA8A04",
    checkDark: true,
    light: {
      primary: "rgb(202 138 4)",
      foreground: "rgb(24 24 27)",
      accent: "rgb(254 249 195)",
      accentFg: "rgb(133 77 14)",
    },
    dark: {
      primary: "rgb(250 204 21)",
      foreground: "rgb(24 24 27)",
      accent: "rgb(66 48 6)",
      accentFg: "rgb(254 240 138)",
    },
  },
  lime: {
    label: "Lime",
    preview: "#65A30D",
    checkDark: true,
    light: {
      primary: "rgb(101 163 13)",
      foreground: "rgb(24 24 27)",
      accent: "rgb(236 252 203)",
      accentFg: "rgb(63 98 18)",
    },
    dark: {
      primary: "rgb(163 230 53)",
      foreground: "rgb(24 24 27)",
      accent: "rgb(38 54 12)",
      accentFg: "rgb(217 249 157)",
    },
  },
  green: {
    label: "Green",
    preview: "#16A34A",
    light: {
      primary: "rgb(22 163 74)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(220 252 231)",
      accentFg: "rgb(21 128 61)",
    },
    dark: {
      primary: "rgb(74 222 128)",
      foreground: "rgb(8 30 18)",
      accent: "rgb(18 46 28)",
      accentFg: "rgb(187 247 208)",
    },
  },
  emerald: {
    label: "Emerald",
    preview: "#059669",
    light: {
      primary: "rgb(5 150 105)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(209 250 229)",
      accentFg: "rgb(4 120 87)",
    },
    dark: {
      primary: "rgb(52 211 153)",
      foreground: "rgb(2 32 24)",
      accent: "rgb(6 48 36)",
      accentFg: "rgb(167 243 208)",
    },
  },
  teal: {
    label: "Teal",
    preview: "#0D9488",
    light: {
      primary: "rgb(13 148 136)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(204 251 241)",
      accentFg: "rgb(15 118 110)",
    },
    dark: {
      primary: "rgb(45 212 191)",
      foreground: "rgb(4 28 26)",
      accent: "rgb(19 52 48)",
      accentFg: "rgb(153 246 228)",
    },
  },
  cyan: {
    label: "Cyan",
    preview: "#0891B2",
    light: {
      primary: "rgb(8 145 178)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(207 250 254)",
      accentFg: "rgb(22 78 99)",
    },
    dark: {
      primary: "rgb(34 211 238)",
      foreground: "rgb(4 26 34)",
      accent: "rgb(12 54 70)",
      accentFg: "rgb(165 243 252)",
    },
  },
  sky: {
    label: "Sky",
    preview: "#0284C7",
    light: {
      primary: "rgb(2 132 199)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(224 242 254)",
      accentFg: "rgb(3 105 161)",
    },
    dark: {
      primary: "rgb(56 189 248)",
      foreground: "rgb(8 28 40)",
      accent: "rgb(12 40 58)",
      accentFg: "rgb(186 230 253)",
    },
  },
  blue: {
    label: "Blue",
    preview: "#2563EB",
    light: {
      primary: "rgb(37 99 235)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(219 234 254)",
      accentFg: "rgb(29 78 216)",
    },
    dark: {
      primary: "rgb(96 165 250)",
      foreground: "rgb(8 18 40)",
      accent: "rgb(22 36 60)",
      accentFg: "rgb(191 219 254)",
    },
  },
  indigo: {
    label: "Indigo",
    preview: "#4F46E5",
    light: {
      primary: "rgb(79 70 229)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(224 231 255)",
      accentFg: "rgb(55 48 163)",
    },
    dark: {
      primary: "rgb(129 140 248)",
      foreground: "rgb(12 10 40)",
      accent: "rgb(30 27 75)",
      accentFg: "rgb(199 210 254)",
    },
  },
  violet: {
    label: "Violet",
    preview: "#7C3AED",
    light: {
      primary: "rgb(124 58 237)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(237 233 254)",
      accentFg: "rgb(91 33 182)",
    },
    dark: {
      primary: "rgb(167 139 250)",
      foreground: "rgb(18 8 40)",
      accent: "rgb(38 28 58)",
      accentFg: "rgb(221 214 254)",
    },
  },
  purple: {
    label: "Purple",
    preview: "#9333EA",
    light: {
      primary: "rgb(147 51 234)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(243 232 255)",
      accentFg: "rgb(126 34 206)",
    },
    dark: {
      primary: "rgb(192 132 252)",
      foreground: "rgb(30 8 48)",
      accent: "rgb(46 16 68)",
      accentFg: "rgb(233 213 255)",
    },
  },
  fuchsia: {
    label: "Fuchsia",
    preview: "#C026D3",
    light: {
      primary: "rgb(192 38 211)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(250 232 255)",
      accentFg: "rgb(162 28 175)",
    },
    dark: {
      primary: "rgb(232 121 249)",
      foreground: "rgb(40 8 44)",
      accent: "rgb(58 16 64)",
      accentFg: "rgb(240 171 252)",
    },
  },
  pink: {
    label: "Pink",
    preview: "#DB2777",
    light: {
      primary: "rgb(219 39 119)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(252 231 243)",
      accentFg: "rgb(157 23 77)",
    },
    dark: {
      primary: "rgb(244 114 182)",
      foreground: "rgb(40 8 22)",
      accent: "rgb(62 20 42)",
      accentFg: "rgb(251 207 232)",
    },
  },
  rose: {
    label: "Rose",
    preview: "#E11D48",
    light: {
      primary: "rgb(225 29 72)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(255 228 230)",
      accentFg: "rgb(159 18 57)",
    },
    dark: {
      primary: "rgb(251 113 133)",
      foreground: "rgb(40 8 18)",
      accent: "rgb(58 20 30)",
      accentFg: "rgb(253 164 175)",
    },
  },
  slate: {
    label: "Slate",
    preview: "#475569",
    light: {
      primary: "rgb(71 85 105)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(241 245 249)",
      accentFg: "rgb(30 41 59)",
    },
    dark: {
      primary: "rgb(148 163 184)",
      foreground: "rgb(15 23 42)",
      accent: "rgb(30 41 59)",
      accentFg: "rgb(226 232 240)",
    },
  },
  gray: {
    label: "Gray",
    preview: "#4B5563",
    light: {
      primary: "rgb(75 85 99)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(243 244 246)",
      accentFg: "rgb(31 41 55)",
    },
    dark: {
      primary: "rgb(156 163 175)",
      foreground: "rgb(17 24 39)",
      accent: "rgb(31 41 55)",
      accentFg: "rgb(229 231 235)",
    },
  },
  neutral: {
    label: "Neutral",
    preview: "#525252",
    light: {
      primary: "rgb(82 82 82)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(245 245 245)",
      accentFg: "rgb(38 38 38)",
    },
    dark: {
      primary: "rgb(163 163 163)",
      foreground: "rgb(23 23 23)",
      accent: "rgb(38 38 38)",
      accentFg: "rgb(229 229 229)",
    },
  },
  stone: {
    label: "Stone",
    preview: "#57534E",
    light: {
      primary: "rgb(87 83 78)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(245 245 244)",
      accentFg: "rgb(41 37 36)",
    },
    dark: {
      primary: "rgb(168 162 158)",
      foreground: "rgb(28 25 23)",
      accent: "rgb(41 37 36)",
      accentFg: "rgb(231 229 228)",
    },
  },
  taupe: {
    label: "Taupe",
    preview: "#6F6259",
    light: {
      primary: "rgb(111 98 89)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(242 238 235)",
      accentFg: "rgb(69 60 54)",
    },
    dark: {
      primary: "rgb(179 161 150)",
      foreground: "rgb(36 31 27)",
      accent: "rgb(45 40 36)",
      accentFg: "rgb(222 211 203)",
    },
  },
  mauve: {
    label: "Mauve",
    preview: "#7A6A7D",
    light: {
      primary: "rgb(122 106 125)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(243 238 244)",
      accentFg: "rgb(76 65 80)",
    },
    dark: {
      primary: "rgb(185 166 189)",
      foreground: "rgb(36 30 39)",
      accent: "rgb(43 36 46)",
      accentFg: "rgb(220 207 224)",
    },
  },
  mist: {
    label: "Mist",
    preview: "#64798A",
    light: {
      primary: "rgb(100 121 138)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(237 242 245)",
      accentFg: "rgb(61 75 87)",
    },
    dark: {
      primary: "rgb(168 188 201)",
      foreground: "rgb(23 32 40)",
      accent: "rgb(33 44 52)",
      accentFg: "rgb(203 219 228)",
    },
  },
  olive: {
    label: "Olive",
    preview: "#6B7250",
    light: {
      primary: "rgb(107 114 80)",
      foreground: "rgb(255 255 255)",
      accent: "rgb(240 242 232)",
      accentFg: "rgb(67 72 48)",
    },
    dark: {
      primary: "rgb(175 182 140)",
      foreground: "rgb(29 32 19)",
      accent: "rgb(39 43 28)",
      accentFg: "rgb(220 224 198)",
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
