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

// The web turn checkpoint actions (`useTurnCheckpointActions`): Diff this
// turn and Restore to before this turn, for a session reply that changed code,
// from its Changes chip and from the message's hold menu.

/** What the turn actions act on: the reply, its session, its repo and its checkpoints. */
export type TurnChangesTarget = {
  checkpoint: TurnCheckpoint;
  messageId: string;
  sessionId: Id<"sessions">;
  repoId: Id<"githubRepos">;
  /** The chat's route target, so the diff screen's Back returns here. */
  target: string;
  sandboxRunning: boolean;
};

/**
 * The restore confirm, with the web copy (`sandbox.revertSessionToTurn`: a
 * new commit, nothing rewritten). `request` opens it for one reply; a restore
 * the server refuses says why ("Start the sandbox first", ...). Render
 * `dialog` once.
 */
export function useTurnRestore() {
  const revert = useAction(api.sandbox.revertSessionToTurn);
  const [pending, setPending] = useState<{ sessionId: Id<"sessions">; messageId: string } | null>(null);
  const restore = () => {
    if (!pending) return;
    revert(pending).then(
      (result) => {
        if (result.status === "restored") toast.success(turnRestoredLabel(result.pushed), { id: "turn-restore" });
        else toast.info(TURN_RESTORE_BLOCKED_REASON[result.status], { id: "turn-restore" });
      },
      () => toast.error(TURN_RESTORE_FAILED, { id: "turn-restore" }),
    );
  };
  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      title={TURN_RESTORE_COPY.title}
      description={`${TURN_RESTORE_COPY.description} ${TURN_RESTORE_COPY.body}`}
      confirmLabel={TURN_RESTORE_COPY.confirmLabel}
      variant="destructive"
      onConfirm={restore}
    />
  );
  return { request: (target: { sessionId: Id<"sessions">; messageId: string }) => setPending(target), dialog };
}

/**
 * The web turn checkpoint actions as sheet rows: Diff this turn (the turn
 * diff screen) and Restore to before this turn, which needs a running
 * sandbox. `close` shuts the sheet first; `onRestore` opens the confirm.
 */
export function TurnChangesRows({ turn, close, onRestore }: { turn: TurnChangesTarget; close: () => void; onRestore: () => void }) {
  const router = useRouter();
  return (
    <>
      <SheetRow
        icon={IconGitCompare}
        title={DIFF_TURN_LABEL}
        onPress={() => {
          close();
          router.push({
            pathname: "/chat/[target]/turn-diff",
            params: { target: turn.target, repoId: turn.repoId, base: turn.checkpoint.beforeSha, head: turn.checkpoint.afterSha },
          });
        }}
      />
      <SheetRow
        icon={IconArrowBackUp}
        title={restoreTurnLabel(turn.sandboxRunning)}
        disabled={!turn.sandboxRunning}
        onPress={() => {
          close();
          onRestore();
        }}
      />
    </>
  );
}

/**
 * A session reply that changed code: one chip under it (user choice; the hold
 * menu has the same rows), opening a sheet with Diff this turn and Restore.
 */
export function TurnChangesChip({ turn }: { turn: TurnChangesTarget }) {
  const theme = EVA_THEME[useScheme()];
  const [open, setOpen] = useState(false);
  const restore = useTurnRestore();

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
        <TurnChangesRows turn={turn} close={() => setOpen(false)} onRestore={() => restore.request(turn)} />
      </MenuSheet>
      {restore.dialog}
    </>
  );
}
