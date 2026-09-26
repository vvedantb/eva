import { IconCheck } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  BRAND_GRADIENT,
  DUR,
  EASE,
  MaskedText,
  Spotlight,
  cueTransition,
} from "../../_components/motion";
import { AnnBExpiryDial } from "../_parts/AnnBDials";
import { MOA3_GATES_SHUT, MoA3Gates } from "../_parts/MoA3Gates";

/** Shortest first: nothing on this slide lives longer than it needs to. */
const LIFETIMES: readonly { value: number; unit: string; label: string }[] = [
  { value: 5, unit: "minutes", label: "Sign-in code" },
  { value: 1, unit: "hour", label: "Access pass" },
  { value: 30, unit: "days", label: "Renewal" },
];

/** Each check lands as its gate shuts: the outer ring first, the inner after. */
const CHECKS: readonly { text: string; at: number }[] = [
  { text: "Checked at the door", at: 0.55 },
  { text: "Checked again at the data", at: MOA3_GATES_SHUT - 0.05 },
];

/** How far the light's box overhangs the content, so its glow is never clipped. */
const BLEED = 320;
/** The light sits under the dials, then drops to the gates. */
const LIGHT = [
  null,
  { x: BLEED + 544, y: BLEED + 90, size: 760 },
  { x: BLEED + 470, y: BLEED + 330, size: 520 },
];

function CheckLine({ text, at }: { text: string; at: number }) {
  const on = useDeckStep() >= 2;
  return (
    <div className="flex items-center gap-4 text-xl text-white/85">
      <m.span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: BRAND_GRADIENT }}
        initial={{ opacity: 0, scale: 0.4, rotate: -30 }}
        animate={
          on
            ? { opacity: 1, scale: 1, rotate: 0 }
            : { opacity: 0, scale: 0.4, rotate: -30 }
        }
        transition={cueTransition(on, at, {
          duration: DUR.slow,
          ease: EASE.expo,
        })}
      >
        <IconCheck size={15} stroke={3} />
      </m.span>
      <MaskedText step={2} delay={at + 0.08}>
        {text}
      </MaskedText>
    </div>
  );
}

export function AnnualMcpSecurity() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Platform · Access</Kicker>
        <Title size="md">Locked down by design.</Title>
      </Reveal>

      <div className="relative isolate mt-12">
        <div
          className="pointer-events-none absolute isolate -z-10"
          style={{ inset: -BLEED }}
        >
          <Spotlight shots={LIGHT} />
        </div>

        <div className="flex justify-center gap-28">
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

        <div className="mt-12 flex items-center justify-center gap-14">
          <MoA3Gates step={2} />

          <div className="flex flex-col gap-5">
            {CHECKS.map((check) => (
              <CheckLine key={check.text} text={check.text} at={check.at} />
            ))}
          </div>
        </div>
      </div>

      <Footnote>Security model documented in the repository.</Footnote>
    </Shell>
  );
}
