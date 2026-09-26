import { m } from "motion/react";
import { cn } from "@eva/ui";
import { accentSliceStyle } from "../../_components/DeckAccent";
import {
  Footnote,
  Kicker,
  Reveal,
  Shell,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  BRAND,
  DUR,
  DrawPath,
  EASE,
  MaskedText,
  cueTransition,
} from "../../_components/motion";

interface Moment {
  date: string;
  label: string;
}

const MOMENTS: readonly Moment[] = [
  { date: "3 June 2026", label: "The repository moved" },
  { date: "24 July 2026", label: "Packages renamed to match" },
];

const WORD_CLASS =
  "text-8xl leading-none font-semibold tracking-[-0.03em] text-white";

/** Painted once; it only scales and fades. */
const GLOW = `radial-gradient(closest-side, ${BRAND.purple}40, ${BRAND.blue}14 55%, transparent)`;

/**
 * One word, one mask per letter. `on` brings the letters up from below; off,
 * they sink back, or lift out through the top with `leaveUp`. `gradient` paints each letter its own slice
 * of the brand gradient, so the sweep stays whole while the letters move.
 */
function Letters({
  word,
  on,
  delay,
  gradient = false,
  leaveUp = false,
}: {
  word: string;
  on: boolean;
  delay: number;
  gradient?: boolean;
  /** Leave through the top (handing over) rather than sinking back down. */
  leaveUp?: boolean;
}) {
  const chars = [...word];
  return (
    <span
      aria-label={word}
      role="img"
      className={WORD_CLASS}
      style={{ perspective: 600 }}
    >
      {chars.map((char, index) => (
        <span
          key={index}
          aria-hidden
          className="-my-[0.12em] inline-block overflow-hidden py-[0.12em]"
        >
          <m.span
            className={cn(
              "inline-block origin-bottom",
              gradient && "bg-clip-text text-transparent",
            )}
            style={
              gradient
                ? accentSliceStyle({
                    start: index,
                    length: 1,
                    total: chars.length,
                  })
                : undefined
            }
            initial={{ y: "110%", rotateX: -40 }}
            animate={
              on
                ? { y: "0%", rotateX: 0 }
                : leaveUp
                  ? { y: "-110%", rotateX: 30 }
                  : { y: "110%", rotateX: -40 }
            }
            transition={
              on
                ? {
                    duration: DUR.hero,
                    ease: EASE.expo,
                    delay: delay + index * (gradient ? 0.07 : 0.035),
                  }
                : { duration: 0.45, ease: EASE.in, delay: index * 0.025 }
            }
          >
            {char}
          </m.span>
        </span>
      ))}
    </span>
  );
}

/**
 * The old name leaves letter by letter, lifting out through the top of its
 * masks; the new one rises in behind it. Both stay mounted in one grid cell,
 * so the swap never shifts the layout.
 */
function OldName() {
  return (
    <Letters word="Conductor" on={useDeckStep() < 1} delay={0.2} leaveUp />
  );
}

function NewName() {
  return <Letters word="Eva" on={useDeckStep() >= 1} delay={0.4} gradient />;
}

function NameSwap() {
  const on = useDeckStep() >= 1;
  return (
    <div className="relative isolate grid h-40 place-items-center">
      <m.span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[260px] w-[560px] -translate-x-1/2 -translate-y-1/2"
        style={{ background: GLOW }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={on ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
        transition={cueTransition(on, 0.45, { duration: 1.4, ease: EASE.expo })}
      />
      <div className="[grid-area:1/1]">
        <OldName />
      </div>
      <div className="[grid-area:1/1]">
        <NewName />
      </div>
    </div>
  );
}

/** Two dates joined by a line that draws from one to the next, light first. */
function Moments() {
  const on = useDeckStep() >= 2;
  return (
    <div className="flex items-start gap-10">
      {MOMENTS.map((moment, index) => (
        <div key={moment.date} className="flex items-start gap-10">
          {index > 0 && (
            <DrawPath
              d="M 4 1 L 156 1"
              width={160}
              height={2}
              step={2}
              delay={0.3}
              duration={0.9}
              dot
              className="mt-4"
            />
          )}
          <div className="text-center">
            <div className="text-2xl font-medium tabular-nums text-white">
              <MaskedText step={2} delay={0.1 + index * 0.95}>
                {moment.date}
              </MaskedText>
            </div>
            <m.div
              className="mt-2 text-sm text-white/45"
              initial={{ opacity: 0, y: 6 }}
              animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              transition={cueTransition(on, 0.3 + index * 0.95, {
                duration: DUR.base,
                ease: EASE.out,
              })}
            >
              {moment.label}
            </m.div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnnualRename() {
  return (
    <Shell center className="py-14">
      <Reveal from="none">
        <Kicker>Origin · The name</Kicker>
      </Reveal>

      <NameSwap />

      <Moments />

      <Footnote className="text-center">
        Renamed 3 June 2026; internal packages 24 July 2026.
      </Footnote>
    </Shell>
  );
}
