import { api, type Doc } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconArrowUpRight, IconCheck, IconCornerDownRight, IconMinus, IconShieldCheck } from "@tabler/icons-react-native";
import { Button, Input } from "@vvedantb/native-ui/primitives";
import { useAction, useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

/** The web `Surface density="tight"` the two pending cards sit on: the card fill, a hairline, radius 12. */
export function CardSurface({ children, testID }: { children: ReactNode; testID?: string }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View testID={testID} className="gap-3 rounded-xl border p-3" style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      {children}
    </View>
  );
}

function AnsweredRow({ icon: Icon, children, onPress }: { icon: typeof IconCheck; children: ReactNode; onPress?: () => void }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  const row = (
    <View className="min-w-0 flex-row items-center gap-1.5">
      <Icon size={14} color={muted} />
      <Text numberOfLines={1} className="font-instrument-sans min-w-0 shrink text-xs" style={{ color: muted }}>
        {children}
      </Text>
    </View>
  );
  if (!onPress) return row;
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} className="active:opacity-70">
      {row}
    </Pressable>
  );
}

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

/**
 * The web `EnvVarRequestCard`: a secret the agent asked for (`request_env_var`).
 * The value lives only in this field and the save call: never logged, toasted
 * or put in the transcript, and the agent hears back only the key and the
 * outcome. Answered, it is one line ("saved to repo env vars", "declined").
 * `onReply` undefined (the chat cannot send now) disables it, as panel buttons.
 */
export function EnvVarRequestCard({
  request,
  onReply,
}: {
  request: Pick<Doc<"envVarRequests">, "_id" | "key" | "reason" | "scope" | "status">;
  onReply?: (message: string) => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const save = useAction(api.envVarRequestsActions.save);
  const decline = useMutation(api.envVarRequests.decline);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (request.status !== "pending") {
    const saved = request.status === "saved";
    return (
      <AnsweredRow icon={saved ? IconCheck : IconMinus}>
        <Text style={{ fontFamily: "monospace" }}>{request.key}</Text>
        {saved ? ` · saved to ${request.scope} env vars` : " · declined"}
      </AnsweredRow>
    );
  }
  const disabled = submitting || onReply === undefined;
  const send = async (answer: () => Promise<{ reply: string }>) => {
    if (disabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const { reply } = await answer();
      setValue("");
      onReply(reply);
    } catch (cause) {
      setError(errorText(cause, "Could not save the value."));
    }
    setSubmitting(false);
  };
  return (
    <CardSurface testID="env-var-request-card">
      <View className="gap-1">
        <Text className="text-sm" style={{ fontFamily: "monospace", fontWeight: "500", color: theme.foreground }}>
          {request.key}
        </Text>
        <Text className="font-instrument-sans text-sm" style={{ color: theme.mutedForeground }}>
          {request.reason}
        </Text>
      </View>
      <Input
        accessibilityLabel={`Value for ${request.key}`}
        placeholder="Paste the value"
        value={value}
        onChangeText={setValue}
        editable={!disabled}
        secureTextEntry
        autoComplete="off"
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        importantForAutofill="no"
        textContentType="none"
        onSubmitEditing={() => {
          if (value.trim()) void send(() => save({ requestId: request._id, value }));
        }}
      />
      {error !== null ? (
        <Text accessibilityRole="alert" className="font-instrument-sans text-xs" style={{ color: theme.destructive }}>
          {error}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-1.5">
        <IconShieldCheck size={14} color={theme.mutedForeground} />
        <Text className="font-instrument-sans min-w-0 flex-1 text-xs" style={{ color: theme.mutedForeground }}>
          Saved encrypted to {request.scope} env vars, never to this chat.
        </Text>
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button loading={submitting} disabled={disabled || value.trim() === ""} onPress={() => void send(() => save({ requestId: request._id, value }))}>
            Save securely
          </Button>
        </View>
        <Button variant="ghost" fullWidth={false} disabled={disabled} onPress={() => void send(() => decline({ requestId: request._id }))}>
          Decline
        </Button>
      </View>
    </CardSurface>
  );
}

/**
 * The web `SessionProposalCard`: a task the agent recommends for its own
 * session (`propose_session`). Nothing runs until a pick: "New session" starts
 * one on the agent's brief and leaves you here; "Do it here" tells the agent
 * to carry on in this chat (it needs the chat able to send). Answered, it is
 * one line; a started one opens its session's chat.
 */
export function SessionProposalCard({
  proposal,
  onReply,
}: {
  proposal: Pick<Doc<"sessionProposals">, "_id" | "title" | "reason" | "status" | "sessionNumId" | "sessionId">;
  onReply?: (message: string) => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const router = useRouter();
  const start = useMutation(api.sessionProposals.start);
  const keepHere = useMutation(api.sessionProposals.keepHere);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (proposal.status !== "pending") {
    const started = proposal.status === "started";
    const sessionId = proposal.sessionId;
    return (
      <AnsweredRow
        icon={started ? IconArrowUpRight : IconCornerDownRight}
        onPress={started && sessionId ? () => router.push({ pathname: "/chat/[target]", params: { target: sessionId } }) : undefined}
      >
        {`${proposal.title} · `}
        {started ? (proposal.sessionNumId !== undefined ? `started in session ${proposal.sessionNumId}` : "started in a new session") : "doing it here"}
      </AnsweredRow>
    );
  }
  const answer = async (choose: () => Promise<void>) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await choose();
    } catch (cause) {
      setError(errorText(cause, "Could not save your choice."));
    }
    setSubmitting(false);
  };
  return (
    <CardSurface testID="session-proposal-card">
      <View className="gap-1">
        <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
          Suggested for a new session
        </Text>
        <Text className="font-instrument-sans-medium text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
          {proposal.title}
        </Text>
        <Text className="font-instrument-sans text-sm" style={{ color: theme.mutedForeground }}>
          {proposal.reason}
        </Text>
      </View>
      {error !== null ? (
        <Text accessibilityRole="alert" className="font-instrument-sans text-xs" style={{ color: theme.destructive }}>
          {error}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            loading={submitting}
            disabled={submitting}
            onPress={() =>
              void answer(async () => {
                await start({ proposalId: proposal._id });
              })
            }
          >
            New session
          </Button>
        </View>
        <View className="flex-1">
          <Button
            variant="ghost"
            disabled={submitting || onReply === undefined}
            onPress={() => {
              if (onReply === undefined) return;
              void answer(async () => {
                const { reply } = await keepHere({ proposalId: proposal._id });
                onReply(reply);
              });
            }}
          >
            Do it here
          </Button>
        </View>
      </View>
    </CardSurface>
  );
}
