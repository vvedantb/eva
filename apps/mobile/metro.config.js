const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// The web app and the shared packages resolve React 19.3.0; React Native 0.86
// needs the 19.2.3 this app pins (root package.json scopes the override). A
// workspace package (@eva/shared) or a dependency could find the other copy,
// and two Reacts break hooks. Gesture Handler too: the kit's sheets import it
// as an optional peer, and a second copy (expo-router's drawer pulls in 3.x)
// would have its own handler registry, so its gestures would never fire.
// Keyboard-controller as well: the kit's keyboard parts read the context of
// the app's `KeyboardProvider`, which a second copy would not see.
// Resolve these singletons from this app's folder, wherever the import comes
// from.
const SINGLETONS = new Set(["react", "react-dom", "react-native-gesture-handler", "react-native-keyboard-controller"]);
const appOrigin = path.join(projectRoot, "package.json");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const name = moduleName.split("/")[0];
  if (name !== undefined && SINGLETONS.has(name)) {
    return context.resolveRequest(
      { ...context, originModulePath: appOrigin },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Absolute paths: tools such as knip load this file from the repository root.
module.exports = withNativeWind(config, {
  input: path.join(projectRoot, "global.css"),
  configPath: path.join(projectRoot, "tailwind.config.js"),
  inlineRem: 16,
});
