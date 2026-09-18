import type { ReactNode } from "react";
import {
  IconCheck,
  IconMessageQuestion,
  IconPencil,
} from "@tabler/icons-react";

import { Badge } from "../ui/badge";
import { cn } from "../utils/cn";
import type { ActivityQuestion } from "./activity-shared";

const OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const CHIP_CLASS =
  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-wide";

/**
 * The offered labels the user picked. A whole-answer match wins first so a
 * single-select label containing ", " is not mistaken for several picks; only
 * a multi-select answer is split on the ", " the dock joins it with.
 */
function selectedLabels(
  answer: string | undefined,
  question: ActivityQuestion,
): string[] {
  if (answer === undefined) return [];
  const offered = new Set(question.options.map((option) => option.label));
  if (offered.has(answer)) return [answer];
  if (!question.multiSelect) return [];
  return answer.split(", ").filter((label) => offered.has(label));
}

/** Free text typed into "Other": an answer that matches no offered label. */
function freeTextAnswer(
  answer: string | undefined,
  chosen: string[],
): string | null {
  if (answer === undefined || answer.trim().length === 0) return null;
  return chosen.length > 0 ? null : answer;
}

function OptionRow({
  chip,
  label,
  description,
  isSelected,
}: {
  chip: ReactNode;
  label: string;
  description?: string;
  isSelected: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md px-2 py-1.5",
        isSelected ? "bg-accent" : undefined,
      )}
    >
      <span
        className={cn(
          CHIP_CLASS,
          isSelected
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-muted-foreground",
        )}
      >
        {chip}
      </span>
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            "text-sm leading-snug",
            isSelected
              ? "font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Read-only record of an AskUserQuestion prompt and the answer given. The live
 * prompt is `MultipleChoiceQuestion` in the composer dock; this is the history
 * left behind in the transcript once the question is answered.
 */
export function ActivityQuestionCard({
  questions,
  answers,
}: {
  questions: ActivityQuestion[];
  answers?: Record<string, string>;
}) {
  if (questions.length === 0) return null;

  return (
    <div className="rounded-surface bg-card p-3 space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <IconMessageQuestion size={14} />
        {questions.length > 1 ? "Questions" : "Question"}
      </div>
      {questions.map((question, questionIndex) => {
        const answer = answers?.[question.question];
        const hasAnswer = answer !== undefined && answer.trim().length > 0;
        const chosen = selectedLabels(answer, question);
        const freeText = freeTextAnswer(answer, chosen);
        return (
          <div
            key={`${question.question}-${questionIndex}`}
            className="space-y-1.5"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground">
                {question.question}
              </p>
              {question.header ? (
                <Badge
                  variant="secondary"
                  className="shrink-0 text-[10px] font-semibold"
                >
                  {question.header}
                </Badge>
              ) : null}
            </div>
            <div className="space-y-0.5">
              {question.options.map((option, optionIndex) => {
                const isSelected = chosen.includes(option.label);
                return (
                  <OptionRow
                    key={`${option.label}-${optionIndex}`}
                    chip={
                      isSelected ? (
                        <IconCheck size={12} strokeWidth={3} />
                      ) : (
                        (OPTION_LETTERS[optionIndex] ?? String(optionIndex + 1))
                      )
                    }
                    label={option.label}
                    description={option.description}
                    isSelected={isSelected}
                  />
                );
              })}
              {freeText ? (
                <OptionRow
                  chip={<IconPencil size={12} strokeWidth={3} />}
                  label="Other"
                  description={freeText}
                  isSelected
                />
              ) : null}
            </div>
            {hasAnswer ? null : (
              <p className="text-xs text-muted-foreground">
                Answered in the next message
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
