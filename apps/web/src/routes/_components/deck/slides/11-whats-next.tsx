import { IconArrowRight } from "@tabler/icons-react";
import { m } from "motion/react";
import { CountUp } from "../_components/CountUp";
import {
  Body,
  Card,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";

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

const NEXT_STEPS: readonly string[] = [
  "Model reviews first",
  "Ready means merge",
  "Deploys itself",
  "People watch the irreversible",
];

export function Slide11WhatsNext() {
  const step = useDeckStep();

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>What&apos;s next</Kicker>
        <Title size="md">The bottleneck has moved.</Title>
        <Body className="mt-4 max-w-3xl text-lg text-pretty">
          Eva finishes work faster than we can check it in.
        </Body>
      </Reveal>

      <div className="mt-14 grid grid-cols-[640px_1fr] gap-16">
        <div>
          <CountUp
            value={TOTAL}
            className="text-7xl leading-none font-semibold tabular-nums"
          />
          <div className="mt-3 text-base text-white/50">
            quick tasks on CarePulse since June
          </div>

          <div className="relative mt-8">
            {step >= 1 ? (
              <m.div
                aria-hidden
                className="pointer-events-none absolute -inset-y-5 rounded-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8] blur-lg"
                style={{
                  left: `${REVIEW_LEFT}%`,
                  width: `${REVIEW_WIDTH}%`,
                }}
                initial={{ opacity: 0.3 }}
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            ) : null}

            <div className="relative flex h-12 overflow-hidden rounded-full">
              {SEGMENTS.map((segment, index) => (
                <m.div
                  key={segment.label}
                  className={`h-full origin-left ${segment.fill}`}
                  style={{ width: `${percent(segment.count)}%` }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{
                    duration: 0.6,
                    ease: EASE_OUT,
                    delay: 0.3 + index * 0.12,
                  }}
                />
              ))}

              {/* The only segment worth naming, named where it sits. */}
              <m.div
                className="pointer-events-none absolute inset-y-0 flex items-center justify-center text-sm font-medium tabular-nums text-black/70"
                style={{
                  left: `${REVIEW_LEFT}%`,
                  width: `${REVIEW_WIDTH}%`,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, ease: EASE_OUT, delay: 1.1 }}
              >
                In review · 43
              </m.div>
            </div>
          </div>
        </div>

        <Reveal step={1} from="right">
          <Card>
            <CountUp
              value={43}
              step={1}
              className="text-6xl leading-none font-semibold tabular-nums"
            />
            <div className="mt-4 text-lg leading-snug text-pretty text-white/75">
              finished bundles waiting for a human
            </div>
          </Card>
        </Reveal>
      </div>

      <div className="mt-20 flex items-center gap-3">
        {NEXT_STEPS.map((label, index) => (
          <m.div
            key={label}
            className="flex items-center gap-3"
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={
              step >= 2
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 14, scale: 0.94 }
            }
            transition={{
              type: "spring",
              bounce: 0,
              duration: 0.55,
              delay: step >= 2 ? index * 0.08 : 0,
            }}
          >
            {index > 0 ? (
              <IconArrowRight size={18} className="text-white/35" aria-hidden />
            ) : null}
            <span className="rounded-full bg-white/[0.07] px-5 py-2.5 text-base text-white/80">
              {label}
            </span>
          </m.div>
        ))}
      </div>

      <Footnote>
        Counts are CarePulse quick tasks created in Eva between 1 June and 10
        September 2026, by status on 11 September 2026.
      </Footnote>
    </Shell>
  );
}
