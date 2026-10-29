import { AnimatePresence, m } from "motion/react";
import type { Transition } from "motion/react";
import {
  Accent,
  Shell,
  Title,
  useDeckStep,
} from "../../../_components/DeckPrimitives";
import { Camera } from "../../../_components/DeckCamera";
import type { CameraShot } from "../../../_components/DeckCamera";
import { DUR, EASE, cueTransition } from "../../../_components/motion";
import { BeeIsland, BeeTip } from "../_parts/BeeIsland";
import { BEE_CARD, SourceChip } from "../_parts/BeeBits";

const FIRST = 1;
const SECOND = 2;
const RESULT = 3;

interface Round {
  asked: string;
  /** What you type into Google, one search after another. */
  searches: readonly string[];
  answer: string;
  source: string;
}

/** The two questions from the meeting with Krzys; answers as on the slide before. */
const ROUNDS: readonly Round[] = [
  {
    asked: "Can Convex run more than one local deployment, so Eva can use it?",
    searches: [
      "convex local deployment",
      "convex multiple local deployments",
      "convex dev two projects same machine",
      "convex agent mode",
    ],
    answer:
      "Yes. Each copy of the project gets its own local deployment, and agent mode starts one with no login",
    source: "docs.convex.dev",
  },
  {
    asked: "Can you pass MCP servers into the Claude Agent SDK?",
    searches: [
      "claude agent sdk mcp",
      "claude agent sdk mcpServers option",
      "agent sdk typescript mcp server config",
      "claude agent sdk custom tools",
    ],
    answer:
      "Yes. Pass them in the mcpServers option: a local command, a web address, or one inside your own app",
    source: "platform.claude.com",
  },
];

/**
 * Seconds each search takes. Within it, as fractions: type the query, wait
 * for the page, show the results, read them, then clear for the next one.
 */
const PER_SEARCH = 2.6;
const TYPED = 0.4;
const LOADED = 0.46;
const SHOWN = 0.52;
const CLEARED = 0.93;

/** Same timing for a query and its results, so results never show mid-typing. */
function searchTransition(index: number, times: number[]): Transition {
  return {
    duration: PER_SEARCH,
    delay: 0.3 + index * PER_SEARCH,
    times,
    ease: "linear",
  };
}

const SHOTS: readonly CameraShot[] = [
  { rotateY: 4, translateZ: -40 },
  { rotateY: 0, translateZ: -10 },
  { rotateY: 0, translateZ: -10 },
  { rotateY: 0, translateZ: 10 },
];

const LABEL = "text-sm font-semibold tracking-[0.12em] uppercase";

