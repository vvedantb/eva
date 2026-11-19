const {
  nativeUiPreset,
  nativeUiContent,
  hslVar,
} = require("@vvedantb/native-ui/tailwind-preset");
const { EVA_FONT } = require("./src/ui/fonts");

/**
 * The shared native-ui preset: darkMode "class", the font classes (Inter,
 * from src/ui/fonts.js) and the colour keys. Values live in global.css as `h s% l%` channels, so
 * colours use `hslVar`.
 * @type {import("tailwindcss").Config}
 */
module.exports = {
  content: [
    "./app/**/*.{js,ts,tsx}",
    "./src/**/*.{js,ts,tsx}",
    nativeUiContent(),
  ],
  presets: [nativeUiPreset({ color: hslVar, font: EVA_FONT })],
  theme: { extend: {} },
  plugins: [],
};
