import { m } from "motion/react";
import { Shell, Title, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { Spotlight, cueTransition } from "../../_components/motion";
import { BEE_SPRING, BeeIsland, BeeTip } from "./_parts/BeeIsland";
import { SourceChip } from "./_parts/BeeBits";

const ANSWER = 1;
const SOURCES = 2;

/** Example sources, as the chips Bee shows under a web answer. */
const LINKS = ["gov.uk", "ico.org.uk"];

const SHOTS: readonly CameraShot[] = [
  { rotateX: 8, translateZ: -40 },
  { rotateX: 4, translateZ: 0 },
  { rotateX: 2, translateZ: 16, y: -10 },
];

const GLOW = [
  { x: 544, y: 80, size: 420 },
  { x: 544, y: 160, size: 520 },
  { x: 544, y: 280, size: 560 },
];

export function BeeWeb() {
  const step = useDeckStep();
  const answered = step >= ANSWER;
  const sourced = step >= SOURCES;

  return (
    <Shell className="py-14">
      <Title size="md">Answers from the web, too</Title>

      <Camera shots={SHOTS} className="mt-10">
        <div className="relative isolate flex h-[440px] w-[1088px] items-start justify-center">
          <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />
          <BeeIsland
            status={answered ? "Searched the web" : "Listening…"}
            listening={!answered}
            state={sourced ? "done" : answered ? "searching" : "listening"}
            open={answered}
            openDelay={0.1}
            width={640}
          >
            <div className="flex flex-col">
              <BeeTip shown={answered} delay={0.3}>
                Personal data can be kept only as long as you need it, and you
                must say why.
              </BeeTip>

              <m.div
                className="overflow-hidden"
                initial={false}
                animate={
                  sourced
                    ? { height: "auto", opacity: 1 }
                    : { height: 0, opacity: 0 }
                }
                transition={cueTransition(sourced, 0.1, BEE_SPRING)}
              >
                <div className="flex flex-wrap gap-2 pt-4">
                  {LINKS.map((link, index) => (
                    <m.span
                      key={link}
                      initial={{ opacity: 0, y: 6 }}
                      animate={
                        sourced ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }
                      }
                      transition={cueTransition(
                        sourced,
                        0.3 + index * 0.1,
                        BEE_SPRING,
                      )}
                    >
                      <SourceChip label={link} domain={link} />
                    </m.span>
                  ))}
                </div>
              </m.div>
            </div>
          </BeeIsland>
        </div>
      </Camera>
    </Shell>
  );
}
