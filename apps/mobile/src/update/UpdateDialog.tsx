import { UpdateChecker } from "@vvedantb/native-ui/primitives";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

/** `app.config.ts`'s `DEFAULT_VERSION_NAME`: a local or preview build, which has no release to compare with. */
const UNRELEASED_VERSION = "0.1.0";
/**
 * V Store knows the newest release, also when this repository is private.
 * Download opens the APK of that release (`apps/mobile/RELEASE.md`).
 */
const RELEASES = {
  packageName: "com.projectvdotuk.eva",
  downloadUrl: (version: string) =>
    `https://github.com/vvedantb/eva/releases/download/eva-apk-${version}/eva-${version}-android.apk`,
};
/** Where Later keeps the version it hid. */
const DISMISSED = { getItem: SecureStore.getItemAsync, setItem: SecureStore.setItemAsync };

/**
 * "Update available" once at start when a newer APK is out. The app is
 * sideloaded from GitHub Releases, with no over-the-air updates, so an old APK
 * keeps calling the backend as it was built. Download opens the APK in the
 * browser, which downloads it for install; "Install from V Store" only opens
 * V Store, and says so when V Store is not installed. Later (and Android back)
 * hides this version until a newer one comes out. Offline, V Store not
 * reachable or a local build: nothing is offered.
 */
export function UpdateDialog() {
  const version = Constants.expoConfig?.version;
  return (
    <UpdateChecker
      appName="Eva"
      currentVersion={version === UNRELEASED_VERSION ? null : version}
      vStore={RELEASES}
      storage={DISMISSED}
      storageKey="eva.updateDismissed"
      description={(update) => `Eva ${update.version} is ready. Install it to keep the app working with the latest Eva.`}
    />
  );
}
