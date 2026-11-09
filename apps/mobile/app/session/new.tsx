import { api, type Id } from "@eva/backend";
import { useUser } from "@clerk/clerk-expo";
import { IconBrandGithub, IconChevronDown, IconPlus } from "@tabler/icons-react-native";
import { Attachment, Attachments, PromptInput, PromptInputButton } from "@vvedantb/native-ui/ai";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import {
  CenteredSpinner,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@vvedantb/native-ui/primitives";
import { tokens, withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { useAttachments } from "@/chat/useAttachments";
import { useScheme } from "@/ui/theme";

/**
 * A new session, as the web sessions landing (`NewSessionComposer`): "Sam,
 * what are we building for <repo ⌄>?" over the composer. Sends with the
 * repo's default model and branch (`mobile.startSession`), then opens the chat.
 */
export default function NewSessionScreen() {
  const router = useRouter();
  const scheme = useScheme();
  const { user } = useUser();
  const repos = useQuery(api.githubRepos.list, {});
  const startSession = useMutation(api.mobile.startSession);
  const attachments = useAttachments();
  const [picked, setPicked] = useState<Id<"githubRepos"> | null>(null);
  const [sending, setSending] = useState(false);
  const repo = repos?.find((candidate) => candidate._id === picked) ?? repos?.[0];
  const firstName = user?.firstName?.trim();
  const foreground = tokens.color.foreground[scheme];
  const muted = tokens.color.muted[scheme];

  const handleSend = async (prompt: string) => {
    if (!repo || sending) return;
    if (attachments.uploading) {
      toast.error("Wait for the attachments to upload");
      return;
    }
    setSending(true);
    try {
      const { sessionId } = await startSession({ repoId: repo._id, prompt, attachmentStorageIds: attachments.storageIds });
      router.replace({ pathname: "/chat/[target]", params: { target: sessionId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create session");
      setSending(false);
    }
  };

  return (
    <View className="flex-1">
      <StackPageHeader title="New session" onBack={() => router.back()} />
      {repos === undefined ? (
        <CenteredSpinner label="Loading repos" />
      ) : (
        // The web landing at 390: `p-4` in a column 10 short of the right edge.
        <View className="flex-1 justify-center gap-3 pl-4 pr-[26px]">
          {/* Web: text-xl semibold tracking-tight, centred, the repo picker inline (GitHub mark, name underlined at 30%). */}
          <View className="flex-row flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <Text className="font-instrument-sans-semibold text-xl" style={{ color: foreground, fontWeight: "600", letterSpacing: -0.5 }}>
              {firstName ? `${firstName}, what are we building for` : "What are we building for"}
            </Text>
            <DropdownMenu>
              <DropdownMenuTrigger accessibilityLabel={`Repo: ${repo ? (repo.label ?? repo.name) : "none"}`} className="flex-row items-center gap-1.5 active:opacity-70">
                <IconBrandGithub size={28} color={muted} />
                <Text
                  className="font-instrument-sans-semibold text-xl"
                  style={{
                    color: foreground,
                    fontWeight: "600",
                    letterSpacing: -0.5,
                    textDecorationLine: "underline",
                    textDecorationColor: withAlpha(foreground, 0.3),
                  }}
                >
                  {repo ? (repo.label ?? repo.name) : "a repo"}
                </Text>
                <IconChevronDown size={16} color={foreground} />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {repos.map((candidate) => (
                  <DropdownMenuRadioItem key={candidate._id} checked={candidate._id === repo?._id} onSelect={() => setPicked(candidate._id)}>
                    {candidate.label ?? candidate.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Text className="font-instrument-sans-semibold text-xl" style={{ color: foreground, fontWeight: "600", letterSpacing: -0.5 }}>
              ?
            </Text>
          </View>
          <PromptInput
            layout="inline"
            shape="pill"
            disabled={!repo || sending}
            status={sending ? "submitted" : "ready"}
            onSubmit={(prompt) => void handleSend(prompt)}
            placeholder="Ask Eva anything..."
            leading={
              <PromptInputButton variant="secondary" icon={IconPlus} label="Add attachment" onPress={() => void attachments.pick()} />
            }
            header={
              attachments.items.length > 0 ? (
                <Attachments>
                  {attachments.items.map((item) => (
                    <Attachment key={item.id} data={item} onRemove={() => attachments.remove(item.id)} />
                  ))}
                </Attachments>
              ) : null
            }
          />
        </View>
      )}
    </View>
  );
}
