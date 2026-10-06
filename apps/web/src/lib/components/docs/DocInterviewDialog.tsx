"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  ActivityTasks,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Spinner,
  Textarea,
  getSpeechRecognition,
  useSpeechRecognition,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import {
  IconTrash,
  IconMicrophone,
  IconPlayerStop,
  IconArrowRight,
} from "@tabler/icons-react";
import { MultipleChoiceQuestion } from "@/lib/components/plan/MultipleChoiceQuestion";
import { ChatMessage } from "@/lib/components/plan/ChatMessage";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { withMutationToast } from "@/lib/utils/mutationToast";
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";

type Doc = NonNullable<FunctionReturnType<typeof api.docs.get>>;

interface AnswerRecord {
  question: string;
  answer: string;
}

interface OptionItem {
  label: string;
  description: string;
}

interface ParsedQuestion {
  question: string;
  options: OptionItem[];
}

const isValidOption = (o: unknown): o is OptionItem =>
  typeof o === "object" &&
  o !== null &&
  "label" in o &&
  typeof o.label === "string" &&
  "description" in o &&
  typeof o.description === "string";

const isParsedQuestion = (v: unknown): v is ParsedQuestion =>
  typeof v === "object" &&
  v !== null &&
  "question" in v &&
  typeof v.question === "string" &&
  "options" in v &&
  Array.isArray(v.options) &&
  v.options.every(isValidOption);

