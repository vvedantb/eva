import { m } from "motion/react";
import { Shell, useDeckStep } from "../../../_components/DeckPrimitives";
import { Camera } from "../../../_components/DeckCamera";
import type { CameraShot } from "../../../_components/DeckCamera";
import { DUR, EASE, cueTransition } from "../../../_components/motion";
import { BEE_SPRING } from "../_parts/BeeIsland";
import { SummaryAfter, SummaryCard } from "../_parts/MeetingSummary";

const FOLD = 1;
const DECISIONS = 2;
const ACTIONS = 3;
const SAVED = 4;
const FORWARD = 5;

/** An hour of talk, as Bee heard it. Example lines. */
const TRANSCRIPT = [
  "Alex: so the provider sent most of the forms last week",
  "Sam: did the CQC report come through as well?",
  "Alex: yes, rated good, that one is fine",
  "Jo: and they only want nursing home placements at first",
  "Sam: that makes the onboarding simpler for us",
  "Alex: they said they can return the rest by Friday",
  "Jo: if that happens we add them to the AQP list",
  "Sam: I will send the onboarding pack today",
  "Jo: I will book a follow-up call for next week",
  "Alex: anything else on fees before we finish?",
  "Sam: no, fees stay as they are for now",
  "Jo: great, thanks everyone",
];

const SHOTS: readonly CameraShot[] = [
  { rotateX: 6, translateZ: -30 },
  { rotateX: 2, translateZ: -10 },
  { rotateY: -4, x: -30 },
  { rotateY: 0 },
  { rotateY: 5, translateZ: -40, x: -90 },
  { rotateY: 6, translateZ: -50, x: -100 },
];

export function DraftSummaryFold() {
  const step = useDeckStep();
  const fold = step >= FOLD;

  return (
    <Shell className="justify-center py-14">
      <Camera shots={SHOTS}>
        <div className="relative flex h-[460px] w-[1088px] items-start gap-12">
          <div className="relative h-[460px] w-[620px] shrink-0">
            {/* The whole meeting, scrolling past, then folding away. */}
            <m.div
              className="absolute inset-0 overflow-hidden rounded-[22px] bg-[#e9e3d6] px-8 py-6 ring-1 ring-[#2a1e0c]/10 [mask-image:linear-gradient(transparent,black_15%,black_85%,transparent)]"
              initial={false}
              animate={{ opacity: fold ? 0 : 1 }}
              transition={{ duration: DUR.slow, delay: fold ? 0.5 : 0 }}
            >
              <m.div
                className="flex flex-col gap-3"
                animate={{ y: fold ? 0 : [0, -180] }}
                transition={
                  fold
                    ? { duration: DUR.slow }
                    : { duration: 9, repeat: Infinity, ease: "linear" }
                }
              >
                {TRANSCRIPT.map((line, index) => (
                  <m.p
                    key={line}
                    className="m-0 origin-center text-[19px] text-[#2a1e0c]/55"
                    initial={false}
                    animate={
                      fold
                        ? { opacity: 0, scaleY: 0.2, y: (6 - index) * 30 }
                        : { opacity: 1, scaleY: 1, y: 0 }
                    }
                    transition={{
                      duration: 0.7,
                      ease: EASE.inOut,
                      delay: fold ? Math.abs(6 - index) * 0.04 : 0,
                    }}
                  >
                    {line}
                  </m.p>
                ))}
              </m.div>
            </m.div>

            {/* What is left: the summary, built up as on the original slide. */}
            <m.div
              className="absolute top-0 left-0 w-full origin-center"
              initial={{ opacity: 0, scaleY: 0.1 }}
              animate={
                fold ? { opacity: 1, scaleY: 1 } : { opacity: 0, scaleY: 0.1 }
              }
              transition={cueTransition(fold, 0.55, BEE_SPRING)}
            >
              <SummaryCard
                decisions={step >= DECISIONS}
                actions={step >= ACTIONS}
              />
            </m.div>
          </div>

          {/* It goes back into your notes, and to anyone who missed it. */}
          <SummaryAfter saved={step >= SAVED} forward={step >= FORWARD} />
        </div>
      </Camera>
    </Shell>
  );
}
