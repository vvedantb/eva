import { IconFileText } from "@tabler/icons-react";
import { m } from "motion/react";
import { Shell, useDeckStep } from "../../../_components/DeckPrimitives";
import { Camera } from "../../../_components/DeckCamera";
import type { CameraShot } from "../../../_components/DeckCamera";
import { DUR, EASE, cueTransition } from "../../../_components/motion";
import { BEE_SPRING } from "../_parts/BeeIsland";
import { BEE_CARD } from "../_parts/BeeBits";

const FOLD = 1;
const SUMMARY = 2;

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

const OUTCOME = [
  { kind: "Decided", text: "Joins the AQP list if forms are back by Friday" },
  { kind: "Decided", text: "Nursing home placements only, at first" },
  { kind: "Sam", text: "Send the onboarding pack" },
  { kind: "Jo", text: "Book the follow-up call" },
];

const SHOTS: readonly CameraShot[] = [
  { rotateX: 6, translateZ: -30 },
  { rotateX: 2, translateZ: -10 },
  { rotateX: 0, translateZ: 20 },
];

export function DraftSummaryFold() {
  const step = useDeckStep();
  const fold = step >= FOLD;
  const summary = step >= SUMMARY;

  return (
    <Shell className="justify-center py-14">
      <Camera shots={SHOTS}>
        <div className="relative mx-auto h-[460px] w-[760px]">
          {/* The whole meeting, scrolling past, then folding away. */}
          <div className="absolute inset-0 overflow-hidden rounded-[22px] bg-[#e9e3d6] px-8 py-6 ring-1 ring-[#2a1e0c]/10 [mask-image:linear-gradient(transparent,black_15%,black_85%,transparent)]">
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
          </div>

          {/* What is left: four lines. */}
          <m.div
            className={`${BEE_CARD} absolute top-1/2 left-1/2 flex w-[600px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 p-8`}
            initial={{ opacity: 0, scaleY: 0.1 }}
            animate={
              fold ? { opacity: 1, scaleY: 1 } : { opacity: 0, scaleY: 0.1 }
            }
            transition={cueTransition(fold, 0.55, BEE_SPRING)}
          >
            <div className="flex items-center gap-3 text-2xl font-semibold text-[#2a1e0c]">
              <IconFileText size={22} className="text-[#c27406]" />
              Provider onboarding · summary
            </div>
            {OUTCOME.map((row, index) => (
              <m.div
                key={row.text}
                className="flex items-center gap-3 text-xl text-[#2a1e0c]/85"
                initial={{ opacity: 0, x: -10 }}
                animate={
                  summary ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }
                }
                transition={cueTransition(
                  summary,
                  0.1 + index * 0.12,
                  BEE_SPRING,
                )}
              >
                <span className="w-[86px] shrink-0 rounded-full bg-[#fabe28]/30 px-3 py-0.5 text-center text-[14px] font-semibold text-[#7a4800]">
                  {row.kind}
                </span>
                {row.text}
              </m.div>
            ))}
          </m.div>
        </div>
      </Camera>
    </Shell>
  );
}
