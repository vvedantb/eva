import { EVA_THEME } from "@eva/shared/evaTheme";
import { configureTheme } from "@vvedantb/native-ui/theme";

const { light, dark } = EVA_THEME;
const pair = (key: keyof typeof light) => ({ light: light[key], dark: dark[key] });

/**
 * Paints native-ui with Eva's web theme (`@eva/shared/evaTheme`, from
 * apps/web/src/globals.css), using the key map in the native-ui README. Call
 * once before the first render. global.css carries the same values for classes.
 */
export function applyEvaTheme() {
  configureTheme({
    color: {
      background: pair("background"),
      foreground: pair("foreground"),
      muted: pair("mutedForeground"),
      border: pair("border"),
      separator: pair("border"),
      surface: pair("card"),
      surfaceCard: pair("card"),
      surfaceSecondary: pair("secondary"),
    },
    palette: {
      primary: pair("primary"),
      primaryForeground: pair("primaryForeground"),
      danger: pair("destructive"),
      dangerForeground: pair("destructiveForeground"),
      success: pair("success"),
      warning: pair("warning"),
      default: pair("secondary"),
      defaultForeground: pair("foreground"),
      overlay: pair("popover"),
      overlayForeground: pair("popoverForeground"),
      fieldPlaceholder: pair("mutedForeground"),
    },
  });
}
