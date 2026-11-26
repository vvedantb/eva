import { EVA_THEME } from "@eva/shared/evaTheme";
import { configureTheme, tokens, withAlpha } from "@vvedantb/native-ui/theme";
import { vars } from "nativewind";
import { EVA_FONT } from "./fonts";

/**
 * Paints native-ui with Eva's web theme (`@eva/shared/evaTheme`, from
 * apps/web/src/globals.css), using the key map in the native-ui README, and
 * Eva's font (Inter, `./fonts`). The kit has a light and a dark slot; the
 * dark slot holds `darkFamily`, Dark or Neutral. Call it before the first
 * render; a later call (a Neutral pick) redraws the kit parts. global.css
 * carries the same colours for classes (`NEUTRAL_CLASS_VARS` for Neutral);
 * tailwind.config.js the same font.
 */
export function applyEvaTheme(darkFamily: "dark" | "neutral" = "dark") {
  const light = EVA_THEME.light;
  const dark = EVA_THEME[darkFamily];
  const pair = (key: keyof typeof light) => ({ light: light[key], dark: dark[key] });
  configureTheme({
    font: EVA_FONT,
    color: {
      background: pair("background"),
      foreground: pair("foreground"),
      muted: pair("mutedForeground"),
      border: pair("border"),
      separator: pair("border"),
      surface: pair("card"),
      surfaceCard: pair("card"),
      // As the web's `compat-shadcn-rgb.css`: `surface-secondary` is `--muted`,
      // `surface-tertiary` and `default-foreground` are `--secondary`'s.
      surfaceSecondary: pair("muted"),
      // Phone-only glass chrome (tab bar, header buttons): in dark, Eva's card
      // at the package's 88% and Eva's border. Light keeps the package glass.
      fill: { light: tokens.color.fill.light, dark: withAlpha(dark.card, 0.88) },
      hairline: { light: tokens.color.hairline.light, dark: dark.border },
    },
    palette: {
      primary: pair("primary"),
      primaryForeground: pair("primaryForeground"),
      danger: pair("destructive"),
      dangerForeground: pair("destructiveForeground"),
      success: pair("success"),
      warning: pair("warning"),
      default: pair("secondary"),
      defaultForeground: pair("secondaryForeground"),
      surfaceTertiary: pair("secondary"),
      overlay: pair("popover"),
      overlayForeground: pair("popoverForeground"),
      fieldPlaceholder: pair("mutedForeground"),
      // The web `.tabs-segmented` active pill (`--segment-active`), under the
      // foreground label.
      segment: pair("segmentActive"),
      segmentForeground: pair("foreground"),
      // The bottom tab bar pill: Eva's secondary in light, so it shows on the
      // near-white glass; the segmented pill in dark.
      tabBarPill: { light: light.secondary, dark: dark.segmentActive },
    },
  });
}

const round = (value: number) => Math.round(value * 10) / 10;

/** `#rrggbb` as the `h s% l%` channels global.css holds, to one decimal. */
function hslChannels(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h =
    d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return `${round(h * 60)} ${round(s * 100)}% ${round(l * 100)}%`;
}

const neutral = EVA_THEME.neutral;

/**
 * The global.css `.dark` variables that Neutral changes (the web
 * `.dark.neutral` block), with the same key map as global.css. The root
 * layout sets them on a view over the app (NativeWind `vars`), so class
 * colours follow a Neutral pick at once.
 */
export const NEUTRAL_CLASS_VARS = vars(
  Object.fromEntries(
    Object.entries({
      background: neutral.background,
      card: neutral.card,
      surface: neutral.card,
      "surface-card": neutral.card,
      field: neutral.card,
      popover: neutral.popover,
      overlay: neutral.popover,
      secondary: neutral.secondary,
      "surface-tertiary": neutral.secondary,
      default: neutral.secondary,
      segment: neutral.secondary,
      muted: neutral.muted,
      "surface-secondary": neutral.muted,
      border: neutral.border,
      separator: neutral.border,
      input: neutral.input,
    }).map(([name, hex]) => [`--${name}`, hslChannels(hex)]),
  ),
);
