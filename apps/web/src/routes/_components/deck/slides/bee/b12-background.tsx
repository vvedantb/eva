import type { Icon } from "@tabler/icons-react";
import {
  IconAdjustmentsHorizontal,
  IconBrain,
  IconCpu,
  IconFileText,
  IconGauge,
  IconPlugConnected,
  IconSparkles,
  IconStack2,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { GrokMark } from "@/lib/components/grokBot/GrokMark";
import { EvaDiscMark } from "../../_components/EvaDiscMark";
import {
  Accent,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { DUR, EASE, cueTransition } from "../../_components/motion";
import { BEE, BEE_SPRING } from "./_parts/BeeIsland";
import { BeeLogo } from "./_parts/BeeLogo";
import { BEE_CARD } from "./_parts/BeeBits";

const STEER = 1;
const BACKGROUND = 2;
const BEE_TOO = 3;
const EVA_TOO = 4;

interface Chore {
  icon: Icon;
  label: string;
  tilt: number;
}

/** What a hands-on agent asks of you before and during the work. */
const CHORES: readonly Chore[] = [
  { icon: IconCpu, label: "Choose the model", tilt: 1 },
  { icon: IconGauge, label: "Set the reasoning effort", tilt: -1.5 },
  { icon: IconSparkles, label: "Pick the right skill", tilt: -2 },
  { icon: IconPlugConnected, label: "Connect the MCP tools", tilt: 1.5 },
  { icon: IconStack2, label: "Watch the context fill and compact", tilt: -1 },
  { icon: IconBrain, label: "Read the thinking", tilt: 1 },
  { icon: IconFileText, label: "Parse paragraphs of output", tilt: 2 },
  { icon: IconAdjustmentsHorizontal, label: "Steer it, again", tilt: -1.5 },
];

interface Update {
  from: "you" | "bot";
  text: string;
  time: string;
}

/** One message from you; the rest are updates, as a co-worker would send. Example thread. */
const THREAD: readonly Update[] = [
  { from: "you", text: "Ship the referral export fix", time: "10:02" },
  { from: "bot", text: "On it.", time: "10:02" },
  { from: "bot", text: "Migration applied, deploying now.", time: "10:09" },
  { from: "bot", text: "Merged. It is live.", time: "10:11" },
];

const SHOTS: readonly CameraShot[] = [
  { translateZ: -30 },
  { rotateY: 6, x: 60, translateZ: 10 },
  { rotateY: -6, x: -60, translateZ: 10 },
  { translateZ: -40, y: -10 },
];

function Steering() {
  const step = useDeckStep();
  const shown = step >= STEER;
  const faded = step >= BACKGROUND;

  return (
    <m.div
      className={cn(BEE_CARD, "flex w-[500px] flex-col gap-4 p-7")}
      initial={false}
      animate={{ opacity: faded ? 0.45 : 1 }}
      transition={{ duration: DUR.slow, ease: EASE.out }}
    >
      <div className="text-sm font-semibold tracking-[0.12em] text-[#2a1e0c]/50 uppercase">
        An agent you steer
      </div>
      <div className="flex flex-col gap-1.5">
        {CHORES.map((chore, index) => {
          const Glyph = chore.icon;
          return (
            <m.div
              key={chore.label}
              className="flex h-9 items-center gap-3 rounded-full bg-[#2a1e0c]/[0.05] px-4 text-[17px] text-[#2a1e0c]/80"
              initial={{ opacity: 0, x: -16, rotate: 0 }}
              animate={
                shown
                  ? { opacity: 1, x: 0, rotate: chore.tilt }
                  : { opacity: 0, x: -16, rotate: 0 }
              }
              transition={cueTransition(shown, 0.15 + index * 0.11, BEE_SPRING)}
            >
              <Glyph size={20} stroke={1.7} className="text-[#2a1e0c]/50" />
              {chore.label}
            </m.div>
          );
        })}
      </div>
    </m.div>
  );
}

function Background() {
  const step = useDeckStep();
  const shown = step >= BACKGROUND;

  return (
    <m.div
      className={cn(BEE_CARD, "flex w-[500px] flex-col gap-4 p-7")}
      initial={false}
      animate={{ opacity: shown ? 1 : 0.35, scale: shown ? 1 : 0.98 }}
      transition={{ duration: DUR.slow, ease: EASE.out }}
    >
      <div className="flex items-center gap-2.5 text-sm font-semibold tracking-[0.12em] text-[#2a1e0c]/50 uppercase">
        <span className="flex size-7 items-center justify-center rounded-full bg-[#17140f]">
          <GrokMark size={14} className="text-[#fff] dark:text-[#fff]" />
        </span>
        Grok bot, in the background
      </div>
      <div className="flex flex-col gap-2.5">
        {THREAD.map((update, index) => {
          const mine = update.from === "you";
          return (
            <m.div
              key={update.text}
              className={cn(
                "flex max-w-[86%] items-baseline gap-3 rounded-[20px] px-4 py-3 text-lg",
                mine ? "self-end rounded-br-md" : "self-start rounded-bl-md",
              )}
              style={
                mine
                  ? { background: BEE.accent, color: BEE.surface }
                  : { background: BEE.surface, color: BEE.text }
              }
              initial={{ opacity: 0, y: 12 }}
              animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
              transition={cueTransition(
                shown,
                index === 0 ? 0.2 : 0.55 + index * 0.45,
                BEE_SPRING,
              )}
            >
              <span className="font-medium">{update.text}</span>
              <span
                className="ml-auto shrink-0 text-[13px] tabular-nums"
                style={{ color: mine ? "rgba(23,20,15,0.6)" : BEE.muted }}
              >
                {update.time}
              </span>
            </m.div>
          );
        })}
      </div>
    </m.div>
  );
}

export function BeeBackground() {
  const step = useDeckStep();
  const beeToo = step >= BEE_TOO;
  const evaToo = step >= EVA_TOO;

  return (
    <Shell className="py-14">
      <Title size="md">
        The best AI works <Accent>in the background</Accent>
      </Title>

      <Camera shots={SHOTS} className="mt-8">
        <div className="flex w-[1088px] items-start justify-between">
          <Steering />
          <Background />
        </div>
      </Camera>

      {/* Bee is that idea, for meetings. */}
      <m.div
        className="mt-6 flex items-center justify-center gap-4"
        initial={{ opacity: 0, y: 16 }}
        animate={beeToo ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={cueTransition(beeToo, 0.3, {
          duration: DUR.hero,
          ease: EASE.expo,
        })}
      >
        <BeeLogo size={52} glow={false} />
        <span className="text-[26px] font-medium text-[#2a1e0c]">
          Bee does the same for meetings: it listens, searches and reminds you.
        </span>
      </m.div>

      {/* The same lesson, applied back to Eva. */}
      <m.div
        className="mt-4 flex items-center justify-center gap-4"
        initial={{ opacity: 0, y: 16 }}
        animate={evaToo ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={cueTransition(evaToo, 0.2, {
          duration: DUR.hero,
          ease: EASE.expo,
        })}
      >
        <span className="flex size-[52px] items-center justify-center">
          <EvaDiscMark size={34} />
        </span>
        <span className="text-[22px] text-[#2a1e0c]/70">
          Eva&apos;s Simple Mode too: workspaces wake and sleep on their own.
        </span>
      </m.div>
    </Shell>
  );
}
