import { m } from "motion/react";
import {
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { AnnBExpiryDial, AnnBGates } from "../_parts/AnnBDials";

/** Shortest first: nothing on this slide lives longer than it needs to. */
const LIFETIMES: readonly { value: number; unit: string; label: string }[] = [
  { value: 5, unit: "minutes", label: "Sign-in code" },
  { value: 1, unit: "hour", label: "Access pass" },
  { value: 30, unit: "days", label: "Renewal" },
];

const CHECKS: readonly string[] = [
  "Checked at the door",
  "Checked again at the data",
];

export function AnnualMcpSecurity() {
  const closing = useDeckStep() >= 2;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Security</Kicker>
        <Title size="md">Locked down by design.</Title>
      </Reveal>

      <div className="mt-12 flex justify-center gap-28">
        {LIFETIMES.map((lifetime, index) => (
          <AnnBExpiryDial
            key={lifetime.label}
            value={lifetime.value}
            unit={lifetime.unit}
            label={lifetime.label}
            index={index}
            step={1}
          />
        ))}
      </div>

      <div className="mt-12 flex items-center justify-center gap-12">
        <AnnBGates step={2} />

        <div className="flex flex-col gap-4">
          {CHECKS.map((check, index) => (
            <m.div
              key={check}
              className="flex items-center gap-3 text-xl text-white/85"
              initial={{ opacity: 0, x: -12 }}
              animate={closing ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
              transition={
                closing
                  ? {
                      type: "spring",
                      bounce: 0,
                      duration: 0.5,
                      delay: 0.35 + index * 0.28,
                    }
                  : { duration: 0.25, ease: EASE_OUT }
              }
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-white/50"
                aria-hidden
              />
              {check}
            </m.div>
          ))}
        </div>
      </div>

      <Footnote>Security model documented in the repository.</Footnote>
    </Shell>
  );
}
