"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Spinner,
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConfirmSkipHint,
  skipConfirmTitle,
  useRequestConfirm,
  ConfirmDialog,
} from "@vvedantb/ui";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { MultipleChoiceQuestion } from "@/lib/components/plan/MultipleChoiceQuestion";
import { IconTrash, IconPlayerPlay } from "@tabler/icons-react";
import type { ProjectPhase } from "@/lib/components/projects/ProjectPhaseBadge";
import { ProjectChatMessageList } from "./ProjectChatMessageList";
import {
  isInterviewTransitionContent,
  isParsedQuestion,
  isSpecContent,
  type ParsedQuestion,
} from "./projectChatMessage.utils";
import {
  catchMutationError,
  mutationError,
} from "@/lib/utils/mutationToast";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  activityLog?: string;
  userId?: Id<"users">;
  startedAt?: number;
  finishedAt?: number;
}

interface ProjectChatTabProps {
  projectId: Id<"projects">;
  projectPhase: ProjectPhase;
  activeWorkflowId?: string;
  initialMessages: ConversationMessage[];
  streamingActivity?: string;
  rawInput: string;
  onClear?: () => void;
  repoId: Id<"githubRepos">;
}

export function ProjectChatTab({
  projectId,
  projectPhase,
  activeWorkflowId,
  initialMessages,
  streamingActivity,
  rawInput,
  onClear,
  repoId: _repoId,
}: ProjectChatTabProps) {
  const addMessageDb = useMutation(api.projects.addMessage);
  const clearMessagesDb = useMutation(api.projects.clearMessages);
  const startProjectInterview = useMutation(
    api.projectInterviewWorkflow.startInterview,
  );
  const startProjectSpec = useMutation(api.projectInterviewWorkflow.startSpec);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // True only while a start mutation is in flight. Once it resolves, the
  // server's `activeWorkflowId` owns the "running" state.
  const [isStarting, setIsStarting] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const { request: requestConfirm } = useRequestConfirm();
  const [isClearing, setIsClearing] = useState(false);
  // The legacy `ready` row that already chained the spec. The effect below
  // re-runs on every parent callback change; without this it started the
  // spec again for the same row until `activeWorkflowId` arrived.
  const specRequestedForRef = useRef<number | null>(null);

  const isLocked =
    projectPhase === "in_progress" ||
    projectPhase === "business_review" ||
    projectPhase === "code_review" ||
    projectPhase === "completed";
  const hasActiveWorkflow = activeWorkflowId !== undefined;
  const isLoading = isStarting || hasActiveWorkflow;
  const hasStarted = initialMessages.length > 0 || isLoading;

  const questionCount = initialMessages.filter((m) => {
    if (m.role !== "assistant" || !m.content) {
      return false;
    }
    try {
      const parsed: unknown = JSON.parse(m.content);
      return isParsedQuestion(parsed);
    } catch {
      return false;
    }
  }).length;

  const hasSpecMessage = initialMessages.some(
    (m) => m.role === "assistant" && m.content && isSpecContent(m.content),
  );

  /** Holds `isStarting` for the mutation only; rethrows after the toast. */
  const runStart = (start: Promise<null>, error: string, id: string) => {
    setIsStarting(true);
    return catchMutationError(start, error, id).finally(() =>
      setIsStarting(false),
    );
  };

  /* eslint-disable no-effect/no-event-handler, no-effect/no-adjust-state-on-prop-change --
     `initialMessages` is a Convex live query, so the "event" happens on the
     server: the interview workflow writing a row is what has to chain the
     spec mutation. There is no client event to hang this off. */
  useEffect(() => {
    const lastMessage = initialMessages[initialMessages.length - 1];
    if (
      lastMessage?.role === "assistant" &&
      lastMessage.content &&
      isInterviewTransitionContent(lastMessage.content) &&
      projectPhase === "draft" &&
      !hasSpecMessage &&
      !hasActiveWorkflow &&
      specRequestedForRef.current !== initialMessages.length
    ) {
      // Legacy rows that still have {"ready":true} before spec was chained server-side.
      specRequestedForRef.current = initialMessages.length;
      void runStart(
        startProjectSpec({
          projectId,
          featureDescription: rawInput,
        }),
        "Couldn't generate the spec",
        "project-interview-spec",
      ).catch(() => {
        specRequestedForRef.current = null;
      });
    }
  }, [
    initialMessages,
    projectId,
    rawInput,
    startProjectSpec,
    projectPhase,
    hasSpecMessage,
    hasActiveWorkflow,
  ]);
  /* eslint-enable no-effect/no-event-handler, no-effect/no-adjust-state-on-prop-change */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [initialMessages]);

  const askQuestion = async () => {
    await runStart(
      startProjectInterview({
        projectId: projectId,
        featureDescription: rawInput,
        previousAnswers: [], // Session persistence provides context
      }),
      "Couldn't ask the next question",
      "project-interview-ask",
    ).catch(() => undefined);
  };

  /* eslint-disable no-effect/no-event-handler, no-effect/no-pass-data-to-parent --
     Mount-only recovery: a project whose first question never came back (tab
     closed mid-request) has no user event left to retry from, so the retry has
     to fire when the component remounts. */
  useEffect(() => {
    // A running workflow will write the question itself; asking again would
    // only be refused server-side.
    if (isLocked || isLoading) return;
    const hasAssistant = initialMessages.some((m) => m.role === "assistant");
    if (initialMessages.length > 0 && !hasAssistant) {
      void askQuestion();
    }
  }, []);
  /* eslint-enable no-effect/no-event-handler, no-effect/no-pass-data-to-parent */

  const handleStartInterview = () => {
    void askQuestion();
  };

  const handleAnswer = async (answer: string) => {
    try {
      await addMessageDb({ id: projectId, role: "user", content: answer });
    } catch {
      mutationError("Couldn't send your answer", "project-interview-answer");
      return;
    }
    await askQuestion();
  };

  const handleClearChat = async () => {
    setIsClearing(true);
    try {
      await clearMessagesDb({ id: projectId });
      // Called through an if rather than `?.`: React Compiler bails on the
      // whole file when an optional-chaining call sits inside a try/catch.
      if (onClear) onClear();
      setConfirmClearOpen(false);
    } catch (error) {
      setIsClearing(false);
      throw error;
    }
    setIsClearing(false);
  };

  const currentQuestion: ParsedQuestion | null = (() => {
    if (isLoading) return null;
    const lastAssistantMsg = [...initialMessages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastAssistantMsg) return null;
    try {
      const parsed: unknown = JSON.parse(lastAssistantMsg.content);
      if (isParsedQuestion(parsed)) return parsed;
    } catch {
      return null;
    }
    return null;
  })();

  const waitingForResponse =
    initialMessages.length > 0 &&
    initialMessages[initialMessages.length - 1]?.role === "user" &&
    isLoading;
  const canContinueInterview =
    initialMessages.length > 0 &&
    initialMessages[initialMessages.length - 1]?.role === "user" &&
    !isLoading &&
    !isLocked;
  const showQuestion = currentQuestion && !waitingForResponse;

  if (!hasStarted && !isLocked) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 sm:p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mb-4">
          <IconPlayerPlay size={32} className="text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Ready to Start Interview
        </h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-md">
          Click the button below to start answering questions about your
          project. Eva will ask multiple choice questions to understand your
          requirements, then automatically generate a plan when ready.
        </p>
        <Button size="lg" onClick={handleStartInterview} disabled={isLoading}>
          {isLoading ? (
            <Spinner size="sm" />
          ) : (
            <IconPlayerPlay className="mr-2 h-5 w-5" />
          )}
          Start Interview
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="gap-3 p-3 max-w-5xl mx-auto w-full">
          <ProjectChatMessageList
            messages={initialMessages}
            streamingActivity={streamingActivity}
          />
          {(isLoading || waitingForResponse) &&
            !initialMessages.some(
              (m) => m.role === "assistant" && !m.content,
            ) && (
              <div className="flex gap-3 items-center">
                <Spinner size="sm" />
                <span className="text-sm text-muted-foreground">
                  Thinking...
                </span>
              </div>
            )}
          {canContinueInterview && (
            <div className="flex flex-col gap-2 rounded-surface bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">
                The last interview run stopped before Eva asked the next
                question.
              </span>
              <Button size="sm" onClick={handleStartInterview}>
                Continue interview
              </Button>
            </div>
          )}
          <div ref={messagesEndRef} />
        </ConversationContent>
        <ConversationScrollButton resetKey={projectId} />
      </Conversation>
      <div className="p-3 sm:p-4 space-y-3 max-w-5xl mx-auto w-full">
        {showQuestion && (
          <MultipleChoiceQuestion
            question={currentQuestion.question}
            options={currentQuestion.options}
            onAnswer={handleAnswer}
            isLoading={isLoading}
            questionNumber={questionCount}
            trailingControls={
              <>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  Answered: {questionCount}
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  title={skipConfirmTitle("Clear")}
                  onClick={(event) =>
                    requestConfirm(
                      () => setConfirmClearOpen(true),
                      () => {
                        void handleClearChat();
                      },
                      event,
                    )
                  }
                  disabled={
                    isLoading || isLocked || initialMessages.length === 0
                  }
                >
                  <IconTrash size={16} />
                  Clear
                  <ConfirmSkipHint />
                </Button>
              </>
            }
          />
        )}
      </div>
      <ConfirmDialog
        size="md"
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Clear interview transcript?"
        description="This deletes the Q&A history for this project so you can restart the interview from scratch."
        body={
          <p className="text-sm text-muted-foreground">
            The sandbox, generated spec, and any tasks are not affected.
          </p>
        }
        confirmLabel="Clear transcript"
        variant="destructive"
        onConfirm={() => {
          void handleClearChat();
        }}
        pending={isClearing}
      />
    </div>
  );
}
