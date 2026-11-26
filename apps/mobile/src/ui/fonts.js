/**
 * Eva's font, Inter (the web `--font-sans`): the family names of the four
 * weights, as `@expo-google-fonts/inter` names them. CommonJS, so
 * tailwind.config.js can `require` it outside Metro. app/_layout.tsx loads the
 * files under these names, and the native-ui preset and `configureTheme` map
 * the `font-instrument-sans*` classes and JS styles to them.
 */
module.exports = {
  EVA_FONT: {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semibold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
  },
};
