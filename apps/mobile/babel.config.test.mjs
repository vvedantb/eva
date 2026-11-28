import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const mobileDir = path.dirname(fileURLToPath(import.meta.url));
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