// Isolates the try/catch so callers can branch on the result with ordinary
// conditionals. React Compiler bails on a whole file when a conditional or
// logical expression sits inside a try/catch, so the parse lives here alone.
function parseJsonOrNull(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

interface DocInterviewDialogProps {
  doc: Doc;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
}

export function DocInterviewDialog({
  doc,
  open,
  onOpenChange,
  readOnly,
}: DocInterviewDialogProps) {
  const addMessage = useMutation(api.docs.addInterviewMessage);
  const clearInterview = useMutation(api.docs.clearInterview);
  const startDocInterview = useMutation(
    api.docInterviewWorkflow.startInterview,
  );
  const startDocGenerate = useMutation(api.docInterviewWorkflow.startGenerate);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const altHeld = useAltHeld();
  const [dictation, setDictation] = useState("");
  const hasTriggeredRef = useRef(false);
  const hasSpeech = !!getSpeechRecognition();
  const { isListening, toggle: toggleSpeech } =
    useSpeechRecognition(setDictation);

  const streaming = useQuery(
    api.streaming.get,
    open && !readOnly ? { entityId: doc._id } : "skip",
  );

  const messages = doc.interviewHistory ?? [];

  const answers: AnswerRecord[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const nextMsg = messages[i + 1];
    if (msg.role === "assistant" && nextMsg?.role === "user") {
      try {
        const parsed = JSON.parse(msg.content);
        if (parsed.question) {
          answers.push({ question: parsed.question, answer: nextMsg.content });
        }
      } catch {
        continue;
      }
    }
  }

  /* eslint-disable no-effect/no-event-handler, no-effect/no-adjust-state-on-prop-change --
     `messages` is a Convex live query: the interview workflow appending a row
     on the server is what closes the dialog or chains generation, and no local
     handler sees it. */
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant" && lastMessage.content) {
      setIsLoading(false);
      // Parsed via the helper rather than an inline try/catch: React Compiler
      // bails on the whole file when a logical expression sits inside one.
      const parsed = parseJsonOrNull(lastMessage.content);
      if (parsed !== null) {
        if (parsed.description && parsed.requirements) {
          onOpenChange(false);
        } else if (parsed.ready === true) {
          setIsLoading(true);
          startDocGenerate({
            docId: doc._id,
            docTitle: doc.title,
            previousAnswers: answers,
          });
        }
      }
    }
  }, [messages, onOpenChange, answers, doc._id, doc.title, startDocGenerate]);
  /* eslint-enable no-effect/no-event-handler, no-effect/no-adjust-state-on-prop-change */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const askQuestion = async (currentAnswers: AnswerRecord[]) => {
    setIsLoading(true);
    await startDocInterview({
      docId: doc._id,
      docTitle: doc.title,
      previousAnswers: currentAnswers,
    });
  };

  /* eslint-disable no-effect/no-event-handler, no-effect/no-derived-state --
     The dialog can be opened from several call sites (and from a route), so the
     "ask the first question" kick-off belongs to the open transition, not to any
     one trigger's click handler. */
  useEffect(() => {
    if (!open || readOnly || hasTriggeredRef.current) return;
    if (messages.length === 0) {
      hasTriggeredRef.current = true;
      askQuestion([]);
    }
  }, [open]);
  /* eslint-enable no-effect/no-event-handler, no-effect/no-derived-state */

  const handleAnswer = async (answer: string) => {
    const lastAssistantMsg = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    let currentQuestion = "";
    if (lastAssistantMsg) {
      try {
        const parsed: unknown = JSON.parse(lastAssistantMsg.content);
        if (isParsedQuestion(parsed)) currentQuestion = parsed.question;
      } catch {
        // ignore
      }
    }

    setDictation("");
    if (isListening) toggleSpeech("");
    const updatedAnswers = [...answers, { question: currentQuestion, answer }];
    await addMessage({ id: doc._id, role: "user", content: answer });
    askQuestion(updatedAnswers);
  };

  const handleDictationSubmit = () => {
    if (dictation.trim()) handleAnswer(dictation.trim());
  };

  const handleClear = async () => {
    await withMutationToast(
      clearInterview({ id: doc._id }),
      "Interview cleared",
      "Couldn't clear interview",
      "doc-interview-clear",
    );
    setIsLoading(false);
    hasTriggeredRef.current = false;
    setConfirmClear(false);
  };

  const currentQuestion: ParsedQuestion | null = (() => {
    if (isLoading || readOnly) return null;
    const lastAssistantMsg = [...messages]
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
    messages.length > 0 && messages[messages.length - 1]?.role === "user";
  const showQuestion = currentQuestion && !waitingForResponse;
  const questionCount = messages.filter((m) => m.role === "assistant").length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[calc(100vw-2rem)] w-full max-h-[95dvh] flex flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {readOnly ? "Interview History" : "Interview"}: {doc.title}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto scrollbar space-y-3 p-2 sm:p-3">
            {messages.length === 0 && readOnly && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No interview history yet.
              </p>
            )}
            {messages.map((message, i) => {
              let body: ReactNode;
              if (message.role === "assistant") {
                if (!message.content) {
                  const steps = parseActivitySteps(streaming?.currentActivity);
                  body = steps ? (
                    <ActivityTasks steps={steps} isStreaming />
                  ) : (
                    <ChatMessage
                      role="assistant"
                      content={streaming?.currentActivity || "Starting..."}
                      isStreaming
                    />
                  );
                } else {
                  const parsed = parseJsonOrNull(message.content);
                  if (parsed !== null && parsed.question) {
                    body = (
                      <ChatMessage
                        role="assistant"
                        content={parsed.question}
                        logs={message.activityLog}
                      />
                    );
                  } else if (
                    parsed !== null &&
                    parsed.description &&
                    parsed.requirements
                  ) {
                    body = (
                      <ChatMessage
                        role="assistant"
                        content="Generated description, requirements, and user flows."
                      />
                    );
                  } else if (parsed !== null && parsed.error) {
                    body = (
                      <ChatMessage
                        role="assistant"
                        content="Something went wrong. Please try again."
                      />
                    );
                  } else {
                    body = (
                      <ChatMessage
                        role="assistant"
                        content={message.content}
                        logs={message.activityLog}
                      />
                    );
                  }
                }
              } else {
                body = (
                  <ChatMessage
                    role="user"
                    content={message.content}
                    userId={message.userId}
                  />
                );
              }
              return (
                <ListEnter key={`msg-${i}`} index={i} fast>
                  {body}
                </ListEnter>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {!readOnly && (
            <div className="space-y-3 pt-2 border-t border-border">
              <AnimatePresence mode="wait" initial={false}>
                {showQuestion ? (
                  <m.div
                    key="question"
                    className="space-y-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={motionFast}
                  >
                    <MultipleChoiceQuestion
                      question={currentQuestion.question}
                      options={currentQuestion.options}
                      onAnswer={handleAnswer}
                      isLoading={isLoading}
                      questionNumber={questionCount}
                    />
                    {hasSpeech && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-xs text-muted-foreground">
                            or describe in your own words
                          </span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                        <div className="flex gap-2">
                          <Textarea
                            value={dictation}
                            onChange={(e) => setDictation(e.target.value)}
                            placeholder={
                              isListening
                                ? "Listening..."
                                : "Click the mic or type here..."
                            }
                            rows={2}
                            className="text-sm bg-card flex-1"
                            disabled={isLoading}
                          />
                          <div className="flex flex-col gap-1">
                            <Button
                              size="icon"
                              variant={
                                isListening ? "destructive" : "secondary"
                              }
                              aria-label={
                                isListening
                                  ? "Stop dictation"
                                  : "Dictate an answer"
                              }
                              onClick={() => toggleSpeech(dictation)}
                              disabled={isLoading}
                              className="size-10 sm:size-8"
                            >
                              {isListening ? (
                                <IconPlayerStop size={14} aria-hidden />
                              ) : (
                                <IconMicrophone size={14} aria-hidden />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="default"
                              aria-label="Send answer"
                              onClick={handleDictationSubmit}
                              disabled={isLoading || !dictation.trim()}
                              className="size-10 sm:size-8"
                            >
                              <IconArrowRight size={14} aria-hidden />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </m.div>
                ) : (isLoading || waitingForResponse) &&
                  !messages.some(
                    (msg) => msg.role === "assistant" && !msg.content,
                  ) ? (
                  <m.div
                    key="thinking"
                    className="flex gap-3 items-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={motionFast}
                  >
                    <Spinner size="sm" />
                    <span className="text-sm text-muted-foreground">
                      Thinking...
                    </span>
                  </m.div>
                ) : null}
              </AnimatePresence>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Questions: {questionCount}
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  title={skipConfirmTitle("Clear")}
                  onClick={(event) =>
                    requestConfirm(
                      altHeld,
                      () => setConfirmClear(true),
                      () => {
                        void handleClear();
                      },
                      event,
                    )
                  }
                  disabled={isLoading || messages.length === 0}
                >
                  <IconTrash size={16} />
                  Clear
                  <ConfirmSkipHint />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear interview?</DialogTitle>
            <DialogDescription>
              This will permanently delete all interview questions and answers.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClear}>
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
