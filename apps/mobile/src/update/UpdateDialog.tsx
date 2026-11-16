import { ConfirmDialog } from "@vvedantb/native-ui/primitives";
import { Linking } from "react-native";
import { closeUpdatePrompt, dismissUpdate, useAvailableUpdate } from "@/update/updateCheck";

/**
 * "Update available" once at start when a newer APK is out (`checkForUpdate`).
 * Download opens the APK in the browser, which downloads it for install;
 * Later (and Android back, which `ConfirmDialog` routes to `onCancel`) hides
 * this version until a newer one comes out.
 */
export function UpdateDialog() {
  const update = useAvailableUpdate();
  return (
    <ConfirmDialog
      open={update !== null}
      title="Update available"
      description={update ? `Eva ${update.version} is ready. Install it to keep the app working with the latest Eva.` : undefined}
      cancelLabel="Later"
      confirmLabel="Download"
      onCancel={dismissUpdate}
      onConfirm={() => {
        if (update) void Linking.openURL(update.url);
        closeUpdatePrompt();
      }}
    />
  );
}
