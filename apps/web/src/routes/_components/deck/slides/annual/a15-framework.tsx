import { IconMinus } from "@tabler/icons-react";
import { m } from "motion/react";
import { MoA4CapabilityCard } from "../_parts/MoA4CapabilityCard";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { DUR, EASE, Sheen } from "../../_components/motion";

/** The framework's three sections, one column each, read top to bottom. */
const SECTIONS: readonly { heading: string; items: readonly string[] }[] = [
  {
    heading: "Technical",
    items: [
      "Owns technical design",
      "Understands trade-offs",
      "Debugs without flailing",
      "A skill beyond coding",
    ],
  },
  {
    heading: "Impact",
    items: [
      "Breaks down large problems",
      "Improves the process",
      "Identifies work to do",
      "Business and user empathy",
    ],
  },
  {
    heading: "Collaboration",
    items: ["Communicates clearly", "Gets buy-in", "Mentors and onboards"],
  },
];

const THIN = [
  "Feedback and pairing not written down",
  "Page scores not routine",
  "No designer or researcher",
];

/**
 * The grid starts as a board seen from slightly above, then straightens as the
 * ticks arrive: all eleven evidenced, read square on. It stays there for the thin
 * evidence and the closing figures.
 */
const FRAMEWORK_SHOTS: readonly CameraShot[] = [
  { rotateX: 7, translateZ: -30 },
  {},
  {},
  {},
];

export function AnnualFramework() {
  const step = useDeckStep();
  const evidenced = step >= 1;
  const thinIn = step >= 2;

  return (
    <Shell className="py-10">
      <Reveal>
        <Title size="md">Senior engineer, mapped</Title>
      </Reveal>

      <Camera shots={FRAMEWORK_SHOTS} className="mt-10">
        {/* One band of light follows the ticks across the board. */}
        <Sheen
          step={1}
          delay={0.2}
          duration={1.3}
          className="-m-2 rounded-3xl p-2"
        >
          <div className="grid grid-cols-3 gap-3">
            {SECTIONS.map((section, column) => (
              <div key={section.heading} className="flex flex-col gap-3">
                <div className="text-xs font-medium tracking-[0.18em] text-white/45 uppercase">
                  {section.heading}
                </div>
                {section.items.map((name, row) => (
                  <MoA4CapabilityCard
                    key={name}
                    name={name}
                    index={row * SECTIONS.length + column}
                    evidenced={evidenced}
                  />
                ))}
              </div>
            ))}
          </div>
        </Sheen>
      </Camera>

      {/* Grid, thin evidence and the closing line sit on one 40px rhythm, which
          leaves the closing line clear of the footnote. */}
      <div className="mt-12">
        <Reveal step={2}>
          <div className="text-xs font-medium tracking-[0.18em] text-white/35 uppercase">
            Thin evidence
          </div>
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
    </Shell>
  );
}
