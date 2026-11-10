const {
  nativeUiPreset,
  nativeUiContent,
  hslVar,
} = require("@vvedantb/native-ui/tailwind-preset");

/**
 * The shared native-ui preset: darkMode "class", Instrument Sans font classes
 * and the colour keys. Values live in global.css as `h s% l%` channels, so
 * colours use `hslVar`.
 * @type {import("tailwindcss").Config}
 */
module.exports = {
  content: [
    "./app/**/*.{js,ts,tsx}",
    "./src/**/*.{js,ts,tsx}",
    nativeUiContent(),
  ],
  presets: [nativeUiPreset({ color: hslVar })],
  theme: { extend: {} },
  plugins: [],
};
