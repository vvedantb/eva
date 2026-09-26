import { IconCheck, IconMinus } from "@tabler/icons-react";
import { m } from "motion/react";
import { motionSpring } from "@eva/ui";
import { CountUp } from "../../_components/CountUp";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  Accent,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

/** Reading order: left to right, three per row. */
const CAPABILITIES = [
  "Owns technical design",
  "Understands trade-offs",
  "Debugs without flailing",
  "A skill beyond coding",
  "Breaks down large problems",
  "Improves the process",
  "Mentors and onboards",
  "Business and user empathy",
  "Identifies work to do",
];

const THIN = [
  "Page scores not routine",
  "No on-call grading",
  "No designer or researcher",
];

/**
 * The grid starts as a board seen from slightly above, then straightens as the
 * ticks arrive: all nine evidenced, read square on. It stays there for the thin
 * evidence and the closing figures.
 */
const FRAMEWORK_SHOTS: readonly CameraShot[] = [
  { rotateX: 7, translateZ: -30 },
  {},
  {},
  {},
];

function CapabilityCard({
  name,
  index,
  evidenced,
}: {
  name: string;
  index: number;
  evidenced: boolean;
}) {
  const delay = (evidenced ? 0 : 0.25) + index * 0.06;

  return (
    <m.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: evidenced ? -5 : 0, scale: 1 }}
      transition={{ type: "spring", bounce: 0, duration: 0.55, delay }}
    >
      {/* Its own viewing distance, so the hover tilts the card about its own
          centre rather than the grid's. */}
      <m.div
        style={{ transformPerspective: 900, transformStyle: "preserve-3d" }}
        whileHover={{ rotateX: -6, rotateY: 4, z: 24 }}
        transition={motionSpring}
      >
        <Card className="relative flex h-[68px] items-center p-5">
          <span className="text-base leading-snug font-medium text-white">
            {name}
          </span>
          <m.span
            aria-hidden
            className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8]"
            initial={false}
            animate={{ scale: evidenced ? 1 : 0, opacity: evidenced ? 1 : 0 }}
            transition={{
              type: "spring",
              bounce: 0,
              duration: 0.5,
              delay: evidenced ? index * 0.06 : 0,
            }}
          >
            <IconCheck size={13} stroke={3} className="text-white" />
          </m.span>
        </Card>
      </m.div>
    </m.div>
  );
}

export function AnnualFramework() {
  const step = useDeckStep();
  const evidenced = step >= 1;
  const thinIn = step >= 2;

  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>Against the framework</Kicker>
        <Title size="md">Senior engineer, mapped.</Title>
      </Reveal>

      <Camera shots={FRAMEWORK_SHOTS} className="mt-7">
        <div className="grid grid-cols-3 gap-3 [transform-style:preserve-3d]">
          {CAPABILITIES.map((name, index) => (
            <CapabilityCard
              key={name}
              name={name}
              index={index}
              evidenced={evidenced}
            />
          ))}
        </div>
      </Camera>

      <Reveal step={1} className="mt-3">
        <p className="text-sm text-white/45">
          Every one of these is a slide in this deck.
        </p>
      </Reveal>

      {/* Grid, thin evidence and the closing line sit on one 40px rhythm, which
          leaves the closing line clear of the footnote. */}
      <div className="mt-10">
        <Reveal step={2}>
          <div className="text-xs tracking-[0.18em] text-white/35 uppercase">
            Thin evidence
          </div>
        </Reveal>
        <div className="mt-3 flex gap-3">
          {THIN.map((gap, index) => (
            <m.div
              key={gap}
              initial={false}
              animate={
                thinIn
                  ? { opacity: 1, y: 0, scale: 1 }
                  : { opacity: 0, y: 12, scale: 0.97 }
              }
              transition={{
                type: "spring",
                bounce: 0,
                duration: 0.5,
                delay: thinIn ? index * 0.08 : 0,
              }}
              className="flex items-center gap-2 rounded-full bg-white/[0.05] px-4 py-2 text-sm text-white/50"
            >
              <IconMinus size={15} stroke={2} aria-hidden />
              {gap}
            </m.div>
          ))}
        </div>
      </div>

      <Reveal step={3} className="mt-10">
        <p className="text-center text-2xl text-white/85">
          <span className="text-5xl leading-[1.3] font-semibold tracking-tight">
            <Accent>
              <CountUp value={4732} step={3} />
            </Accent>
          </span>{" "}
          changes.{" "}
          <span className="text-5xl leading-[1.3] font-semibold tracking-tight">
            <Accent>
              <CountUp value={1348} step={3} />
            </Accent>
          </span>{" "}
          sets of release notes. All written down at the time.
        </p>
      </Reveal>

      <Footnote>
        Evidence from the repository and Eva&apos;s own records, 11 January to
        16 September 2026.
      </Footnote>
    </Shell>
  );
}
