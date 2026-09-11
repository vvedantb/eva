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
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";

const TOTAL = 141;

interface Segment {
  label: string;
  count: number;
  /** Bar fill. The done segment carries the brand gradient. */
  fill: string;
  /** Legend swatch, kept separate so faint fills stay visible at 12 px. */
  swatch: string;
}

/** Left to right, in the order the bar reads. */
const SEGMENTS: Segment[] = [
  {
    label: "Done",
    count: 29,
    fill: "bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8]",
    swatch: "bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8]",
  },
  {
    label: "Waiting in code review",
    count: 43,
    fill: "bg-white/70",
    swatch: "bg-white/70",
  },
  {
    label: "Business check",
    count: 14,
    fill: "bg-white/35",
    swatch: "bg-white/35",
  },
  {
    label: "Not started",
    count: 25,
    fill: "bg-white/15",
    swatch: "bg-white/15",
  },
  {
    label: "Cancelled",
    count: 30,
    fill: "bg-white/[0.07]",
    swatch: "bg-white/[0.12]",
  },
];

const REVIEW_INDEX = 1;

const percent = (count: number) => (count / TOTAL) * 100;

/** Where the review segment sits, so the glow can line up behind it. */
const sumPercent = (segments: Segment[]) =>
  segments.reduce((total, segment) => total + percent(segment.count), 0);

const REVIEW_LEFT = sumPercent(SEGMENTS.slice(0, REVIEW_INDEX));
const REVIEW_WIDTH = sumPercent(SEGMENTS.slice(REVIEW_INDEX, REVIEW_INDEX + 1));

const NEXT_STEPS = [
  "Model reviews first",
  "Ready means merge",
  "Deploys itself",
  "People watch the irreversible",
];

export function Slide11WhatsNext() {
  const step = useDeckStep();

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>What&apos;s next</Kicker>
        <Title size="md">The bottleneck has moved.</Title>
        <Body className="mt-4 max-w-4xl text-lg">
          Eva now finishes work faster than we can check it in. On CarePulse the
          queue is the review, not the build.
        </Body>
      </Reveal>

      <div className="mt-8 flex items-start gap-12">
        <div className="w-[600px]">
          <CountUp
            value={TOTAL}
            className="text-6xl font-semibold tabular-nums"
          />
          <div className="mt-1 text-sm text-white/50">
            quick tasks raised on CarePulse since June
          </div>

          <div className="relative mt-6">
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

            <div className="relative flex h-10 overflow-hidden rounded-full">
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
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/55">
            {SEGMENTS.map((segment) => (
              <div key={segment.label} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`size-2.5 rounded-full ${segment.swatch}`}
                />
                {segment.label} · {segment.count}
              </div>
            ))}
          </div>
        </div>

        <Reveal step={1} className="w-[380px]" from="right">
          <Card>
            <CountUp
              value={43}
              step={1}
              className="text-5xl font-semibold tabular-nums"
            />
            <div className="mt-2 text-[15px] leading-snug text-white/75">
              bundles of finished work waiting for a human to merge them
            </div>
            <div className="mt-3 text-xs text-white/45">
              That is more than the 29 already merged.
            </div>
          </Card>
        </Reveal>
      </div>

      <Reveal step={2} className="mt-8">
        <Card className="p-5">
          <div className="text-sm font-medium text-white/85">
            Next: give CarePulse the same pipeline as Eva
          </div>
          <Stagger
            step={2}
            staggerChildren={0.08}
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            {NEXT_STEPS.map((label, index) => (
              <StaggerItem key={label} className="flex items-center gap-2">
                {index > 0 ? (
                  <IconArrowRight size={16} className="text-white/35" />
                ) : null}
                <span className="rounded-full bg-white/[0.07] px-3 py-1 text-sm text-white/80">
                  {label}
                </span>
              </StaggerItem>
            ))}
          </Stagger>
          <div className="mt-3 text-xs text-white/45">
            The same automations that already run Eva&apos;s own releases (slide
            6), applied to CarePulse.
          </div>
        </Card>
      </Reveal>

      <Footnote>
        Counts are CarePulse quick tasks created in Eva between 1 June and 10
        September 2026, by status on 11 September 2026.
      </Footnote>
    </Shell>
  );
}
