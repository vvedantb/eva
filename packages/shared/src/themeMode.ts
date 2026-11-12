/**
 * The appearance modes, as the web Settings > Appearance and `users.theme`
 * (`themeValidator`). Every mode is saved, System included: it is a
 * preference ("follow the OS"), not a resolved look.
 */
export type ThemeMode = "light" | "dark" | "neutral" | "system";

/** The look a mode paints. Neutral is dark-family: the web sets `class="dark neutral"`. */
export type ThemeAppearance = "light" | "dark" | "neutral";

export function isThemeMode(value: string): value is ThemeMode {
  return (
    value === "light" ||
    value === "dark" ||
    value === "neutral" ||
    value === "system"
  );
}

/** The look for `mode`: System follows the OS, which is only ever light or dark. */
export function themeAppearance(
  mode: ThemeMode,
  system: "light" | "dark",
): ThemeAppearance {
  return mode === "system" ? system : mode;
}