/** One round of searching by hand: type a query, skim the results, clear, try again. */
function ByHand({ round }: { round: Round }) {
  return (
    <div className={`${BEE_CARD} flex h-[290px] flex-col gap-4 p-6`}>
      <div className="relative flex h-14 items-center gap-3 rounded-full px-5 ring-1 ring-[#2a1e0c]/15">
        <img src="/brands/google.svg" alt="" className="size-6" />
        {round.searches.map((query, index) => {
          const last = index === round.searches.length - 1;
          return (
            <m.span
              key={query}
              className="absolute left-14 overflow-hidden text-[17px] whitespace-nowrap text-[#2a1e0c]"
              initial={{ opacity: 0, clipPath: "inset(0 100% 0 0)" }}
              animate={{
                opacity: last ? [0, 1, 1] : [0, 1, 1, 1, 0],
                clipPath: last
                  ? [
                      "inset(0 100% 0 0)",
                      "inset(0 100% 0 0)",
                      "inset(0 0% 0 0)",
                    ]
                  : [
                      "inset(0 100% 0 0)",
                      "inset(0 100% 0 0)",
                      "inset(0 0% 0 0)",
                      "inset(0 0% 0 0)",
                      "inset(0 0% 0 0)",
                    ],
              }}
              transition={searchTransition(
                index,
                last ? [0, 0.02, TYPED] : [0, 0.02, TYPED, CLEARED, 1],
              )}
            >
              {query}
            </m.span>
          );
        })}
      </div>
      {/* Each query's results appear only once it is typed and the page has loaded. */}
      <div className="relative flex-1">
        {round.searches.map((query, index) => {
          const last = index === round.searches.length - 1;
          return (
            <m.div
              key={query}
              className="absolute inset-0 flex flex-col gap-3 px-2"
              initial={{ opacity: 0, y: 6 }}
              animate={{
                opacity: last ? [0, 0, 1] : [0, 0, 1, 1, 0],
                y: last ? [6, 6, 0] : [6, 6, 0, 0, 0],
              }}
              transition={searchTransition(
                index,
                last ? [0, LOADED, SHOWN] : [0, LOADED, SHOWN, CLEARED, 1],
              )}
            >
              {[0.9, 0.7, 0.8, 0.6].map((width, row) => (
                <div key={row} className="flex flex-col gap-1.5">
                  <span
                    className="h-3 rounded-full bg-[#3b6fd4]/40"
                    style={{ width: `${width * 60}%` }}
                  />
                  <span
                    className="h-2.5 rounded-full bg-[#2a1e0c]/10"
                    style={{ width: `${width * 100}%` }}
                  />
                </div>
              ))}
            </m.div>
          );
        })}
      </div>
    </div>
  );
}

export function DraftKrzysRace() {
  const step = useDeckStep();
  const started = step >= FIRST;
  const result = step >= RESULT;
  const index = step >= SECOND ? 1 : 0;
  const round = ROUNDS[index];

  return (
    <Shell className="py-14">
      <Title size="md">
        A real meeting, with <Accent>Krzys</Accent>
      </Title>
      <Camera shots={SHOTS} className="mt-6">
        <div className="flex w-[1088px] flex-col items-center gap-7">
          {/* The question being asked right now. */}
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={round.asked}
              className="text-[24px] font-medium text-[#2a1e0c]/75"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: started ? 1 : 0, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: DUR.base, ease: EASE.out }}
            >
              “{round.asked}”
            </m.div>
          </AnimatePresence>

          <div className="flex w-full items-start justify-center gap-10">
            {/* By hand: one Google search after another. */}
            <div className="flex w-[480px] flex-col gap-3">
              <div className={`${LABEL} text-[#2a1e0c]/50`}>By hand</div>
              {started ? (
                <ByHand key={round.asked} round={round} />
              ) : (
                <div className={`${BEE_CARD} h-[290px]`} />
              )}
            </div>

            {/* With Bee: it searches for you; the answer arrives while you are still typing. */}
            <div className="flex w-[480px] flex-col gap-3">
              <div className={`${LABEL} text-[#a15f00]`}>
                What Bee would have answered
              </div>
              <BeeIsland
                status={started ? "Searched the web" : "Listening…"}
                listening={!started}
                state={started ? "done" : "listening"}
                open={started}
                openDelay={1.2}
                width={480}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <m.div
                    key={round.answer}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{
                      duration: DUR.base,
                      delay: index === 0 ? 0 : 1.2,
                    }}
                  >
                    <BeeTip shown={started} delay={index === 0 ? 1.5 : 0}>
                      {round.answer}
                    </BeeTip>
                    <span className="mt-3 inline-block">
                      <SourceChip label={round.source} domain={round.source} />
                    </span>
                  </m.div>
                </AnimatePresence>
              </BeeIsland>
            </div>
          </div>

          <m.div
            className="text-4xl font-semibold text-[#2a1e0c]"
            initial={{ opacity: 0, y: 12 }}
            animate={result ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={cueTransition(result, 0.2, {
              duration: DUR.hero,
              ease: EASE.expo,
            })}
          >
            Would have answered before I finished typing
          </m.div>
        </div>
      </Camera>
    </Shell>
  );
}
