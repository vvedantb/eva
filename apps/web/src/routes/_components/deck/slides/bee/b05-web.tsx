import { IconExternalLink, IconWorld } from "@tabler/icons-react";
import { m } from "motion/react";
import { Shell, Title, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { Spotlight, cueTransition } from "../../_components/motion";
import { BEE, BEE_SPRING, BeeIsland, BeeTip } from "./_parts/BeeIsland";

const ANSWER = 1;
const SOURCES = 2;

/** Example sources, the shape Bee shows under a web answer. */
const LINKS = [
  { site: "gov.uk", title: "Data protection: the basics" },
  { site: "ico.org.uk", title: "Guide to UK GDPR" },
];

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
                className="mt-5 border-t pt-4"
                style={{ borderColor: BEE.raised }}
                initial={false}
                animate={
                  sourced
                    ? { height: "auto", opacity: 1 }
                    : { height: 0, opacity: 0 }
                }
                transition={cueTransition(sourced, 0.1, BEE_SPRING)}
              >
                <div
                  className="mb-3 flex items-center gap-2 text-[13px] font-semibold tracking-[0.1em] uppercase"
                  style={{ color: BEE.muted }}
                >
                  <IconWorld size={15} />
                  Sources
                </div>
                <div className="flex flex-col gap-2">
                  {LINKS.map((link, index) => (
                    <m.div
                      key={link.site}
                      className="flex items-center gap-3 rounded-2xl px-4 py-3"
                      style={{ background: BEE.raised }}
                      initial={{ opacity: 0, x: -12 }}
                      animate={
                        sourced ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }
                      }
                      transition={cueTransition(
                        sourced,
                        0.35 + index * 0.12,
                        BEE_SPRING,
                      )}
                    >
                      <span
                        className="flex size-8 items-center justify-center rounded-lg text-[13px] font-bold"
                        style={{ background: BEE.accent, color: BEE.surface }}
                      >
                        {link.site.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-medium">
                          {link.title}
                        </span>
                        <span
                          className="block text-[13px]"
                          style={{ color: BEE.muted }}
                        >
                          {link.site}
                        </span>
                      </span>
                      <IconExternalLink
                        size={16}
                        style={{ color: BEE.muted }}
                      />
                    </m.div>
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
