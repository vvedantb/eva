import { cn } from "@eva/ui";

const STEP_LABELS = [
  "How Eva works",
  "Your role",
  "Theme",
  "Typography",
  "Updates",
] as const;

interface WelcomeSetupStepIndicatorProps {
  currentStep: number;
}

export function WelcomeSetupStepIndicator({
  currentStep,
}: WelcomeSetupStepIndicatorProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {STEP_LABELS.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = currentStep === stepNumber;
        const isComplete = currentStep > stepNumber;

        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-[background-color,color]",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isComplete
                    ? "bg-primary/15 text-primary"
                    : "bg-muted/60 text-muted-foreground",
              )}
            >
              {stepNumber}
            </div>
            <span
              className={cn(
                "whitespace-nowrap text-xs",
                isActive
                  ? "font-medium text-foreground"
                  : // Five labelled chips wrap to five lines on a phone, so
                    // below `sm` only the current step keeps its label.
                    "hidden text-muted-foreground sm:inline",
              )}
            >
              {label}
            </span>
            {index < STEP_LABELS.length - 1 ? (
              <div
                aria-hidden
                className={cn(
                  "mx-1 hidden h-px w-6 sm:block",
                  isComplete ? "bg-primary/30" : "bg-muted/60",
                )}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
