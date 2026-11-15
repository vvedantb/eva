import { api } from "@eva/backend";
import { currentInterviewQuestion, formatInterviewAnswer, interviewTurnText, parseProjectSpec } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconPlayerPlay } from "@tabler/icons-react-native";
import { ChoiceQuestion } from "@vvedantb/native-ui/ai";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { Button, Spinner, Textarea } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useScheme } from "@/ui/theme";

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;

/**
 * The web Plan tab (`ProjectChatTab`, `ProjectPlanTab`) of a draft or
 * finalized project, on the phone:
 * - No interview yet: "Start Interview".
 * - The interview so far (`interviewTurnText`), your turns on the end side,
 *   and the open question as a multiple-choice card (with "Other"); an
 *   answer is sent as the web sends it (`Q: … A: …`) and asks the next one.
 *   While Eva works, "Thinking…"; a run that stopped before the next
 *   question offers "Continue interview".
 * - Once the plan is generated (outside Draft): its title, description and
 *   numbered tasks, with Accept Plan (starts development) and Reject (back to
 *   Draft, the interview restarting with your reason), as the web.
 * Not here from the web: Clear transcript.
 */
export function ProjectPlan({ project }: { project: Project }) {
  const theme = EVA_THEME[useScheme()];
  const muted = theme.mutedForeground;
  const addMessage = useMutation(api.projects.addMessage);
  const updateProject = useMutation(api.projects.update);
  const startInterview = useMutation(api.projectInterviewWorkflow.startInterview);
  const startDevelopment = useMutation(api.projects.startDevelopment);
  // Only while a start is in flight; once it lands, the server's `activeWorkflowId` says "running".
  const [starting, setStarting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [accepting, setAccepting] = useState(false);

  const history = project.conversationHistory;
  const running = starting || project.activeWorkflowId !== undefined;
  // As the web: back in Draft, the stored spec waits for the next run.
  const spec = project.phase !== "draft" && project.generatedSpec ? parseProjectSpec(project.generatedSpec) : null;
  const question = spec ? null : currentInterviewQuestion(history, running);
  const lastIsUser = history.at(-1)?.role === "user";
  const turns = history.flatMap((turn, index) => {
    const text = turn.role === "user" ? turn.content : interviewTurnText(turn.content);
    return text ? [{ key: index, role: turn.role, text }] : [];
  });

  const askNext = async (rejectionReason?: string) => {
    setStarting(true);
    try {
      await startInterview({ projectId: project._id, featureDescription: project.rawInput, previousAnswers: [], rejectionReason });
    } catch {
      toast.error("Couldn't ask the next question");
    }
    setStarting(false);
  };
  const answer = async (text: string) => {
    try {
      await addMessage({ id: project._id, role: "user", content: text });
    } catch {
      toast.error("Couldn't send your answer");
      return;
    }
    await askNext();
  };
  const reject = async () => {
    const why = reason.trim();
    if (!why) return;
    setRejecting(false);
    setReason("");
    try {
      await updateProject({ id: project._id, phase: "draft" });
      await addMessage({ id: project._id, role: "user", content: why });
    } catch {
      toast.error("Couldn't reject the plan");
      return;
    }
    await askNext(why);
  };
  const accept = async () => {
    setAccepting(true);
    try {
      await startDevelopment({ projectId: project._id });
    } catch {
      toast.error("Couldn't start development");
    }
    setAccepting(false);
  };

  if (history.length === 0 && !running && !spec) {
    // The web's empty state.
    return (
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text accessibilityRole="header" className="font-instrument-sans-semibold text-lg" style={{ fontWeight: "600", color: theme.foreground }}>
          Ready to Start Interview
        </Text>
        <Text className="font-instrument-sans text-center text-sm" style={{ color: muted }}>
          Eva will ask multiple choice questions to understand your requirements, then automatically generate a plan when ready.
        </Text>
        <Button fullWidth={false} leftIcon={<IconPlayerPlay size={16} color={theme.primaryForeground} />} onPress={() => void askNext()}>
          Start Interview
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <KeyboardAwareScrollView
        bottomOffset={16}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 12 }}
      >
        {spec ? (
          <>
            <View className="gap-1">
              <Text accessibilityRole="header" className="font-instrument-sans-semibold text-lg" style={{ fontWeight: "600", color: theme.foreground }}>
                {spec.title}
              </Text>
              <Text className="font-instrument-sans text-sm" style={{ color: muted }}>
                {spec.description}
              </Text>
            </View>
            <Text accessibilityRole="header" className="font-instrument-sans-medium text-sm" style={{ fontWeight: "500", color: theme.foreground }}>
              {`Tasks (${spec.tasks.length})`}
            </Text>
            {spec.tasks.map((task, index) => (
              <View key={index} className="min-h-12 flex-row items-start gap-2 rounded-lg p-3" style={{ backgroundColor: theme.muted }}>
                <Text className="text-sm" style={{ fontFamily: "monospace", color: muted }}>{`${index + 1}.`}</Text>
                <Text className="font-instrument-sans min-w-0 flex-1 text-sm" style={{ color: theme.foreground }}>
                  {task.title}
                </Text>
              </View>
            ))}
            {rejecting ? (
              <View className="gap-2">
                <Textarea
                  autoFocus
                  accessibilityLabel="Why reject this plan"
                  placeholder="What should change?"
                  value={reason}
                  onChangeText={setReason}
                />
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Button variant="ghost" onPress={() => setRejecting(false)}>
                      Cancel
                    </Button>
                  </View>
                  <View className="flex-1">
                    <Button variant="destructive" disabled={!reason.trim()} onPress={() => void reject()}>
                      Reject plan
                    </Button>
                  </View>
                </View>
              </View>
            ) : (
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button variant="outline" disabled={running || accepting} onPress={() => setRejecting(true)}>
                    Reject
                  </Button>
                </View>
                <View className="flex-1">
                  <Button loading={accepting} disabled={running || accepting} onPress={() => void accept()}>
                    Accept Plan
                  </Button>
                </View>
              </View>
            )}
          </>
        ) : (
          turns.map((turn) =>
            turn.role === "user" ? (
              <View key={turn.key} className="max-w-[85%] self-end rounded-2xl px-3 py-2" style={{ backgroundColor: theme.secondary }}>
                <Text className="font-instrument-sans text-sm" style={{ color: theme.foreground }}>
                  {turn.text}
                </Text>
              </View>
            ) : (
              <View key={turn.key}>
                <Markdown>{turn.text}</Markdown>
              </View>
            ),
          )
        )}
        {running ? (
          <View className="flex-row items-center gap-2">
            <Spinner size="sm" />
            <Text className="font-instrument-sans text-sm" style={{ color: muted }}>
              Thinking...
            </Text>
          </View>
        ) : null}
        {!spec && !running && lastIsUser ? (
          <View className="gap-2 rounded-xl p-3" style={{ backgroundColor: theme.card }}>
            <Text className="font-instrument-sans text-sm" style={{ color: muted }}>
              The last interview run stopped before Eva asked the next question.
            </Text>
            <Button size="sm" fullWidth={false} onPress={() => void askNext()}>
              Continue interview
            </Button>
          </View>
        ) : null}
      </KeyboardAwareScrollView>
      {question ? (
        // The open question docks under the transcript, as the web's card under its chat.
        <ScrollView className="max-h-[60%] grow-0" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12 }}>
          <ChoiceQuestion
            key={history.length}
            questions={[{ question: question.question, header: "", multiSelect: false, options: question.options }]}
            buttonWeight="semibold"
            loading={running}
            onSubmit={(answers) => answer(formatInterviewAnswer(question.question, answers[question.question] ?? ""))}
          />
        </ScrollView>
      ) : null}
    </View>
  );
}
