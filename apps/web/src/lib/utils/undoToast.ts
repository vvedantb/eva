import { toast } from "@vvedantb/ui";

interface UndoEntry {
  onUndo: () => void;
  allowInEditable: boolean;
}

const entries = new Map<string | number, UndoEntry>();

interface UndoToastOptions {
  id?: string;
  description?: string;
  allowInEditable?: boolean;
}

/**
 * Success toast with an Undo button. Ctrl/Cmd+Z runs the same undo while the
 * toast is on screen (see `undoLatestToast`), so the button and the shortcut
 * never drift apart.
 */
export function undoToast(
  message: string,
  onUndo: () => void,
  { id, description, allowInEditable = false }: UndoToastOptions = {},
): void {
  const toastId = toast.success(message, {
    id,
    description,
    onDismiss: (t) => entries.delete(t.id),
    onAutoClose: (t) => entries.delete(t.id),
    action: {
      label: "Undo",
      onClick: () => {
        if (id !== undefined) entries.delete(id);
        onUndo();
      },
    },
  });
  entries.delete(toastId);
  entries.set(toastId, { onUndo, allowInEditable });
}

/**
 * Runs the newest visible Undo. Returns false when there is nothing to undo
 * (or the focus is in a text field that owns Ctrl+Z), so the caller leaves the
 * key press alone.
 */
export function undoLatestToast(inEditable: boolean): boolean {
  const latest = [...entries].at(-1);
  if (!latest) return false;
  const [toastId, entry] = latest;
  if (inEditable && !entry.allowInEditable) return false;
  entries.delete(toastId);
  toast.dismiss(toastId);
  entry.onUndo();
  return true;
}
