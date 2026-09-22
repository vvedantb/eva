import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { IconChevronDown } from "@tabler/icons-react";
import {
  AI_MODEL_OPTIONS,
  SIMPLE_VIEW_MODEL_LADDER,
  getSimpleViewModelOptions,
  snapToSimpleViewLadder,
  type AIModel,
  type StoredModelTraits,
} from "@eva/backend";
import {
  cn,
  findModelOption,
  ModelPickerContent,
  PromptInputSubmit,
  ProviderIcon,
  SimpleModelLadder,
} from "@eva/ui";
import { ModelTraitsMenu } from "@/lib/components/ModelTraitsMenu";
import { EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";

const FABLE: AIModel = "claude:claude-fable-5-1";

/** The same trimmed set and five ticks the shipped simple view uses. */
const SIMPLE_OPTIONS = getSimpleViewModelOptions(AI_MODEL_OPTIONS, FABLE);
const LADDER_STEPS = SIMPLE_VIEW_MODEL_LADDER.flatMap((id) =>
  SIMPLE_OPTIONS.filter((option) => option.id === id),
);
const FIRST_STEP = LADDER_STEPS[0]?.id ?? FABLE;

const PANEL_TRANSITION = { duration: 0.5, ease: EASE_OUT };

function Toggle({ simple }: { simple: boolean }) {
  return (
    <div className="flex rounded-full bg-white/[0.06] p-[3px] text-xs">
      {["Before", "After"].map((label) => {
        const on = (label === "After") === simple;
        return (
          <span key={label} className="relative w-[52px] py-1 text-center">
            {on ? (
              <m.span
                layoutId="model-picker-toggle-thumb"
                className="absolute inset-0 rounded-full bg-white/[0.14]"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            ) : null}
            <span
              className={cn("relative", on ? "text-white" : "text-white/40")}
            >
              {label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * The composer's under-bar: the real model trigger markup (provider icon,
 * model label, chevron) sitting under a stand-in prompt box, so the panel above
 * reads as an open picker rather than a floating list.
 */
function ComposerBar({ model }: { model: AIModel }) {
  const option = findModelOption(model, AI_MODEL_OPTIONS);
  return (
    <div className="w-full">
      <div className="flex items-center gap-2 rounded-t-surface rounded-b-md bg-card px-3 py-2.5">
        <span className="flex-1 text-sm text-muted-foreground">
          Ask Eva to build something…
        </span>
        <PromptInputSubmit />
      </div>
      <div className="mx-auto flex w-[calc(100%-1.5rem)] items-center gap-0.5 rounded-b-surface bg-muted/70 px-2 py-0.5">
        <span className="ml-auto flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground">
          <ProviderIcon provider={option?.provider ?? "claude"} size={14} />
          <span className="whitespace-nowrap">
            {option?.label ?? "Select model"}
          </span>
          <IconChevronDown
            size={12}
            className="shrink-0 opacity-60"
            aria-hidden
          />
        </span>
      </div>
    </div>
  );
}

/**
 * Walks the ladder thumb from the cheapest tick up to Fable shortly after the
 * card mounts, so the audience sees the slider move rather than a static card.
 */
function scheduleLadderWalk(onStep: (model: AIModel) => void): () => void {
  const timeouts: number[] = [];
  LADDER_STEPS.forEach((step, index) => {
    if (index === 0) return;
    timeouts.push(window.setTimeout(() => onStep(step.id), 500 + index * 130));
  });
  return () => {
    for (const id of timeouts) window.clearTimeout(id);
  };
}

/**
 * The shipped ladder names no models — a presenter's audience would see five
 * dots. These labels sit under the card, on the deck side only, and come from
 * the same options the ladder gets so they cannot drift. The 28px gutter is the
 * card's padding plus the slider's own `inset-x-4`, so each label centres on
 * its tick.
 */
function LadderLabels({ selected }: { selected: AIModel }) {
  const lastIndex = LADDER_STEPS.length - 1;
  return (
    <div className="mx-7">
      <div className="relative h-4">
        {LADDER_STEPS.map((step, index) => (
          <span
            key={step.id}
            className={cn(
              "absolute -translate-x-1/2 text-xs whitespace-nowrap",
              step.id === selected ? "font-medium text-white" : "text-white/50",
            )}
            style={{
              left: `${lastIndex <= 0 ? 0 : (index / lastIndex) * 100}%`,
            }}
          >
            {step.label}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-white/40">
        <span>Faster</span>
        <span>Smarter</span>
      </div>
    </div>
  );
}

/**
 * The list autofocuses its search box, which would swallow the deck's arrow
 * keys. Hand focus back to the deck root once that settles.
 */
function releaseFocusToDeck(node: HTMLDivElement): () => void {
  const timeout = window.setTimeout(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (!node.contains(active)) return;
    const deck = node.closest("[tabindex]");
    if (deck instanceof HTMLElement) deck.focus();
  }, 120);
  return () => window.clearTimeout(timeout);
}

/**
 * The real picker, not a drawing: step 0 is `ModelPickerContent` over the full
 * model list, step 1 is the shipped `SimpleModelLadder`. Rendered inline
 * because a Radix popover would portal out of the deck's scaled stage.
 */
export function RealModelPicker() {
  const simple = useDeckStep() >= 1;
  const [model, setModel] = useState<AIModel>(FABLE);
  const [traits, setTraits] = useState<StoredModelTraits>({});
  // Stable ref callbacks: an inline one is re-attached on every render, which
  // would restart the walk (and the state it sets) forever.
  const [ladderRef] = useState(() => (node: HTMLDivElement | null) => {
    if (!node) return;
    setModel(FIRST_STEP);
    return scheduleLadderWalk(setModel);
  });
  const [listRef] = useState(() => (node: HTMLDivElement | null) => {
    if (!node) return;
    return releaseFocusToDeck(node);
  });

  return (
    <div
      className="flex w-[440px] flex-col gap-3"
      // The deck advances on a stage click; inside the panel a click is a pick.
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white/70">Model</span>
        <Toggle simple={simple} />
      </div>

      <m.div
        layout
        transition={PANEL_TRANSITION}
        className="dark flex flex-col gap-2"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {simple ? (
            <m.div
              key="ladder"
              layout
              className="flex w-full flex-col gap-3"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={PANEL_TRANSITION}
              ref={ladderRef}
            >
              <div className="w-full rounded-lg bg-popover p-3 text-popover-foreground smooth-shadow-ring-lg">
                <SimpleModelLadder
                  value={model}
                  steps={LADDER_STEPS}
                  snappedId={snapToSimpleViewLadder(model)}
                  onValueChange={setModel}
                  onAdvanced={() => undefined}
                />
              </div>
              <LadderLabels selected={snapToSimpleViewLadder(model)} />
            </m.div>
          ) : (
            <m.div
              key="list"
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={PANEL_TRANSITION}
              ref={listRef}
            >
              <ModelPickerContent
                value={model}
                accountId={null}
                options={AI_MODEL_OPTIONS}
                onSelect={(modelId) => setModel(modelId)}
                header={
                  <ModelTraitsMenu
                    model={model}
                    traits={traits}
                    onChange={(partial) =>
                      setTraits((prev) => ({ ...prev, ...partial }))
                    }
                  />
                }
              />
            </m.div>
          )}
        </AnimatePresence>

        <ComposerBar model={model} />
      </m.div>
    </div>
  );
}
