import { ConfirmDialog } from "@vvedantb/native-ui/primitives";
import * as Clipboard from "expo-clipboard";
import { crashDetails, dismissLastCrash, useLastCrash } from "@/logging/lastCrash";

/**
 * "Eva closed after an error" once at start when the last session ended in a
 * fatal error (`lastCrash.ts`): the message, and Copy for the full details to
 * paste into a chat. The same dialog as `UpdateDialog`.
 */
export function LastCrashDialog() {
  const crash = useLastCrash();
  return (
    <ConfirmDialog
      open={crash !== null}
      title="Eva closed after an error"
      description={crash ? `${crash.name}: ${crash.message}` : undefined}
      cancelLabel="Dismiss"
      confirmLabel="Copy details"
      onCancel={dismissLastCrash}
      onConfirm={() => {
        if (crash) void Clipboard.setStringAsync(crashDetails(crash));
        dismissLastCrash();
      }}
    />
  );
}
