import { api, type Id } from "@eva/backend";
import { sessionMenuActions, type SessionMenuAction } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconArchive,
  IconArchiveOff,
  IconClipboard,
  IconExternalLink,
  IconGitBranch,
  IconLink,
  IconLinkOff,
  IconPencil,
  IconSparkles,
  type IconProps,
} from "@tabler/icons-react-native";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SheetRow,
} from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction, useMutation } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { Fragment, useRef, useState, type ComponentType } from "react";
import { Linking, Text, type TextInput } from "react-native";
import { useSimpleView } from "@/chat/ComposerFooter";
import { WEB_URL } from "@/config";
import { MenuDivider, MenuSheet } from "@/ui/MenuSheet";
import { useScheme } from "@/ui/theme";

/** The session a menu acts on: a Sessions row or the open chat's session. */
export type SessionActionTarget = {
  sessionId: Id<"sessions">;
  title: string;
  archived: boolean;
  /** The session's web page, for Copy link. */
  webPath: string;
  branchName?: string;
  prUrl?: string;
  /** A row in a linked-session group: its menu has Remove from group. */
  inGroup?: boolean;
};

/** A linked-session group, for its Rename group menu. */
export type SessionGroupTarget = {
  /** Any member: `sessions.renameGroup` finds the group from it (the web passes the oldest). */
  sessionId: Id<"sessions">;
  /** The user-set name, when the group has one. */
  name?: string;
  /** What the list shows: the name, or the oldest member's title. */
  label: string;
};

/** What the Rename dialog renames: a session's title or a group's name. */
type RenameTarget = { kind: "session"; session: SessionActionTarget } | { kind: "group"; group: SessionGroupTarget };

/** The web `SessionMenuItems` label and icon of each action; Archive is its `text-warning` item. */
export const SESSION_ACTION_ITEMS: Record<
  SessionMenuAction,
  { label: string; icon: ComponentType<IconProps>; warning?: boolean }
> = {
  rename: { label: "Rename", icon: IconPencil },
  regenerateTitle: { label: "Regenerate title", icon: IconSparkles },
  copyTitle: { label: "Copy title", icon: IconClipboard },
  copyLink: { label: "Copy link", icon: IconLink },
  copyBranchName: { label: "Copy branch name", icon: IconGitBranch },
  openPr: { label: "Open PR", icon: IconExternalLink },
  removeFromGroup: { label: "Remove from group", icon: IconLinkOff },
  unarchive: { label: "Unarchive", icon: IconArchiveOff },
  archive: { label: "Archive", icon: IconArchive, warning: true },
};

/**
 * The web session menu on the phone: `openSheet` shows the row menu as a
 * bottom sheet (a long press stands in for the web right-click), `run` starts
 * one action, `openGroupSheet` shows a linked group's header menu (Rename
 * group), and `dialogs` holds the sheets and the web Rename and Archive
 * dialogs, so render it once. Writes are the web mutations; Archive is
 * `mobile.archiveSession`, the web stop-then-archive in one call.
 */
