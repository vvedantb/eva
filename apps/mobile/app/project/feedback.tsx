import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconLayoutKanban } from "@tabler/icons-react-native";
import { Attachment, Attachments } from "@vvedantb/native-ui/ai";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import { Button, CenteredSpinner, EmptyState, KeyboardAvoidingView } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AttachButton } from "@/chat/AttachButton";
import { useAttachments } from "@/chat/useAttachments";
import { useScheme } from "@/ui/theme";

/**
 * A viewer's one write action in a project, as the web `ProjectFeedbackModal`
 * on a phone: a full screen in place of the dialog, with the text and the
 * chat's file picker (`AttachButton`). "Send" calls
 * `agentTasks.createFeedbackTask`: the task lands in the project's To Do, not
 * approved, so nothing runs until a contributor approves it. Then back to
 * the project. Routes as `/project/feedback?projectId=<id>&repo=<repoId>`;
 * the project resolves through the repo's list, so its id keeps its type.
 */
export default function ProjectFeedbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId: string; repo?: string }>();
  const leave = () => goBackOrReplace(router, "/projects");
  const repos = useQuery(api.githubRepos.list, {});
  const repo = repos?.find((candidate) => candidate._id === params.repo);
  const projects = useQuery(api.projects.list, repo ? { repoId: repo._id } : "skip");
  const project = projects?.find((candidate) => candidate._id === params.projectId);
  const loading = repos === undefined || (repo !== undefined && projects === undefined);
  if (loading || !project) {
    return (
      <Screen onBack={leave}>
        {loading ? (
          <CenteredSpinner label="Loading project" />
        ) : (
          <EmptyState icon={IconLayoutKanban} title="Project not found" description="It was deleted, or you no longer have access." />
        )}
      </Screen>
    );
  }
  return <FeedbackForm projectId={project._id} onLeave={leave} />;
}

function FeedbackForm({ projectId, onLeave: leave }: { projectId: Id<"projects">; onLeave: () => void }) {
  const theme = EVA_THEME[useScheme()];
  const insets = useSafeAreaInsets();
  const createFeedbackTask = useMutation(api.agentTasks.createFeedbackTask);
  const attachments = useAttachments();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const send = () => {
    if (attachments.uploading) {
      toast.error("Wait for the attachments to upload");
      return;
    }
    setSending(true);
    const attachmentStorageIds = attachments.storageIds;
    createFeedbackTask({
      projectId,
      text,
      attachmentStorageIds: attachmentStorageIds.length > 0 ? attachmentStorageIds : undefined,
    }).then(
      () => {
        toast.success("Feedback sent");
        leave();
      },
      () => {
        toast.error("Couldn't send feedback");
        setSending(false);
      },
    );
  };

  return (
    <Screen onBack={leave}>
      <KeyboardAvoidingView style={{ flex: 1 }}>
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            accessibilityLabel="Feedback"
            autoFocus
            multiline
            textAlignVertical="top"
            className="font-instrument-sans min-h-40 py-2 text-base"
            style={{ color: theme.foreground }}
          />
          {attachments.items.length > 0 ? (
            <Attachments>
              {attachments.items.map((item) => (
                <Attachment key={item.id} data={item} onRemove={() => attachments.remove(item.id)} />
              ))}
            </Attachments>
          ) : null}
          <View className="flex-row">
            <AttachButton attachments={attachments} />
          </View>
        </ScrollView>
        <View className="px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
          <Button onPress={send} disabled={!text.trim() || sending} loading={sending}>
            Send
          </Button>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** The stack header ("Feedback", back) over the screen body. */
function Screen({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <View className="flex-1">
      <StackPageHeader title="Feedback" onBack={onBack} />
      {children}
    </View>
  );
}
