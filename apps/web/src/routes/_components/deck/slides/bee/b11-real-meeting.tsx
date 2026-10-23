import { IconClockHour4 } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import {
  Accent,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { DUR, EASE, cueTransition } from "../../_components/motion";
import { BEE, BEE_SPRING, BeeIsland } from "./_parts/BeeIsland";
import { SourceChip } from "./_parts/BeeBits";

const FIRST = 1;
const SECOND = 2;
const SAVED = 3;

interface Exchange {
  step: number;
  asked: string;
  answer: string;
  source: string;
}

/**
 * Two questions from a real meeting with Krzys. The answers are checked
 * against each product's own documentation (October 2026).
 */
const EXCHANGES: readonly Exchange[] = [
  {
    step: FIRST,
    asked: "Can Convex run more than one local deployment, so Eva can use it?",
    answer:
      "Yes. Each copy of the project gets its own local deployment, and agent mode starts one with no login.",
    source: "docs.convex.dev",
  },
  {
    step: SECOND,
    asked: "Can you pass MCP servers into the Claude Agent SDK?",
    answer:
      "Yes. Pass them in the mcpServers option: a local command, a web address, or one inside your own app.",
    source: "platform.claude.com",
  },
];

const SHOTS: readonly CameraShot[] = [
  { rotateY: 6, translateZ: -30, x: 40 },
  { rotateY: 3 },
  { rotateY: 0, y: -6 },
  { rotateY: -4, translateZ: -30, x: -30 },
];

function Question({ exchange }: { exchange: Exchange }) {
  const step = useDeckStep();
  const shown = step >= exchange.step;
  const current = step === exchange.step;
  return (
    <m.div
      className="rounded-[24px] rounded-bl-md px-6 py-5 text-[21px] leading-snug font-medium"
      style={{ background: BEE.surface, color: BEE.text }}
      initial={{ opacity: 0, x: -20 }}
      animate={
        shown ? { opacity: current ? 1 : 0.45, x: 0 } : { opacity: 0, x: -20 }
      }
      transition={cueTransition(shown, 0.1, BEE_SPRING)}
    >
      “{exchange.asked}”
    </m.div>
  );
}

export function BeeRealMeeting() {
  const step = useDeckStep();
  const active =
    EXCHANGES.findLast((exchange) => step >= exchange.step) ?? null;
  const saved = step >= SAVED;

  return (
    <Shell className="py-14">
      <Title size="md">
        A real meeting, with <Accent>Krzys</Accent>
      </Title>

      <Camera shots={SHOTS} className="mt-8">
        <div className="relative flex h-[440px] w-[1088px] items-start gap-10">
          {/* What was asked, in order. */}
          <div className="flex w-[440px] flex-col gap-4">
            <div className="text-sm font-semibold tracking-[0.12em] text-[#a15f00] uppercase">
              Asked in the meeting
            </div>
            {EXCHANGES.map((exchange) => (
              <Question key={exchange.step} exchange={exchange} />
            ))}
          </div>

          {/* What Bee would have shown, while the meeting carried on. */}
          <div className="flex flex-col gap-4">
            <div className="text-sm font-semibold tracking-[0.12em] text-[#a15f00] uppercase">
              What Bee would have answered
            </div>
            <BeeIsland
              status={active ? "Searched the web" : "Listening…"}
              listening={!active}
              state={saved ? "done" : active ? "searching" : "listening"}
              open={Boolean(active)}
              openDelay={0.3}
              width={600}
            >
              <AnimatePresence mode="wait" initial={false}>
                {active ? (
                  <m.div
                    key={active.step}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ ...BEE_SPRING, delay: 0.45 }}
                  >
                    <p className="m-0 text-[21px] leading-snug font-medium text-pretty">
                      {active.answer}
                    </p>
                    <div className="mt-4">
                      <SourceChip domain={active.source} />
                    </div>
                  </m.div>
                ) : null}
              </AnimatePresence>
            </BeeIsland>

            {/* What it would have saved. */}
            <m.div
              className="mt-2 flex items-center gap-5"
              initial={{ opacity: 0, y: 16 }}
              animate={saved ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={cueTransition(saved, 0.25, {
                duration: DUR.hero,
                ease: EASE.expo,
              })}
            >
              <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-[#fabe28]/30 text-[#7a4800]">
                <IconClockHour4 size={32} />
              </span>
              <span>
                <span className="block text-4xl font-semibold text-[#2a1e0c]">
                  Would have saved 5+ minutes
                </span>
                <span className="block text-xl text-[#2a1e0c]/60">
                  Instead, I searched the web mid-meeting.
                </span>
              </span>
            </m.div>
          </div>
        </div>
      </Camera>
    </Shell>
  );
}
