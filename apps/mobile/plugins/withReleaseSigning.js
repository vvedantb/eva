// Expo config plugin: signs `assembleRelease` with the Eva sideload key.
//
// A thin wrapper over `@vvedantb/config`'s `withReleaseSigning`. The defaults
// match Eva: the four ANDROID_* environment keys and keystore.properties in the
// repository root (`../../../keystore.properties`). A release task stops when a
// value is missing, so a release never falls back to the debug key. Debug
// builds (`expo run:android`) need none of them.
//
// `marker` keeps Eva's own marker line because scripts/build-android-release.sh
// greps android/app/build.gradle for this exact substring.
const { withReleaseSigning } = require("@vvedantb/config");

const MARKER = "// Added by apps/mobile/plugins/withReleaseSigning.js";

/** @param {import("expo/config").ExpoConfig} config */
module.exports = function withEvaReleaseSigning(config) {
  return withReleaseSigning(config, { marker: MARKER });
};
