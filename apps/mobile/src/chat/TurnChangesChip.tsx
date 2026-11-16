import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  DIFF_TURN_LABEL,
  restoreTurnLabel,
  TURN_RESTORE_BLOCKED_REASON,
  TURN_RESTORE_COPY,
  TURN_RESTORE_FAILED,
  turnRestoredLabel,
  type TurnCheckpoint,
} from "@eva/shared/turnCheckpoint";
import { IconArrowBackUp, IconGitCompare } from "@tabler/icons-react-native";
import { ConfirmDialog, SheetRow } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { MenuSheet } from "@/ui/MenuSheet";
import { useScheme } from "@/ui/theme";

/**
 * The web turn checkpoint actions (`useTurnCheckpointActions`, in a reply's
 * hover and right-click menus) behind one chip under a session reply that
 * changed code (chose a chip: the reply's footer row is full on a phone). A
 * tap opens a sheet: Diff this turn (the turn diff screen) and Restore to
 * before this turn, which needs a running sandbox and asks first, with the
 * web copy (`sandbox.revertSessionToTurn`: a new commit, nothing rewritten).
 * A restore the server refuses says why ("Start the sandbox first", ...).
 */
export function TurnChangesChip({
  checkpoint,
  messageId,
  sessionId,
  repoId,
  target,
  sandboxRunning,
}: {
  checkpoint: TurnCheckpoint;
  messageId: string;
  sessionId: Id<"sessions">;
  repoId: Id<"githubRepos">;
  /** The chat's route target, so the diff screen's Back returns here. */
  target: string;
  sandboxRunning: boolean;
}) {
  const theme = EVA_THEME[useScheme()];
  const router = useRouter();
  const revert = useAction(api.sandbox.revertSessionToTurn);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const restore = () => {
    revert({ sessionId, messageId }).then(
      (result) => {
        if (result.status === "restored") toast.success(turnRestoredLabel(result.pushed), { id: "turn-restore" });
        else toast.info(TURN_RESTORE_BLOCKED_REASON[result.status], { id: "turn-restore" });
      },
      () => toast.error(TURN_RESTORE_FAILED, { id: "turn-restore" }),
    );
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Changes in this turn"
        accessibilityHint="Opens Diff this turn and Restore to before this turn"
        onPress={() => setOpen(true)}
        // 32 high on screen, slop to a 44 target.
        hitSlop={6}
        className="h-8 flex-row items-center gap-1.5 self-start rounded-full px-3 active:opacity-70"
        style={{ backgroundColor: theme.muted }}
      >
        <IconGitCompare size={14} color={theme.mutedForeground} />
        <Text className="font-instrument-sans-medium text-xs" style={{ color: theme.mutedForeground, fontWeight: "500" }}>
          Changes
        </Text>
      </Pressable>
      <MenuSheet open={open} onOpenChange={setOpen} title="Changes in this turn">
        <SheetRow
          icon={IconGitCompare}
          title={DIFF_TURN_LABEL}
          onPress={() => {
            setOpen(false);
            router.push({
              pathname: "/chat/[target]/turn-diff",
              params: { target, repoId, base: checkpoint.beforeSha, head: checkpoint.afterSha },
            });
          }}
        />
        <SheetRow
          icon={IconArrowBackUp}
          title={restoreTurnLabel(sandboxRunning)}
          disabled={!sandboxRunning}
          onPress={() => {
            setOpen(false);
            setConfirming(true);
          }}
        />
      </MenuSheet>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={TURN_RESTORE_COPY.title}
        description={`${TURN_RESTORE_COPY.description} ${TURN_RESTORE_COPY.body}`}
        confirmLabel={TURN_RESTORE_COPY.confirmLabel}
        variant="destructive"
        onConfirm={restore}
      />
    </>
  );
}
