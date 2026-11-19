"use client";

import { MultipleChoiceQuestion } from "@/lib/components/plan/MultipleChoiceQuestion";
import type { ParsedQuestion } from "@eva/shared/pendingQuestion";

interface ChatQuestionDockProps {
  questions: ParsedQuestion[];
  onAnswer: (answer: string) => Promise<void>;
  /**
   * Set for a blocking AskUserQuestion: the answer resumes the paused turn as a
   * tool_result instead of being sent as a new chat message.
   */
  onAnswerStructured?: (answers: Record<string, string>) => Promise<void>;
  isLoading: boolean;
}

/**
 * The pending-question card, docked in the composer's slot instead of rendered
 * inline under the assistant bubble. The composer is hidden while a question is
 * open, so the answer UI has to own that fixed spot — inline it scrolled away
 * with the conversation. Padding matches ChatComposer's outer wrapper so the
 * swap does not shift the pane; long option lists scroll inside the card rather
 * than pushing the conversation out of view.
 */
export function ChatQuestionDock({
  questions,
  onAnswer,
  onAnswerStructured,
  isLoading,
}: ChatQuestionDockProps) {
  return (
    <div className="p-3 md:p-4 max-w-3xl mx-auto w-full">
      <div className="max-h-[min(60dvh,34rem)] overflow-y-auto rounded-surface bg-card p-3">
        <MultipleChoiceQuestion
          // Reset selections when the agent moves on to a different question set.
          key={questions.map((question) => question.question).join("\u0000")}
          questions={questions}
          onAnswer={onAnswer}
          {...(onAnswerStructured ? { onAnswerStructured } : {})}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
