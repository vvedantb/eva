"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { FIELD_TRIGGER_CLASS } from "@/lib/components/fields/FieldsSection";
import {
  phaseConfig,
  ACTIVE_PROJECT_PHASES,
  type ProjectPhase,
} from "../ProjectPhaseBadge";

/**
 * Editable status (phase) dropdown. Controlled: the parent owns the mutation.
 * Only offers active phases (ACTIVE_PROJECT_PHASES) as targets — draft and
 * finalized are driven by the planning flow and rendered as a read-only badge
 * by the parent, so `value` here is always one of the offered options.
 */
export function ProjectPhaseSelect({
  value,
  onChange,
}: {
  value: ProjectPhase;
  onChange: (phase: ProjectPhase) => void;
}) {
  const config = phaseConfig[value];
  const Icon = config.icon;

  return (
    <Select
      value={value}
      onValueChange={(val) => {
        const matched = ACTIVE_PROJECT_PHASES.find((p) => p === val);
        if (matched) onChange(matched);
      }}
    >
      <SelectTrigger className={FIELD_TRIGGER_CLASS}>
        <SelectValue>
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={value}
              className={`flex items-center gap-1.5 ${config.text}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              <Icon size={14} />
              <span>{config.label}</span>
            </m.div>
          </AnimatePresence>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Status</SelectLabel>
          {ACTIVE_PROJECT_PHASES.map((p) => {
            const phaseOption = phaseConfig[p];
            const PhaseIcon = phaseOption.icon;
            return (
              <SelectItem key={p} value={p}>
                <div
                  className={`flex items-center gap-1.5 ${phaseOption.text}`}
                >
                  <PhaseIcon size={14} />
                  <span>{phaseOption.label}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
