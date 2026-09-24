"use client";

import { useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  LIST_ROW_CONTROL_CLASS,
  motionBase,
  Spinner,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import {
  IconCheck,
  IconPencil,
  IconArrowRight,
  IconArrowLeft,
} from "@tabler/icons-react";

/**
 * The pressable surface of an option card. A stretched native `<button>` rather
 * than `role="button" tabIndex={0}` plus a hand-written Enter/Space handler on
 * the card div — see `list-row.tsx` for why the native element has to own the
 * role and the keyboard behaviour. Nested controls (the "Other" text field) opt
 * back above it with `LIST_ROW_CONTROL_CLASS`.
 */
const OPTION_OVERLAY_CLASS =
  "absolute inset-0 z-1 cursor-pointer rounded-surface focus-visible:outline-hidden";

interface OptionItem {
  label: string;
  description: string;
}

interface QuestionItem {
  question: string;
  header: string;
  options: OptionItem[];
  multiSelect: boolean;
}

interface MultipleChoiceQuestionProps {
  question?: string;
  options?: OptionItem[];
  questions?: QuestionItem[];
  onAnswer: (answer: string) => void;
  /**
   * When provided, submitting calls this with a structured map (question text →
   * selected label; multi-select joined as a comma-separated string) INSTEAD of
   * {@link onAnswer}'s `Q:/A:` string. Used for blocking AskUserQuestion, where
   * the answer becomes a real tool_result rather than a new chat message.
   */
  onAnswerStructured?: (answers: Record<string, string>) => void;
  isLoading?: boolean;
  questionNumber?: number;
  // Optional controls appended to the submit row (e.g. a question counter and
  // a Clear button) so callers can keep them on the same line as the action.
  trailingControls?: ReactNode;
}

export function MultipleChoiceQuestion({
  question,
  options,
  questions,
  onAnswer,
  onAnswerStructured,
  isLoading = false,
  trailingControls,
}: MultipleChoiceQuestionProps) {
  const resolvedQuestions: QuestionItem[] = questions
    ? questions
    : question && options
      ? [{ question, header: "", options, multiSelect: false }]
      : [];

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<number, string>>(
    {},
  );
  const [otherActive, setOtherActive] = useState<Record<number, boolean>>({});

  const optionLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const totalSteps = resolvedQuestions.length;
  const isMultiStep = totalSteps > 1;
  const q = resolvedQuestions[currentStep];
  const isLastStep = currentStep === totalSteps - 1;

  const toggleOption = (label: string, multiSelect: boolean) => {
    const idx = currentStep;
    setAnswers((prev) => {
      const current = prev[idx] ?? [];
      if (multiSelect) {
        const exists = current.includes(label);
        return {
          ...prev,
          [idx]: exists
            ? current.filter((l) => l !== label)
            : [...current, label],
        };
      }
      return { ...prev, [idx]: [label] };
    });
    setOtherActive((prev) => ({ ...prev, [idx]: false }));
  };

  const toggleOther = () => {
    const idx = currentStep;
    setOtherActive((prev) => ({ ...prev, [idx]: true }));
    setAnswers((prev) => ({ ...prev, [idx]: [] }));
  };

  const currentHasAnswer = otherActive[currentStep]
    ? (customAnswers[currentStep] ?? "").trim().length > 0
    : (answers[currentStep] ?? []).length > 0;

  const formatAnswer = () => {
    return resolvedQuestions
      .map((rq, idx) => {
        const answer = otherActive[idx]
          ? (customAnswers[idx] ?? "").trim()
          : (answers[idx] ?? []).join(", ");
        return `Q: ${rq.question}\nA: ${answer}`;
      })
      .join("\n\n");
  };

  // Structured answer keyed by question text → selected label (or free-text
  // "Other"). Multi-select is a comma-separated string — the shape AskUserQuestion
  // expects in updatedInput.answers.
  const buildStructuredAnswer = (): Record<string, string> => {
    const result: Record<string, string> = {};
    resolvedQuestions.forEach((rq, idx) => {
      if (otherActive[idx]) {
        result[rq.question] = (customAnswers[idx] ?? "").trim();
        return;
      }
      const selected = answers[idx] ?? [];
      result[rq.question] = rq.multiSelect
        ? selected.join(", ")
        : (selected[0] ?? "");
    });
    return result;
  };

  const handleNext = () => {
    if (!currentHasAnswer || isLoading) return;
    if (isLastStep) {
      if (onAnswerStructured) {
        onAnswerStructured(buildStructuredAnswer());
      } else {
        onAnswer(formatAnswer());
      }
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  if (!q) return null;

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={currentStep}
          className="space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionBase}
        >
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold leading-snug text-foreground">
              {q.question}
            </p>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {q.header && (
                <Badge
                  variant="secondary"
                  className="text-[10px] font-semibold"
                >
                  {q.header}
                </Badge>
              )}
              {isMultiStep && (
                <span className="text-[11px] text-muted-foreground font-medium">
                  {currentStep + 1}/{totalSteps}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {q.options.map((option, optIdx) => {
              const isSelected = (answers[currentStep] ?? []).includes(
                option.label,
              );
              const letter = optionLetters[optIdx] ?? String(optIdx + 1);
              return (
                <Card
                  key={`${option.label}-${optIdx}`}
                  className={`relative shadow-none transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)] has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring/35 ${
                    isSelected
                      ? "border-primary bg-accent ring-1 ring-primary"
                      : "border-transparent bg-secondary hover:bg-muted"
                  } ${isLoading ? "pointer-events-none opacity-50" : ""}`}
                >
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isLoading}
                    onClick={() => toggleOption(option.label, q.multiSelect)}
                    className={OPTION_OVERLAY_CLASS}
                  >
                    <span className="sr-only">{option.label}</span>
                  </button>
                  <CardContent className="flex flex-row items-start gap-3 py-2 px-2.5">
                    <span
                      className={`
                    w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5
                    text-[11px] font-bold tracking-wide transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)]
                    ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground"
                    }
                  `}
                    >
                      {isSelected ? (
                        <IconCheck size={13} strokeWidth={3} />
                      ) : (
                        letter
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-sm leading-snug font-medium ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                      >
                        {option.label}
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {option.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <Card
              className={`relative shadow-none transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)] has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring/35 ${
                otherActive[currentStep]
                  ? "border-primary bg-accent ring-1 ring-primary"
                  : "border-transparent bg-secondary hover:bg-muted"
              } ${isLoading ? "pointer-events-none opacity-50" : ""}`}
            >
              <button
                type="button"
                aria-pressed={otherActive[currentStep] ?? false}
                disabled={isLoading}
                onClick={() => toggleOther()}
                className={OPTION_OVERLAY_CLASS}
              >
                <span className="sr-only">Other</span>
              </button>
              <CardContent className="py-2 px-2.5">
                <div className="flex items-center gap-3">
                  <span
                    className={`
                  w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)]
                  ${
                    otherActive[currentStep]
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }
                `}
                  >
                    {otherActive[currentStep] ? (
                      <IconCheck size={13} strokeWidth={3} />
                    ) : (
                      <IconPencil size={13} />
                    )}
                  </span>
                  <span
                    className={`flex-1 text-sm ${otherActive[currentStep] ? "text-primary font-medium" : "text-muted-foreground"}`}
                  >
                    Other...
                  </span>
                </div>
                {otherActive[currentStep] && (
                  <div
                    className={`${LIST_ROW_CONTROL_CLASS} mt-2 ml-9 animate-in fade-in slide-in-from-top-1 duration-150`}
                  >
                    <Input
                      value={customAnswers[currentStep] ?? ""}
                      onChange={(e) =>
                        setCustomAnswers((prev) => ({
                          ...prev,
                          [currentStep]: e.target.value,
                        }))
                      }
                      placeholder="Type your answer..."
                      disabled={isLoading}
                      autoFocus
                      className="h-8 text-sm bg-background border-border shadow-none"
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          currentHasAnswer &&
                          !isLoading
                        ) {
                          handleNext();
                        }
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </m.div>
      </AnimatePresence>

      <div className="flex gap-2 items-center">
        {isMultiStep && currentStep > 0 && (
          <Button
            variant="ghost"
            className="flex-1"
            onClick={handleBack}
            disabled={isLoading}
          >
            <IconArrowLeft size={15} strokeWidth={2.5} className="mr-1" />
            Back
          </Button>
        )}
        <Button
          className="flex-1"
          onClick={handleNext}
          disabled={!currentHasAnswer || isLoading}
        >
          {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
          {isLastStep ? "Submit" : "Next"}
          {!isLoading && (
            <IconArrowRight size={15} strokeWidth={2.5} className="ml-1" />
          )}
        </Button>
        {trailingControls}
      </div>
    </div>
  );
}
