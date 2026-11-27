import { api, getAIModelProvider, normalizeAIModel, type Id } from "@eva/backend";
import type { PickerAccount } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  resolveCredentialSourceLabel,
  USAGE_LIMIT_RETRY_FAILED,
  USAGE_LIMIT_RETRY_HINT,
  USAGE_LIMIT_WAKE_HINT,
  usageLimitHeadroom,
  usageLimitNoAccountCopy,
  usageLimitRecoverySubtitle,
  usageLimitRecoveryTitle,
  usageLimitRetryCandidates,
  type UsageLimitRetryCandidate,
} from "@eva/shared/usageLimitRecovery";
import type { UsageAccountEntry } from "@eva/shared/usageLimits";
import { IconAlertTriangle, IconArrowRight, IconUsers } from "@tabler/icons-react-native";
import { providerLabel } from "@vvedantb/native-ui/brand";
import { Spinner } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { UsageBar, useToneColor } from "@/chat/UsageSheet";
import type { Chat } from "@/chat/useChatModelPick";
import { useNow } from "@/ui/clock";
import { useScheme } from "@/ui/theme";

type AccountId = Id<"userProviderAccounts">;

/**
 * The web `UsageLimitRecoveryBanner` above the composer: the newest reply
 * failed on the provider's usage limit, so each other account of that
 * provider is a row with its headroom, and a tap switches the chat to it and
 * retries the failed turn there (`sessionWorkflow.retryLastTurnWithAccount`).
 * The screen mounts it only while that failed reply is the newest message, so
 * the retry's new reply removes it. It shows only to whoever may change the
 * chat's account (the model chip's account rows), as the web.
 */
export function UsageLimitRecoveryCard({
  chat,
  failure,
  accounts,
  switchAccount,
  working,
}: {
  chat: Chat;
  failure: string;
  accounts: readonly PickerAccount[];
  switchAccount: (providerAccountId: AccountId | null) => Promise<void>;
  working: boolean;
}) {
  const theme = EVA_THEME[useScheme()];
  const [inFlightKey, setInFlightKey] = useState<string | null>(null);
  const retryLastTurn = useMutation(api.sessionWorkflow.retryLastTurnWithAccount);
  const now = useNow(60_000);
  const entries = useQuery(api.usageLimits.getForViewer, { repoId: chat.repoId, now });

  const provider = getAIModelProvider(normalizeAIModel(chat.model));
  const label = providerLabel(provider);
  const currentAccountId = chat.providerAccountId ?? null;
  const candidates = usageLimitRetryCandidates({ accounts, provider, currentAccountId });
  const chatId = chat.session?.chatId ?? chat.task?.sessionChatId ?? chat.project?.sessionChatId;

  const retry = (candidate: UsageLimitRetryCandidate<AccountId>) => {
    if (!chatId) return;
    setInFlightKey(candidate.key);
    switchAccount(candidate.accountId)
      .then(() => retryLastTurn({ chatId, providerAccountId: candidate.accountId }))
      .catch(() => toast.error(USAGE_LIMIT_RETRY_FAILED))
      .then(() => setInFlightKey(null));
  };

  return (
    <View className="mx-3 mb-2 gap-3 rounded-2xl p-3" style={{ backgroundColor: theme.muted }}>
      <View className="flex-row items-start gap-2.5">
        <View className="mt-0.5">
          <IconAlertTriangle size={18} color={theme.destructive} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-instrument-sans-medium text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
            {usageLimitRecoveryTitle(resolveCredentialSourceLabel(currentAccountId, accounts), label)}
          </Text>
          <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
            {usageLimitRecoverySubtitle(failure, now)}
          </Text>
        </View>
      </View>
      {candidates.length === 0 ? (
        <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
          {usageLimitNoAccountCopy(label)}
        </Text>
      ) : (
        <View className="gap-1">
          <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
            {USAGE_LIMIT_RETRY_HINT}
          </Text>
          {candidates.map((candidate) => (
            <AccountRow
              key={candidate.key}
              candidate={candidate}
              entry={entries?.find((entry) => entry.providerAccountId === (candidate.accountId ?? undefined))}
              now={now}
              disabled={!chat.sandboxActive || working || inFlightKey !== null || !chatId}
              inFlight={inFlightKey === candidate.key}
              onPress={() => retry(candidate)}
            />
          ))}
          {chat.sandboxActive ? null : (
            <Text className="font-instrument-sans px-3 pt-0.5 text-xs" style={{ color: theme.mutedForeground }}>
              {USAGE_LIMIT_WAKE_HINT}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function AccountRow({
  candidate,
  entry,
  now,
  disabled,
  inFlight,
  onPress,
}: {
  candidate: UsageLimitRetryCandidate<AccountId>;
  entry: UsageAccountEntry | undefined;
  now: number;
  disabled: boolean;
  inFlight: boolean;
  onPress: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const toneColor = useToneColor();
  const isTeam = candidate.accountId === null;
  const { name, ownership, utilization, usedLabel, tone, resetsLabel } = usageLimitHeadroom(candidate, entry, now);
  const colors = toneColor(tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Retry on ${name}`}
      accessibilityHint={usedLabel}
      accessibilityState={{ disabled, busy: inFlight }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-2"
      style={({ pressed }) => ({ backgroundColor: theme.card, opacity: disabled && !inFlight ? 0.6 : pressed ? 0.8 : 1 })}
    >
      <View className="size-7 items-center justify-center rounded-full" style={{ backgroundColor: theme.secondary }}>
        {isTeam ? (
          <IconUsers size={14} color={theme.secondaryForeground} />
        ) : (
          <Text className="font-instrument-sans-medium text-xs" style={{ color: theme.secondaryForeground, fontWeight: "500" }}>
            {name.slice(0, 1).toUpperCase()}
          </Text>
        )}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="font-instrument-sans-medium text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
          {name}
          {ownership ? (
            <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground, fontWeight: "400" }}>
              {ownership}
            </Text>
          ) : null}
        </Text>
        {utilization === undefined ? (
          <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
            {usedLabel}
          </Text>
        ) : (
          <View className="flex-row items-center gap-1.5">
            <View className="w-16">
              <UsageBar ratio={utilization / 100} color={colors.fill} />
            </View>
            <Text className="font-instrument-sans text-xs" style={{ color: colors.text, fontVariant: ["tabular-nums"] }}>
              {usedLabel}
            </Text>
            {resetsLabel === undefined ? null : (
              <Text numberOfLines={1} className="font-instrument-sans min-w-0 flex-1 text-xs" style={{ color: theme.mutedForeground }}>
                {`· ${resetsLabel}`}
              </Text>
            )}
          </View>
        )}
      </View>
      {inFlight ? (
        <View className="flex-row items-center gap-1">
          <Spinner size="sm" decorative />
          <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
            Switching…
          </Text>
        </View>
      ) : (
        <View className="flex-row items-center gap-1">
          <Text className="font-instrument-sans-medium text-xs" style={{ color: theme.primary, fontWeight: "500" }}>
            Retry here
          </Text>
          <IconArrowRight size={14} color={theme.primary} />
        </View>
      )}
    </Pressable>
  );
}
