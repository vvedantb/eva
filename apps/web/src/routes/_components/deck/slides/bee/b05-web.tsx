import { AnimatePresence, m } from "motion/react";
import { Shell, Title, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { DUR, EASE, Spotlight } from "../../_components/motion";
import { BEE, BEE_SPRING, BeeIsland, BeeTip } from "./_parts/BeeIsland";
import { SourceChip } from "./_parts/BeeBits";

interface Round {
  asked: string;
  answer: string;
  /** The chips Bee shows under a web answer. */
  links: readonly string[];
}

/** Three questions from an AQP call; answers checked against the sources in the speaker note. */
const ROUNDS: readonly Round[] = [
  {
    asked: "Do they need to complete the Data Security and Protection Toolkit?",
    answer:
      "Yes. With NHS-funded care such as CHC, the contract requires it every year",
    links: ["dsptoolkit.nhs.uk", "digitalcarehub.co.uk"],
  },
  {
    asked: "Can CHC pay for care in their own home?",
    answer:
      "Yes. CHC can be arranged in any setting, including the person's own home",
    links: ["gov.uk", "nhs.uk"],
  },
  {
    asked: "What is the FNC rate this year?",
    answer:
      "£267.68 a week from 1 April 2026, paid by the NHS straight to the nursing home",
    links: ["gov.uk"],
  },
];

/** Two steps per round: the question and Bee's search, then the sources. */
const roundAt = (step: number) =>
  Math.min(ROUNDS.length - 1, Math.max(0, Math.ceil(step / 2) - 1));

const SHOTS: readonly CameraShot[] = [
  { rotateX: 8, translateZ: -40 },
  { rotateX: 4, translateZ: 0 },
  { rotateX: 2, translateZ: 16, y: -10 },
  { rotateX: 4, translateZ: 0 },
  { rotateX: 2, translateZ: 16, y: -10 },
  { rotateX: 4, translateZ: 0 },
  { rotateX: 2, translateZ: 16, y: -10 },
];

const GLOW = SHOTS.map((_, step) => ({
  x: 544,
  y: step === 0 ? 120 : 260,
  size: step === 0 ? 420 : 560,
}));

export function BeeWeb() {
  const step = useDeckStep();
  const asking = step >= 1;
  const searching = step % 2 === 1;
  const sourced = asking && !searching;
  const round = ROUNDS[roundAt(step)];

  return (
    <Shell className="py-14">
      <Title size="md">Answers from the web, too</Title>

      <Camera shots={SHOTS} className="mt-8">
        <div className="relative isolate flex h-[460px] w-[1088px] flex-col items-center gap-6">
          <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />

          {/* What Bee just heard in the meeting. */}
          <div className="flex h-[64px] items-end">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={round.asked}
                className="rounded-[22px] rounded-bl-md px-6 py-4 text-[21px] font-medium"
                style={{ background: BEE.surface, color: BEE.text }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: asking ? 1 : 0, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: DUR.base, ease: EASE.out }}
              >
                “{round.asked}”
              </m.div>
            </AnimatePresence>
          </div>

          <BeeIsland
            status={
              !asking
                ? "Listening…"
                : searching
                  ? "Searching the web…"
                  : "Searched the web"
            }
            listening={!asking}
            state={!asking ? "listening" : searching ? "searching" : "done"}
            open={asking}
            openDelay={0.5}
            width={680}
          >
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={round.answer}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: DUR.base }}
              >
                <BeeTip shown={asking} delay={1.1}>
                  {round.answer}
                </BeeTip>

                {/* Grid rows, not `height: "auto"`, so the camera zoom cannot mis-measure it. */}
                <div
                  className="grid"
                  style={{
                    gridTemplateRows: sourced ? "1fr" : "0fr",
                    transition: `grid-template-rows 500ms cubic-bezier(0.22, 1, 0.36, 1) ${sourced ? 0.1 : 0}s`,
                  }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="flex flex-wrap gap-2 pt-4">
                      {round.links.map((link, index) => (
                        <m.span
                          key={link}
                          initial={{ opacity: 0, y: 6 }}
                          animate={
                            sourced
                              ? { opacity: 1, y: 0 }
                              : { opacity: 0, y: 6 }
                          }
                          transition={
                            sourced
                              ? { ...BEE_SPRING, delay: 0.3 + index * 0.1 }
                              : { duration: DUR.fast }
                          }
                        >
                          <SourceChip label={link} domain={link} />
                        </m.span>
                      ))}
                    </div>
                  </div>
                </div>
              </m.div>
            </AnimatePresence>
          </BeeIsland>
        </div>
      </Camera>
    </Shell>
  );
}
