import { EVA_THEME } from "@eva/shared/evaTheme";
import { configureTheme } from "@vvedantb/native-ui/theme";
import { EVA_FONT } from "./fonts";

const { light, dark } = EVA_THEME;
const pair = (key: keyof typeof light) => ({ light: light[key], dark: dark[key] });

/**
 * Paints native-ui with Eva's web theme (`@eva/shared/evaTheme`, from
 * apps/web/src/globals.css), using the key map in the native-ui README, and
 * Eva's font (Inter, `./fonts`). Call once before the first render. global.css
 * carries the same colours for classes; tailwind.config.js the same font.
 */
export function applyEvaTheme() {
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
      // The web `.tabs-segmented` active pill: card in light, secondary in dark,
      // under the foreground label.
      segment: { light: light.card, dark: dark.secondary },
      segmentForeground: pair("foreground"),
    },
  });
}
