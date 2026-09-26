import { IconCircleCheckFilled } from "@tabler/icons-react";
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
  CountRoll,
  DUR,
  DrawPath,
  EASE,
  GridBackdrop,
  MaskedText,
} from "../../_components/motion";

interface Stat {
  value: number;
  label: string;
  delay: number;
  accent?: boolean;
}

/** Left to right, biggest number first. */
const STATS: readonly Stat[] = [
  { value: 303, label: "tests", delay: 0.45, accent: true },
  { value: 79, label: "contract tests", delay: 0.6 },
  { value: 46, label: "nightly test backfills", delay: 0.72 },
  { value: 4, label: "custom rules", delay: 0.84 },
];

const RULES = [
  "No unsafe types",
  "Parse at the edge",
  "No banned patterns",
  "Type check before shipping",
  "Release notes",
];

/** Content width inside the Shell gutters. */
const WIDTH = 1088;
/** The check light crosses the row in this long; each gate passes as it arrives. */
const RUN = 1.3;
const RUN_START = 0.1;
/** When the light reaches the centre of gate `index`, on the in-out curve. */
function gateAt(index: number): number {
  const t = (index + 0.5) / RULES.length;
  const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  return RUN_START + eased * RUN;
}

const NUMBER_CLASS = "text-7xl leading-none font-semibold tabular-nums";

export function AnnualQuality() {
  const step = useDeckStep();
  const gated = step >= 1;
  const closing = step >= 2;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Craft · Quality</Kicker>
        <Title size="md">The bar is enforced, not remembered.</Title>
      </Reveal>

      <div className="relative isolate mt-20 grid grid-cols-4 gap-6 py-4">
        <GridBackdrop
          cell={48}
          period={8}
          className="-inset-x-24 -inset-y-10"
        />
        {STATS.map((stat) => (
          <div key={stat.label}>
            <m.div
              aria-hidden
              className="mb-6 h-px w-full origin-left"
              style={{
                background: stat.accent
                  ? `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue} 60%, transparent)`
                  : "linear-gradient(90deg, rgba(255,255,255,0.22), transparent)",
              }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{
                duration: DUR.hero,
                ease: EASE.expo,
                delay: stat.delay - 0.2,
              }}
            />
            <div className={NUMBER_CLASS}>
              {stat.accent ? (
                <Accent>
                  <CountRoll value={stat.value} delay={stat.delay} />
                </Accent>
              ) : (
                <span className="text-white">
                  <CountRoll value={stat.value} delay={stat.delay} />
                </span>
              )}
            </div>
            <m.div
              className="mt-4 text-base text-white/50"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: DUR.slow,
                ease: EASE.out,
                delay: stat.delay + 0.35,
              }}
            >
              {stat.label}
            </m.div>
          </div>
        ))}
      </div>

      {/* The gates: a check light runs the row and each rule passes as it arrives.
          They step back for the closing line; the figures above hold. */}
      <m.div
        initial={false}
        animate={{ opacity: closing ? 0.55 : 1 }}
        transition={{ duration: DUR.slow, ease: EASE.out }}
      >
        <div className="mt-20 grid grid-cols-5 gap-3">
          {RULES.map((rule, index) => {
            const at = gateAt(index);
            return (
              <m.div
                key={rule}
                className="flex items-center justify-center gap-2 rounded-full bg-white/[0.06] px-3 py-2.5 text-sm whitespace-nowrap text-white/80"
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={
                  gated
                    ? { opacity: 1, y: 0, scale: 1 }
                    : { opacity: 0, y: 14, scale: 0.96 }
                }
                transition={
                  gated
                    ? { duration: DUR.slow, ease: EASE.expo, delay: at - 0.12 }
                    : { duration: DUR.fast }
                }
              >
                <m.span
                  className="flex"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    gated ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }
                  }
                  transition={
                    gated
                      ? { duration: DUR.base, ease: EASE.expo, delay: at + 0.1 }
                      : { duration: DUR.fast }
                  }
                >
                  <IconCircleCheckFilled
                    size={16}
                    className="text-[#3B7DD8]"
                    aria-hidden
                  />
                </m.span>
                {rule}
              </m.div>
            );
          })}
        </div>
        <DrawPath
          d={`M0 1 L${WIDTH} 1`}
          width={WIDTH}
          height={2}
          step={1}
          delay={RUN_START}
          duration={RUN}
          strokeWidth={1.5}
          dot
          className="mt-4"
        />
      </m.div>

      <p className="mt-16 text-center text-3xl text-white/85">
        <MaskedText step={2} delay={0.1}>
          A permanently red test is <Accent>a broken test</Accent>.
        </MaskedText>
      </p>

      <Footnote>Counts from the repository at 16 September 2026.</Footnote>
    </Shell>
  );
}
