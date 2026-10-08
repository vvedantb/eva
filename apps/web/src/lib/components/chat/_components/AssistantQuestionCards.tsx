import { ActivityQuestionCard, type ActivityStep } from "@eva/ui";

/**
 * Read-only record of the AskUserQuestion prompts this turn asked, and what the
 * user chose. Rendered in the message body (not the activity fold) because the
 * options and the answer are user-facing content, not tooling detail.
 */
export function AssistantQuestionCards({ steps }: { steps: ActivityStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="my-2 space-y-2">
      {steps.map((step, index) => (
        <ActivityQuestionCard
          key={step.toolUseId ?? index}
          questions={step.questions ?? []}
          {...(step.answers ? { answers: step.answers } : {})}
        />
      ))}
    </div>
  );
}
