import { AnimatePresence, m } from "motion/react";
import { Shell, useDeckStep } from "../../../_components/DeckPrimitives";
import { Camera } from "../../../_components/DeckCamera";
import type { CameraShot } from "../../../_components/DeckCamera";
import { DUR, EASE, cueTransition } from "../../../_components/motion";
import { BEE, BeeIsland, BeeTip } from "../_parts/BeeIsland";
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
    answer: "Yes. Each copy of the project gets its own local deployment",
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
    answer: "Yes. Pass them in the mcpServers option",
    source: "platform.claude.com",
  },
];

/** Seconds each search takes: type it, skim the results, clear it. */
const PER_SEARCH = 1.1;

const SHOTS: readonly CameraShot[] = [
  { rotateY: 4, translateZ: -40 },
  { rotateY: 0, translateZ: -10 },
  { rotateY: 0, translateZ: -10 },
  { rotateY: 0, translateZ: 10 },
];

const LABEL = "text-sm font-semibold tracking-[0.12em] uppercase";

/** One round of searching by hand: the queries typed in turn, results skimmed after each. */
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
                opacity: last ? [0, 1, 1] : [0, 1, 1, 0],
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
                    ],
              }}
              transition={{
                duration: PER_SEARCH,
                delay: 0.3 + index * PER_SEARCH,
                times: last ? [0, 0.05, 0.55] : [0, 0.05, 0.55, 1],
                ease: "linear",
              }}
            >
              {query}
            </m.span>
          );
        })}
      </div>
      <m.div
        className="flex flex-col gap-3 px-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 0.4] }}
        transition={{
          duration: PER_SEARCH,
          delay: 0.3,
          repeat: round.searches.length - 1,
          times: [0, 0.55, 0.7, 1],
        }}
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
    <Shell className="justify-center py-14">
      <Camera shots={SHOTS}>
        <div className="flex w-[1088px] flex-col items-center gap-7">
          {/* The question being asked right now. */}
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={round.asked}
              className="rounded-[22px] rounded-bl-md px-6 py-4 text-[21px] font-medium"
              style={{ background: BEE.surface, color: BEE.text }}
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
              <div className={`${LABEL} text-[#a15f00]`}>With Bee</div>
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
            Would have saved me typing and searching myself
          </m.div>
        </div>
      </Camera>
    </Shell>
  );
}
