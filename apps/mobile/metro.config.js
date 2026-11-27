const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { defineExpoMetroConfig } = require("@vvedantb/config");

const projectRoot = __dirname;

const SINGLETONS = [
  "convex",
  "react",
  "react-dom",
  "react-native-gesture-handler",
  "react-native-keyboard-controller",
];

module.exports = defineExpoMetroConfig({
  projectRoot,
  getDefaultConfig,
  withNativeWind,
  input: path.join(projectRoot, "global.css"),
  nativeWindConfig: path.join(projectRoot, "tailwind.config.js"),
  inlineRem: 16,
  singletons: SINGLETONS,
});
