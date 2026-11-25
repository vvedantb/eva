import { existsSync } from "node:fs";
import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Android-only companion app, sideloaded as an APK (no Play Store). The code
 * is cross-platform; iOS needs a paid Apple developer account for installs and
 * push, so it is off. See README.md.
 *
 * Push needs two things that only the owner can create:
 * - `google-services.json` for `com.projectvdotuk.eva` from the Velth Firebase project (Android push runs on FCM).
 * - `EAS_PROJECT_ID` from `eas init` (Expo push tokens are per Expo project).
 * Without them the app builds and works; it just does not register for push.
 */
const DEFAULT_VERSION_NAME = "0.1.0";
const DEFAULT_VERSION_CODE = 1;
const GOOGLE_SERVICES_FILE = "./google-services.json";

/**
 * Extra R8 keep rules for release builds. RN and Expo modules ship their own
 * consumer rules; these only cover reflection and JNI that those miss.
 * Convex is pure JS and needs no rule.
 */
const PROGUARD_RULES = `
# Hermes and React Native: JNI looks these up by name.
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep @com.facebook.proguard.annotations.DoNotStrip class * { *; }
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod *; }

# Expo modules: the runtime finds modules and their members by reflection.
-keep class expo.modules.** { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }
-keep @expo.modules.core.interfaces.DoNotStrip class * { *; }

# Reanimated and worklets: native code calls into these classes.
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }

# Clerk (@clerk/expo): native SDK classes are loaded through the Expo bridge.
-keep class com.clerk.** { *; }

# Networking: optional TLS providers are not on the classpath.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
`;

function versionCode(): number {
  const raw = process.env["VERSION_CODE"];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_VERSION_CODE;
}

export default (_context: ConfigContext): ExpoConfig => ({
  name: "Eva",
  slug: "eva-mobile",
  // Same Expo account as Velth and the other Project V apps.
  owner: "projectvdotuk",
  version: process.env["VERSION_NAME"] || DEFAULT_VERSION_NAME,
  orientation: "portrait",
  scheme: "eva",
  // The web app icon, so both apps share one file.
  icon: "../web/public/icon.png",
  userInterfaceStyle: "automatic",
  // Web is only for previews and screenshots in the sandbox (no emulator).
  platforms: ["android", "web"],
  web: { output: "single", bundler: "metro" },
  android: {
    package: "com.projectvdotuk.eva",
    versionCode: versionCode(),
    ...(existsSync(GOOGLE_SERVICES_FILE)
      ? { googleServicesFile: GOOGLE_SERVICES_FILE }
      : {}),
  },
  // Sideloaded APKs update by reinstall, not over the air.
  updates: { enabled: false },
  extra: { eas: { projectId: process.env["EAS_PROJECT_ID"] } },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-web-browser",
    "expo-secure-store",
    "expo-notifications",
    // Inline players for the agent's screen recordings (`@vvedantb/native-ui/video`).
    "expo-video",
    [
      "expo-build-properties",
      {
        android: {
          // Survive prebuild even without the release bin's gradle.properties edit.
          buildArchs: ["arm64-v8a"],
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          extraProguardRules: PROGUARD_RULES,
        },
      },
    ],
    "./plugins/withReleaseSigning.js",
  ],
  experiments: {
    typedRoutes: false,
    reactCompiler: true,
  },
});
