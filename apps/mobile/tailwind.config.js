const {
  nativeUiPreset,
  nativeUiContent,
  hslVar,
} = require("@vvedantb/native-ui/tailwind-preset");
const { EVA_FONT } = require("./src/ui/fonts");

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
