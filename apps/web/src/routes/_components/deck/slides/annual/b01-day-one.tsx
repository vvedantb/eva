import { m } from "motion/react";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  BRAND,
  DUR,
  EASE,
  MaskedText,
  Sheen,
  cueTransition,
} from "../../_components/motion";
import { MoA1Dot } from "../_parts/MoA1Rail";

interface CommitRow {
  hash: string;
  label: string;
}

/** The first commit, then the two that set the data layer, in order. */
const COMMITS: readonly CommitRow[] = [
  { hash: "5468954a6", label: "The first commit" },
  { hash: "317b85cd5", label: "Projects and tasks schema" },
  { hash: "5467d4ca2", label: "The queries behind it" },
];

/** Row geometry: 64px rows, 12px apart, so node centres sit 76px apart. */
const ROW_H = 64;
const ROW_GAP = 12;
const PITCH = ROW_H + ROW_GAP;
const RAIL_X = 16;
/** Seconds between one commit landing and the next, as the light walks down. */
const BEAT = 0.26;
const LEAD = 0.1;

/**
 * A short git graph. The branch line draws down from the first commit with a
 * light at its head, and each commit lands as the light reaches its node.
 */
function CommitLog() {
  const on = useDeckStep() >= 1;
  const span = (COMMITS.length - 1) * PITCH;
  const travel = cueTransition(on, LEAD, {
    duration: BEAT * (COMMITS.length - 1),
    ease: EASE.inOut,
  });

  return (
    <div className="relative mt-12 w-[800px] pl-12">
      <m.span
        aria-hidden
        className="absolute w-0.5 origin-top rounded-full"
        style={{
          left: RAIL_X - 1,
          top: ROW_H / 2,
          height: span,
          background: `linear-gradient(to bottom, ${BRAND.purple}, ${BRAND.blue})`,
        }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: on ? 1 : 0 }}
        transition={travel}
      />
      <m.span
        aria-hidden
        className="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: RAIL_X,
          top: ROW_H / 2,
          background: `radial-gradient(circle, #fff 0 2px, ${BRAND.blue}aa 4px, transparent 12px)`,
        }}
        initial={{ y: 0, opacity: 0 }}
        animate={on ? { y: span, opacity: [0, 1, 1, 0] } : { y: 0, opacity: 0 }}
        transition={
          on
            ? {
                y: travel,
                opacity: {
                  duration: BEAT * (COMMITS.length - 1) + 0.3,
                  times: [0, 0.1, 0.8, 1],
                  delay: LEAD,
                },
              }
            : { duration: 0 }
        }
      />

      <div className="space-y-3">
        {COMMITS.map((commit, index) => {
          const delay = LEAD + index * BEAT;
          const row = (
            <div className="flex items-center gap-7 rounded-2xl bg-white/[0.05] px-7 py-4">
              <span className="font-mono text-sm tabular-nums text-white/40">
                {commit.hash}
              </span>
              <span className="text-2xl text-white">{commit.label}</span>
            </div>
          );
          return (
            <div key={commit.hash} className="relative">
              <MoA1Dot
                step={1}
                delay={delay}
                size={12}
                // On the rail: 16px into the 48px gutter, so 32px back.
                className="top-1/2 -left-8"
              />
              <m.div
                initial={{ opacity: 0, x: -18 }}
                animate={on ? { opacity: 1, x: 0 } : { opacity: 0, x: -18 }}
                transition={cueTransition(on, delay, {
                  duration: DUR.slow,
                  ease: EASE.expo,
                  opacity: { duration: DUR.base, delay },
                })}
              >
                {/* The data layer is the foundation the closing line names. */}
                {index > 0 ? (
                  <Sheen
                    step={2}
                    delay={0.55 + index * 0.12}
                    className="rounded-2xl"
                  >
                    {row}
                  </Sheen>
                ) : (
                  row
                )}
              </m.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnnualDayOne() {
  return (
    <Shell className="justify-center py-16">
      <Reveal from="none">
        <Kicker>Origin · Day one</Kicker>
      </Reveal>
      <Reveal delay={0.1}>
        <Title size="xl">11 January 2026</Title>
      </Reveal>

      <CommitLog />

      <p className="mt-12 max-w-3xl text-3xl leading-snug text-balance text-white/85">
        <MaskedText step={2} delay={0.15}>
          The foundation it still runs on was <Accent>chosen on day one</Accent>
          .
        </MaskedText>
      </p>

      <Footnote>First commit 11 January 2026.</Footnote>
    </Shell>
  );
}
