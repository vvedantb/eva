"use client";

import { formatForDisplay } from "@tanstack/react-hotkeys";
import {
  Button,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@eva/ui";
import { IconPencil } from "@tabler/icons-react";
import {
  FileViewerToolbarButton,
  VIEWER_ICON_BUTTON_CLASS,
} from "./FileViewerToolbarButton";

/** What the viewer's edit control is, and what it can do right now. */
export type FileViewerEditState =
  | { kind: "unavailable"; reason: string }
  | { kind: "idle"; onEdit: () => void }
  | {
      kind: "editing";
      dirty: boolean;
      saving: boolean;
      onDone: () => void;
      onDiscard: () => void;
      onSave: () => void;
    };

// The editor's keymap has no save command, so the shortcut is ours to teach.
const SAVE_SHORTCUT = formatForDisplay("Mod+S");

/**
 * The right-hand end of the viewer header: Edit, or the Done / Discard + Save
 * pair once a session is open.
 */
export function FileViewerEditControls({
  edit,
}: {
  edit: FileViewerEditState;
}) {
  if (edit.kind === "unavailable") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button swallows pointer events, so the tooltip needs a
              wrapper to hover — otherwise the reason is unreachable. */}
          <span className="shrink-0">
            <Button
              size="sm"
              variant="ghost"
              disabled
              aria-label="Edit file"
              className={VIEWER_ICON_BUTTON_CLASS}
            >
              <IconPencil className="size-3.5" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{edit.reason}</TooltipContent>
      </Tooltip>
    );
  }

  if (edit.kind === "idle") {
    return (
      <FileViewerToolbarButton
        label="Edit file"
        tooltip="Edit"
        onClick={edit.onEdit}
      >
        <IconPencil className="size-3.5" />
      </FileViewerToolbarButton>
    );
  }

  if (!edit.dirty) {
    return (
      <Button size="sm" variant="ghost" onClick={edit.onDone}>
        Done
      </Button>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={edit.saving}
        onClick={edit.onDiscard}
      >
        Discard
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" disabled={edit.saving} onClick={edit.onSave}>
            {edit.saving ? <Spinner size="sm" /> : null}
            Save
          </Button>
        </TooltipTrigger>
        <TooltipContent>Save ({SAVE_SHORTCUT})</TooltipContent>
      </Tooltip>
    </>
  );
}
