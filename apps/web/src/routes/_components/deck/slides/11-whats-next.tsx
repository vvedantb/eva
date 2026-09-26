import { m } from "motion/react";
import {
  Body,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";
import {
  Connector,
  CountRoll,
  DUR,
  EASE,
  LEAVE,
  Sheen,
} from "../_components/motion";
import { MoF3NextSteps } from "./_parts/MoF3NextSteps";

const TOTAL = 141;

interface Segment {
  label: string;
  count: number;
  /** Bar fill. The done segment carries the brand gradient. */
  fill: string;
}

/** Left to right, in the order the bar reads. The full split is in the notes. */
const SEGMENTS: readonly Segment[] = [
  {
    label: "Done",
    count: 29,
    fill: "bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8]",
  },
  { label: "Waiting in code review", count: 43, fill: "bg-white/70" },
  { label: "Business check", count: 14, fill: "bg-white/35" },
  { label: "Not started", count: 25, fill: "bg-white/15" },
  { label: "Cancelled", count: 30, fill: "bg-white/[0.07]" },
];

const REVIEW_INDEX = 1;

const percent = (count: number) => (count / TOTAL) * 100;

/** Where the review segment sits, so the glow and its label line up with it. */
const sumPercent = (segments: readonly Segment[]) =>
  segments.reduce((total, segment) => total + percent(segment.count), 0);

const REVIEW_LEFT = sumPercent(SEGMENTS.slice(0, REVIEW_INDEX));
const REVIEW_WIDTH = sumPercent(SEGMENTS.slice(REVIEW_INDEX, REVIEW_INDEX + 1));

const BAR_COLUMN = 640;
const GRID_GAP = 64;
/** The bar's top edge inside the grid: number, label and margins above it. */
const BAR_TOP = 140;
const REVIEW_CENTRE = ((REVIEW_LEFT + REVIEW_WIDTH / 2) / 100) * BAR_COLUMN;
/** Soft light under the review segment. A painted gradient, never a blur. */
const REVIEW_GLOW =
  "radial-gradient(closest-side, rgba(139,63,184,0.55), rgba(59,125,216,0.25) 55%, transparent)";

function QueueBar({ focused }: { focused: boolean }) {
  return (
    <div className="relative mt-8">
      <m.div
        aria-hidden
        className="pointer-events-none absolute -inset-y-10"
        style={{
          left: `${REVIEW_LEFT - 6}%`,
          width: `${REVIEW_WIDTH + 12}%`,
          background: REVIEW_GLOW,
        }}
        initial={{ opacity: 0 }}
        animate={focused ? { opacity: [0.55, 1, 0.55] } : { opacity: 0 }}
        transition={
          focused
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.3 }
            : LEAVE
        }
      />
      <div className="relative flex h-12 overflow-hidden rounded-full">
        {SEGMENTS.map((segment, index) => (
          <m.div
            key={segment.label}
            className={`h-full origin-left ${segment.fill}`}
            style={{ width: `${percent(segment.count)}%` }}
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{
              scaleX: 1,
              opacity: focused && index !== REVIEW_INDEX ? 0.4 : 1,
            }}
            transition={{
              scaleX: {
                duration: DUR.slow,
                ease: EASE.expo,
                delay: 0.9 + index * 0.1,
              },
              opacity: { duration: DUR.slow, ease: EASE.out },
            }}
          />
        ))}
        <div
          className="pointer-events-none absolute inset-y-0"
          style={{ left: `${REVIEW_LEFT}%`, width: `${REVIEW_WIDTH}%` }}
        >
          <Sheen step={1} delay={0.2} className="size-full">
            {/* The only segment worth naming, named where it sits. */}
            <m.div
              className="flex size-full items-center justify-center text-sm font-medium text-black/70 tabular-nums"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DUR.base, ease: EASE.out, delay: 1.5 }}
            >
              In review · 43
            </m.div>
          </Sheen>
        </div>
      </div>
    </div>
  );
}

export function Slide11WhatsNext() {
  const step = useDeckStep();

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>What&apos;s next · The queue</Kicker>
        <Title size="md">The bottleneck has moved.</Title>
        <Body className="mt-4 max-w-3xl text-lg text-pretty">
          Eva finishes work faster than we can check it in.
        </Body>
      </Reveal>

      <div
        className="relative mt-14 grid"
        style={{ gridTemplateColumns: `${BAR_COLUMN}px 1fr`, gap: GRID_GAP }}
      >
        <div>
          <CountRoll
            value={TOTAL}
            delay={0.5}
            duration={1.6}
            className="text-7xl leading-none font-semibold"
          />
          <m.div
            className="mt-3 text-base text-white/50"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.slow, ease: EASE.out, delay: 0.75 }}
          >
            quick tasks on CarePulse since June
          </m.div>
          <QueueBar focused={step >= 1} />
        </div>

        <Reveal step={1} from="right" delay={0.15} distance={40}>
          <Card>
            <CountRoll
              value={43}
              step={1}
              delay={0.35}
              className="text-6xl leading-none font-semibold"
            />
            <div className="mt-4 text-lg leading-snug text-pretty text-white/75">
              finished bundles waiting for a human
            </div>
          </Card>
        </Reveal>

        {/* The 43 in the bar and the 43 in the card are the same queue. */}
        {/* Gated so the zero-length round cap never shows as a dot at rest. */}
        <m.div
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: step >= 1 ? 1 : 0 }}
          transition={{ duration: 0.01, delay: step >= 1 ? 0.3 : 0 }}
        >
          <Connector
            from={{ x: REVIEW_CENTRE, y: BAR_TOP - 6 }}
            to={{ x: BAR_COLUMN + GRID_GAP - 10, y: 74 }}
            bend={-36}
            step={1}
            delay={0.3}
            flowPeriod={1.3}
          />
        </m.div>
      </div>

      <MoF3NextSteps shown={step >= 2} />

      <Footnote>
        Counts are CarePulse quick tasks created in Eva between 1 June and 10
        September 2026, by status on 11 September 2026.
      </Footnote>
    </Shell>
  );
}