export function useSessionActions({ onArchived }: { onArchived?: () => void } = {}) {
  const updateSession = useMutation(api.sessions.update);
  const archiveSession = useMutation(api.chats.archive);
  const unarchiveSession = useMutation(api.sessions.unarchive);
  const removeFromGroup = useMutation(api.sessions.removeFromGroup);
  const renameGroup = useMutation(api.sessions.renameGroup);
  const regenerateTitle = useAction(api.textGen.regenerateSessionTitle);
  const simpleView = useSimpleView();
  const scheme = useScheme();
  const [sheetTarget, setSheetTarget] = useState<SessionActionTarget | null>(null);
  const [groupSheetTarget, setGroupSheetTarget] = useState<SessionGroupTarget | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<SessionActionTarget | null>(null);
  // The Rename field, focused once its dialog is on screen (`onShow`): focus is imperative.
  const renameInput = useRef<TextInput>(null);

  /** The actions for one session, in the web order and groups (`sessionMenuActions`). */
  const actionsFor = (target: SessionActionTarget) => sessionMenuActions({ ...target, simpleView });

  const openGroupRename = (group: SessionGroupTarget) => {
    // A blank name clears it, so the group shows its oldest session's title again.
    setRenameValue(group.name ?? "");
    setRenameTarget({ kind: "group", group });
  };

  const unarchive = (sessionId: Id<"sessions">) => {
    unarchiveSession({ id: sessionId }).then(
      () => toast.success("Session restored", { id: "session-unarchive" }),
      () => toast.error("Couldn't restore session", { id: "session-unarchive" }),
    );
  };

  const run = (action: SessionMenuAction, target: SessionActionTarget) => {
    switch (action) {
      case "rename":
        setRenameValue(target.title);
        setRenameTarget({ kind: "session", session: target });
        return;
      case "regenerateTitle":
        regenerateTitle({ sessionId: target.sessionId }).then(
          () => toast.success("Title updated", { id: "session-regenerate-title" }),
          () => toast.error("Couldn't regenerate title", { id: "session-regenerate-title" }),
        );
        return;
      case "copyTitle":
        void Clipboard.setStringAsync(target.title);
        return;
      case "copyLink":
        void Clipboard.setStringAsync(`${WEB_URL}${target.webPath}`);
        return;
      case "copyBranchName":
        if (target.branchName) {
          void Clipboard.setStringAsync(target.branchName).then(() => toast.success("Branch name copied"));
        }
        return;
      case "openPr":
        if (target.prUrl) void Linking.openURL(target.prUrl);
        return;
      case "removeFromGroup":
        removeFromGroup({ sessionId: target.sessionId }).then(
          () => toast.success("Removed from group", { id: "session-group-remove" }),
          () => toast.error("Couldn't remove from group", { id: "session-group-remove" }),
        );
        return;
      case "unarchive":
        unarchive(target.sessionId);
        return;
      case "archive":
        setArchiveTarget(target);
        return;
    }
  };

  /** A session needs a title; a group's blank name is allowed (it clears the name). */
  const canSaveRename = renameTarget?.kind === "group" || renameValue.trim() !== "";

  const saveRename = async () => {
    if (!renameTarget || !canSaveRename || isRenaming) return;
    setIsRenaming(true);
    try {
      if (renameTarget.kind === "session") {
        await updateSession({ id: renameTarget.session.sessionId, title: renameValue.trim() });
        toast.success("Session renamed", { id: "session-rename" });
      } else {
        await renameGroup({ sessionId: renameTarget.group.sessionId, name: renameValue });
        toast.success("Group renamed", { id: "session-group-rename" });
      }
      setRenameTarget(null);
    } catch {
      if (renameTarget.kind === "session") toast.error("Couldn't rename session", { id: "session-rename" });
      else toast.error("Couldn't rename group", { id: "session-group-rename" });
    }
    setIsRenaming(false);
  };

  const archive = async (target: SessionActionTarget) => {
    try {
      await archiveSession({ sessionId: target.sessionId });
    } catch {
      toast.error("Couldn't archive session", { id: "session-archive" });
      return;
    }
    // The web copy: archiving stops a sandbox and closes a PR, so it says so
    // and offers the way back (`unarchive` reopens the PR it closed).
    toast.success("Session archived", {
      id: "session-archive",
      description: "The sandbox was stopped and any open PR closed.",
      action: { label: "Undo", onPress: () => unarchive(target.sessionId) },
    });
    onArchived?.();
  };

  const dialogs = (
    <>
      {/* Up to eight rows: they scroll in a short window, under the title. */}
      <MenuSheet
        open={sheetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setSheetTarget(null);
        }}
        title={sheetTarget?.title ?? ""}
      >
        {sheetTarget
          ? actionsFor(sheetTarget).map((group, index) => (
              <Fragment key={group.join()}>
                {/* A line parts the groups, as the web separators. */}
                {index > 0 ? <MenuDivider /> : null}
                {group.map((action) => {
                  const item = SESSION_ACTION_ITEMS[action];
                  return (
                    <SheetRow
                      key={action}
                      icon={item.icon}
                      title={item.label}
                      warning={item.warning}
                      onPress={() => {
                        setSheetTarget(null);
                        run(action, sheetTarget);
                      }}
                    />
                  );
                })}
              </Fragment>
            ))
          : null}
      </MenuSheet>
      {/* The web linked-group header menu (its right-click): Rename group. */}
      <MenuSheet
        open={groupSheetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setGroupSheetTarget(null);
        }}
        title={groupSheetTarget?.label ?? ""}
      >
        <SheetRow
          icon={IconPencil}
          title="Rename group"
          onPress={() => {
            setGroupSheetTarget(null);
            if (groupSheetTarget) openGroupRename(groupSheetTarget);
          }}
        />
      </MenuSheet>
      {/* The web "Rename session" and "Rename group" dialogs; the kit draws them as a bottom sheet at phone size. */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent onShow={() => renameInput.current?.focus()}>
          <DialogHeader>
            <DialogTitle>{renameTarget?.kind === "group" ? "Rename group" : "Rename session"}</DialogTitle>
          </DialogHeader>
          <Input
            ref={renameInput}
            accessibilityLabel={renameTarget?.kind === "group" ? "Group name" : "Session title"}
            placeholder={renameTarget?.kind === "group" ? "Group name" : undefined}
            value={renameValue}
            onChangeText={setRenameValue}
            onSubmitEditing={() => void saveRename()}
            returnKeyType="done"
            selectTextOnFocus
          />
          <DialogFooter>
            <Button variant="ghost" disabled={isRenaming} onPress={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button disabled={!canSaveRename || isRenaming} onPress={() => void saveRename()}>
              {isRenaming ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title="Archive Session"
        description={
          <>
            This will stop the sandbox and remove{" "}
            <Text
              className="font-instrument-sans-medium"
              style={{ fontWeight: "500", color: EVA_THEME[scheme].foreground }}
            >
              {archiveTarget?.title}
            </Text>{" "}
            from the active list. An open or draft PR will be closed, and reopened if you unarchive.
          </>
        }
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={() => {
          if (archiveTarget) void archive(archiveTarget);
        }}
      />
    </>
  );

  return {
    /** Opens the row menu sheet for one session (the web right-click menu). */
    openSheet: setSheetTarget,
    /** Opens a linked group's header menu (the web right-click on the group). */
    openGroupSheet: setGroupSheetTarget,
    actionsFor,
    run,
    dialogs,
  };
}
