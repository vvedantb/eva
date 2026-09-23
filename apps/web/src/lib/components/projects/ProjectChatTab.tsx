"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Spinner,
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@eva/ui";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { MultipleChoiceQuestion } from "@/lib/components/plan/MultipleChoiceQuestion";
import { ConfirmDialog } from "@/lib/components/quick-tasks/_components/ConfirmDialog";
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";
import { IconTrash, IconPlayerPlay } from "@tabler/icons-react";
import type { ProjectPhase } from "@/lib/components/projects/ProjectPhaseBadge";
import { ProjectChatMessageList } from "./ProjectChatMessageList";
import {
  isInterviewTransitionContent,
  isParsedQuestion,
  isSpecContent,
  type ParsedQuestion,
} from "./projectChatMessage.utils";

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
  onSpecGenerated?: (spec: string) => void;
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
  onSpecGenerated,
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
  const [isLoading, setIsLoading] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const altHeld = useAltHeld();
  const [isClearing, setIsClearing] = useState(false);
  const prevMessagesLengthRef = useRef(initialMessages.length);

  const isLocked =
    projectPhase === "in_progress" ||
    projectPhase === "business_review" ||
    projectPhase === "code_review" ||
    projectPhase === "completed";
  const hasStarted = initialMessages.length > 0 || isLoading;
  const hasActiveWorkflow = activeWorkflowId !== undefined;

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

  useEffect(() => {
    const lastMessage = initialMessages[initialMessages.length - 1];
    if (lastMessage?.role === "assistant" && lastMessage.content) {
      setIsLoading(false);
      if (isSpecContent(lastMessage.content)) {
        onSpecGenerated?.(lastMessage.content);
      } else if (
        isInterviewTransitionContent(lastMessage.content) &&
        projectPhase === "draft" &&
        !hasSpecMessage &&
        !hasActiveWorkflow
      ) {
        // Legacy rows that still have {"ready":true} before spec was chained server-side.
        setIsLoading(true);
        void startProjectSpec({
          projectId,
          featureDescription: rawInput,
        });
      }
    }
    prevMessagesLengthRef.current = initialMessages.length;
  }, [
    initialMessages,
    onSpecGenerated,
    projectId,
    rawInput,
    startProjectSpec,
    projectPhase,
    hasSpecMessage,
    hasActiveWorkflow,
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [initialMessages]);

  const askQuestion = async () => {
    setIsLoading(true);
    await startProjectInterview({
      projectId: projectId,
      featureDescription: rawInput,
      previousAnswers: [], // Session persistence provides context
    });
  };

  useEffect(() => {
    if (isLocked || isLoading) return;
    const hasAssistant = initialMessages.some((m) => m.role === "assistant");
    if (initialMessages.length > 0 && !hasAssistant) {
      void askQuestion();
    }
  }, []);

  const handleStartInterview = () => {
    void askQuestion();
  };

  const handleAnswer = async (answer: string) => {
    await addMessageDb({ id: projectId, role: "user", content: answer });
    await askQuestion();
  };

  const handleClearChat = async () => {
    setIsClearing(true);
    try {
      await clearMessagesDb({ id: projectId });
      setIsLoading(false);
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
    (isLoading || hasActiveWorkflow);
  const canContinueInterview =
    initialMessages.length > 0 &&
    initialMessages[initialMessages.length - 1]?.role === "user" &&
    !isLoading &&
    !hasActiveWorkflow &&
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
                      altHeld,
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
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Clear interview transcript?"
        description="This deletes the Q&A history for this project so you can restart the interview from scratch."
        detail="The sandbox, generated spec, and any tasks are not affected."
        confirmLabel="Clear transcript"
        variant="destructive"
        onConfirm={() => {
          void handleClearChat();
        }}
        isLoading={isClearing}
      />
    </div>
  );
}
