import { api, type Id } from "@eva/backend";
import { IconChevronDown } from "@tabler/icons-react-native";
import { PromptInput } from "@vvedantb/native-ui/ai";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import {
  CenteredSpinner,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { splitTaskPrompt } from "@/tasks/quickTasks";
import { useScheme } from "@/ui/theme";

/**
 * A new quick task: pick a repo, write the prompt. The first line is the
 * title and the whole prompt the description. Creates with the repo defaults
 * (`agentTasks.createQuickTask`), starts the run as the web "Run" does, then
 * opens the task chat.
 */
export default function NewQuickTaskScreen() {
  const router = useRouter();
  const scheme = useScheme();
  const repos = useQuery(api.githubRepos.list, {});
  const createQuickTask = useMutation(api.agentTasks.createQuickTask);
  const startExecution = useMutation(api.agentTasks.startExecution);
  const [picked, setPicked] = useState<Id<"githubRepos"> | null>(null);
  const [sending, setSending] = useState(false);
  const repo = repos?.find((candidate) => candidate._id === picked) ?? repos?.[0];
  const foreground = tokens.color.foreground[scheme];

  const handleSend = async (prompt: string) => {
    const { title, description } = splitTaskPrompt(prompt);
    if (!repo || sending || !title) return;
    setSending(true);
    try {
      const id = await createQuickTask({ repoId: repo._id, title, description });
      try {
        await startExecution({ id });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Task created, but it did not start");
      }
      router.replace({ pathname: "/chat/[target]", params: { target: id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create task");
      setSending(false);
    }
  };

  return (
    <View className="flex-1">
      <StackPageHeader title="New quick task" onBack={() => router.back()} />
      {repos === undefined ? (
        <CenteredSpinner label="Loading repos" />
      ) : (
        <View className="flex-1 justify-center gap-3 px-4">
          <View className="flex-row flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <Text className="font-instrument-sans-semibold text-xl" style={{ color: foreground, fontWeight: "600", letterSpacing: -0.5 }}>
              What should Eva do in
            </Text>
            <DropdownMenu>
              <DropdownMenuTrigger accessibilityLabel={`Repo: ${repo ? (repo.label ?? repo.name) : "none"}`} className="flex-row items-center gap-1 active:opacity-70">
                <Text
                  className="font-instrument-sans-semibold text-xl"
                  style={{ color: foreground, fontWeight: "600", letterSpacing: -0.5, textDecorationLine: "underline" }}
                >
                  {repo ? (repo.label ?? repo.name) : "a repo"}
                </Text>
                <IconChevronDown size={18} color={foreground} />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {repos.map((candidate) => (
                  <DropdownMenuRadioItem key={candidate._id} checked={candidate._id === repo?._id} onSelect={() => setPicked(candidate._id)}>
                    {candidate.label ?? candidate.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Text className="font-instrument-sans-semibold text-xl" style={{ color: foreground, fontWeight: "600" }}>
              ?
            </Text>
          </View>
          <PromptInput
            layout="inline"
            disabled={!repo || sending}
            status={sending ? "submitted" : "ready"}
            onSubmit={(prompt) => void handleSend(prompt)}
            placeholder="Describe the task..."
          />
        </View>
      )}
    </View>
  );
}
