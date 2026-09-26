import { IconMinus } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  MO_A4_TICK_GAP,
  MoA4CapabilityCard,
} from "../_parts/MoA4CapabilityCard";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
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
  CountRoll,
  DUR,
  EASE,
  MaskedText,
  Sheen,
} from "../../_components/motion";

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

/** When the last tick has landed; the caption follows it. */
const TICKS_DONE = 0.25 + CAPABILITIES.length * MO_A4_TICK_GAP;

const FIGURE_CLASS = "text-5xl leading-[1.3] font-semibold tracking-tight";

export function AnnualFramework() {
  const step = useDeckStep();
  const evidenced = step >= 1;
  const thinIn = step >= 2;

  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>Evidence · The framework</Kicker>
        <Title size="md">Senior engineer, mapped.</Title>
      </Reveal>

      <Camera shots={FRAMEWORK_SHOTS} className="mt-7">
        {/* One band of light follows the ticks across the board. */}
        <Sheen
          step={1}
          delay={0.2}
          duration={1.3}
          className="-m-2 rounded-3xl p-2"
        >
          <div className="grid grid-cols-3 gap-3">
            {CAPABILITIES.map((name, index) => (
              <MoA4CapabilityCard
                key={name}
                name={name}
                index={index}
                evidenced={evidenced}
              />
            ))}
          </div>
        </Sheen>
      </Camera>

      <p className="mt-3 text-sm text-white/45">
        <MaskedText step={1} delay={TICKS_DONE} duration={DUR.slow}>
          Every one of these is a slide in this deck.
        </MaskedText>
      </p>

      {/* Grid, thin evidence and the closing line sit on one 40px rhythm, which
          leaves the closing line clear of the footnote. */}
      <div className="mt-10">
        <Reveal step={2}>
          <Kicker className="mb-0 text-xs tracking-[0.18em] text-white/35">
            Thin evidence
          </Kicker>
        </Reveal>
        <div className="mt-3 flex gap-3">
          {THIN.map((gap, index) => {
            const at = 0.2 + index * 0.1;
            return (
              <m.div
                key={gap}
                initial={false}
                animate={
                  thinIn
                    ? { opacity: 1, y: 0, scale: 1 }
                    : { opacity: 0, y: 14, scale: 0.96 }
                }
                transition={
                  thinIn
                    ? { duration: DUR.slow, ease: EASE.expo, delay: at }
                    : { duration: DUR.fast }
                }
                className="flex items-center gap-2 rounded-full border border-dashed border-white/15 bg-white/[0.03] px-4 py-2 text-sm text-white/50"
              >
                <m.span
                  className="flex"
                  initial={false}
                  animate={{ scaleX: thinIn ? 1 : 0 }}
                  transition={
                    thinIn
                      ? { duration: DUR.base, ease: EASE.out, delay: at + 0.25 }
                      : { duration: DUR.fast }
                  }
                >
                  <IconMinus size={15} stroke={2} aria-hidden />
                </m.span>
                {gap}
              </m.div>
            );
          })}
        </div>
      </div>

      {/* Words and figures rise on transform-only masks: an opacity fade on an
          ancestor would fight the odometer columns mid-roll. */}
      <p className="mt-10 text-center text-2xl text-white/85">
        <MaskedText step={3} stagger={0.05}>
          <span className={FIGURE_CLASS}>
            <Accent>
              <CountRoll value={4732} step={3} delay={0.1} />
            </Accent>
          </span>{" "}
          changes.{" "}
          <span className={FIGURE_CLASS}>
            <Accent>
              <CountRoll value={1348} step={3} delay={0.3} />
            </Accent>
          </span>{" "}
          sets of release notes. All written down at the time.
        </MaskedText>
      </p>

      <Footnote>
        Evidence from the repository and Eva&apos;s own records, 11 January to
        16 September 2026.
      </Footnote>
    </Shell>
  );
}
