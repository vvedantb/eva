import { useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { ActivityQuestionCard, Button } from "@vvedantb/ui";
import type { ActivityStep } from "@vvedantb/ui";

/**
 * Read-only record of one AskUserQuestion prompt and what the user chose. A
 * prompt with several questions shows one at a time, paged with back / next
 * arrows and an "n/total" count, like the live dock.
 */
export function AssistantQuestionRecord({ step }: { step: ActivityStep }) {
  const questions = step.questions ?? [];
  const [index, setIndex] = useState(0);
  const current = questions[index];
  if (!current) return null;
  const total = questions.length;
  return (
    <div className="my-2">
      <ActivityQuestionCard
        questions={[current]}
        {...(step.answers ? { answers: step.answers } : {})}
        headerAction={
          total > 1 ? (
            <>
              <span className="mr-1 text-2xs font-medium tabular-nums text-muted-foreground">
                {index + 1}/{total}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Previous question"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <IconChevronLeft size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Next question"
                disabled={index === total - 1}
                onClick={() => setIndex(index + 1)}
              >
                <IconChevronRight size={14} />
              </Button>
            </>
          ) : undefined
        }
      />
    </div>
  );
}

/**
 * Every answered prompt of a turn, for surfaces with no step timeline to
 * place them in (the coordinator bubble, simple view). Rendered in the
 * message body because the options and answer are user-facing content.
 */
export function AssistantQuestionCards({ steps }: { steps: ActivityStep[] }) {
  if (steps.length === 0) return null;
  return (
    <>
      {steps.map((step, index) => (
        <AssistantQuestionRecord key={step.toolUseId ?? index} step={step} />
      ))}
    </>
  );
}
