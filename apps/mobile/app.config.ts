import { existsSync } from "node:fs";
import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Android-only companion app, sideloaded as an APK (no Play Store). The code
 * is cross-platform; iOS needs a paid Apple developer account for installs and
 * push, so it is off. See README.md.
 *
 * Push needs two things that only the owner can create:
 * - `google-services.json` from a Firebase project (Android push runs on FCM).
 * - `EAS_PROJECT_ID` from `eas init` (Expo push tokens are per Expo project).
 * Without them the app builds and works; it just does not register for push.
 */
const DEFAULT_VERSION_NAME = "0.1.0";
const DEFAULT_VERSION_CODE = 1;
const GOOGLE_SERVICES_FILE = "./google-services.json";

function versionCode(): number {
  const raw = process.env["VERSION_CODE"];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_VERSION_CODE;
}

export default (_context: ConfigContext): ExpoConfig => ({
  name: "Eva",
  slug: "eva-mobile",
  version: process.env["VERSION_NAME"] || DEFAULT_VERSION_NAME,
  orientation: "portrait",
  scheme: "eva",
  // The web app icon, so both apps share one file.
  icon: "../web/public/icon.png",
  userInterfaceStyle: "automatic",
  platforms: ["android"],
  android: {
    package: "com.vis1.eva",
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
    "./plugins/withReleaseSigning.js",
  ],
  experiments: {
    typedRoutes: false,
    reactCompiler: true,
  },
});
