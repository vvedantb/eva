"use client";

import { useState } from "react";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "../utils/cn";
import { Slider } from "../ui/slider";
import type { ModelOption } from "./model-picker-types";

/**
 * Discrete capability slider for simple view. Ticks are the available ladder
 * models, cheapest on the left. Resting chrome is Advanced; a held drag swaps
 * that for Faster / Smarter so the thumb is the only control.
 */
export function SimpleModelLadder<TModel extends string>({
  value,
  steps,
  snappedId,
  disabled,
  onValueChange,
  onAdvanced,
}: {
  value: TModel;
  steps: ReadonlyArray<ModelOption<TModel>>;
  /** Ladder id to park the thumb on when `value` is off-ladder. */
  snappedId: TModel;
  disabled?: boolean;
  onValueChange: (model: TModel) => void;
  onAdvanced: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const lastIndex = steps.length - 1;
  let index = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step && (step.id === value || step.id === snappedId)) {
      index = i;
      if (step.id === value) break;
    }
  }
  const selected = steps[index];

  const applyIndex = (next: number) => {
    const step = steps[next];
    if (!step) return;
    onValueChange(step.id);
  };

  return (
    <div className="flex flex-col gap-3">
      <Slider
        min={0}
        max={lastIndex}
        step={1}
        value={[index]}
        disabled={disabled || lastIndex <= 0}
        aria-label="Model"
        aria-valuetext={selected?.label}
        onValueChange={(values) => {
          const next = values[0];
          if (next === undefined) return;
          applyIndex(next);
        }}
        onPointerDown={() => setDragging(true)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onValueCommit={() => setDragging(false)}
      >
        <div className="pointer-events-none absolute inset-x-4 top-1/2 h-5 -translate-y-1/2">
          {steps.map((step, tickIndex) => (
            <span
              key={step.id}
              className={cn(
                "absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                tickIndex === index
                  ? "opacity-0"
                  : tickIndex < index
                    ? "bg-primary-foreground/55"
                    : "bg-muted-foreground/40",
              )}
              style={{
                left: `${lastIndex <= 0 ? 0 : (tickIndex / lastIndex) * 100}%`,
              }}
              aria-hidden
            />
          ))}
        </div>
      </Slider>
      <div className="flex min-h-5 items-center">
        {dragging ? (
          <div className="flex w-full justify-between text-2xs font-medium text-muted-foreground">
            <span>Faster</span>
            <span>Smarter</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAdvanced}
            className="motion-press inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground active:scale-[0.98]"
          >
            Advanced
            <IconChevronRight size={12} className="opacity-70" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
