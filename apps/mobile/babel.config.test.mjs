// Regression guard for the Android release bundle. `nativewind/babel` (via
// react-native-css-interop) names `@babel/plugin-transform-react-jsx` as a
// string, and Babel resolves it from apps/mobile. Under pnpm isolation that
// link was missing, so `:app:createBundleReleaseJsAndAssets` failed with
// "Cannot find module" only after a long Gradle build. Loading the config
// here resolves every preset and every plugin they name, so a missing link
// fails in seconds instead.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const mobileDir = path.dirname(fileURLToPath(import.meta.url));
// Resolve @babel/core the way Metro does: from apps/mobile, not the repo root.
const babel = createRequire(path.join(mobileDir, "package.json"))("@babel/core");

test("babel config resolves every preset and plugin for an Android release bundle", () => {
  const options = babel.loadOptions({
    cwd: mobileDir,
    root: mobileDir,
    envName: "production",
    filename: path.join(mobileDir, "app/_layout.tsx"),
    caller: {
      name: "metro",
      bundler: "metro",
      platform: "android",
      isDev: false,
      isServer: false,
    },
  });

  assert.ok(options, "babel.config.js was ignored for app/_layout.tsx");
  assert.ok(options.plugins.length > 0, "presets resolved to no plugins");
});
