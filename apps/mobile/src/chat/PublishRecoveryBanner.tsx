import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  forcePushConfirmTitle,
  forcePushOfferKey,
  linkedForcePushTargets,
  linkedRepoForcePushLabel,
  linkedRepoRecoveryText,
  needsPublishRecovery,
  publishRecoveryMessage,
  PUBLISH_RECOVERY_COPY,
  type ForcePushTarget,
} from "@eva/shared/publishRecovery";
import { IconUpload } from "@tabler/icons-react-native";
import { Badge, Button, ConfirmDialog } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

/**
 * The web `PublishRecoveryBanner` above a session chat's composer: the newest
 * message is the refusal to publish a branch whose history was rewritten, so
 * one button force-pushes it (after the web's confirm). The force-push posts
 * its own outcome alert, which becomes the newest message and removes the
 * banner. A multi-repo session adds a row per published linked repo.
 */
export function PublishRecoveryBanner({
  sessionId,
  newest,
  isSandboxActive,
}: {
  sessionId: Id<"sessions">;
  newest: { _id: string; isSystemAlert?: boolean; errorDetail?: string } | undefined;
  isSandboxActive: boolean;
}) {
  const theme = EVA_THEME[useScheme()];
  const [confirmTarget, setConfirmTarget] = useState<ForcePushTarget | null>(null);
  const [requestedOffers, setRequestedOffers] = useState<readonly string[]>([]);
  const forcePushBranch = useMutation(api.sessions.forcePushBranch);
  const visible = needsPublishRecovery(newest);
  const repos = useQuery(api.sessions.listRepos, visible ? { sessionId } : "skip");
  if (!visible || !newest) return null;

  const isRequested = (target: ForcePushTarget) => requestedOffers.includes(forcePushOfferKey(newest._id, target));
  const requested = isRequested({});

  const handleConfirm = (target: ForcePushTarget) => {
    setConfirmTarget(null);
    const key = forcePushOfferKey(newest._id, target);
    if (requestedOffers.includes(key)) return;
    setRequestedOffers((keys) => [...keys, key]);
    forcePushBranch({ sessionId, ...(target.sessionRepoId !== undefined ? { sessionRepoId: target.sessionRepoId } : {}) }).catch(() => {
      toast.error(PUBLISH_RECOVERY_COPY.failed);
      setRequestedOffers((keys) => keys.filter((entry) => entry !== key));
    });
  };

  return (
    <>
      <View className="mx-3 mb-2 gap-2 rounded-2xl border px-3 py-2.5" style={{ backgroundColor: withAlpha(theme.muted, 0.3), borderColor: theme.border }}>
        <Badge variant="destructive" className="self-start" textClassName="text-xs">
          {PUBLISH_RECOVERY_COPY.badge.toUpperCase()}
        </Badge>
        <Text className="font-instrument-sans text-sm" style={{ color: theme.mutedForeground }}>
          {publishRecoveryMessage(requested, isSandboxActive)}
        </Text>
        {requested ? null : (
          <Button
            size="sm"
            variant="destructive"
            fullWidth={false}
            className="self-start"
            disabled={!isSandboxActive}
            leftIcon={<IconUpload size={14} color={theme.destructiveForeground} />}
            onPress={() => setConfirmTarget({})}
          >
            {PUBLISH_RECOVERY_COPY.button}
          </Button>
        )}
      </View>
      {linkedForcePushTargets(repos).map((target) => {
        const linkedRequested = isRequested(target);
        return (
          <View
            key={target.sessionRepoId}
            className="mx-3 mb-2 flex-row items-center gap-2 rounded-2xl px-3 py-1.5"
            style={{ backgroundColor: withAlpha(theme.muted, 0.3) }}
          >
            <Text numberOfLines={1} className="font-instrument-sans min-w-0 flex-1 text-xs" style={{ color: theme.mutedForeground }}>
              {linkedRepoRecoveryText(target.label, linkedRequested)}
            </Text>
            {linkedRequested ? null : (
              <Button
                size="sm"
                variant="ghost"
                fullWidth={false}
                disabled={!isSandboxActive}
                leftIcon={<IconUpload size={14} color={theme.foreground} />}
                onPress={() => setConfirmTarget(target)}
              >
                {linkedRepoForcePushLabel(target.label)}
              </Button>
            )}
          </View>
        );
      })}
      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmTarget(null);
        }}
        title={forcePushConfirmTitle(confirmTarget?.label)}
        description={PUBLISH_RECOVERY_COPY.confirmBody}
        confirmLabel={PUBLISH_RECOVERY_COPY.confirm}
        variant="destructive"
        onConfirm={() => {
          if (confirmTarget !== null) handleConfirm(confirmTarget);
        }}
      />
    </>
  );
}
