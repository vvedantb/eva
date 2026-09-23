import type { ReactNode } from "react";
import {
  IconArrowRight,
  IconArrowUp,
  IconCheck,
  IconPointer,
} from "@tabler/icons-react";
import { m } from "motion/react";
import type { Transition } from "motion/react";
import {
  Accent,
  EASE_OUT,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { FriLines, FriTyped, FriWindow } from "../_parts/FriMock";

/** One panel per beat, left to right, in the order they are spoken. */
const STAGE_LABELS: readonly string[] = [
  "You ask",
  "Eva builds it",
  "You try it",
];

const PANEL = "h-[268px] w-[300px]";

/** Panels and arrows both settle with the same critically damped spring. */
const SETTLE: Transition = { type: "spring", bounce: 0, duration: 0.6 };

function StageLabel({ index }: { index: number }) {
  const landed = useDeckStep() >= index;
  return (
    <m.div
      className="mt-4 text-sm text-white/55"
      animate={{ opacity: landed ? 1 : 0, y: landed ? 0 : 6 }}
      transition={{ ...SETTLE, delay: landed ? 0.15 : 0 }}
    >
      {STAGE_LABELS[index]}
    </m.div>
  );
}

function Panel({ index, children }: { index: number; children: ReactNode }) {
  const landed = useDeckStep() >= index;
  return (
    <div className="flex flex-col items-start">
      <m.div
        className={PANEL}
        initial={{ opacity: 0, y: 22, scale: 0.94 }}
        animate={{
          opacity: landed ? 1 : 0,
          y: landed ? 0 : 22,
          scale: landed ? 1 : 0.94,
        }}
        transition={landed ? SETTLE : { duration: 0.25, ease: EASE_OUT }}
      >
        {children}
      </m.div>
      <StageLabel index={index} />
    </div>
  );
}

function Arrow({ step }: { step: number }) {
  const landed = useDeckStep() >= step;
  return (
    <m.div
      aria-hidden
      className="mb-9 shrink-0 text-white/30"
      animate={{ opacity: landed ? 1 : 0, x: landed ? 0 : -8 }}
      transition={{ ...SETTLE, delay: landed ? 0.1 : 0 }}
    >
      <IconArrowRight size={22} stroke={1.8} />
    </m.div>
  );
}

/** The one thing the room types. Short enough to sit on a single line. */
const ASK = "Add a decline reason to referrals";

function AskPanel() {
  return (
    <FriWindow
      label="Chat"
      className="h-full w-full"
      bodyClassName="flex flex-col"
    >
      <div className="rounded-[12px] bg-[#8B3FB8]/20 px-3 py-2.5 text-[13px] leading-snug text-white/90">
        <FriTyped text={ASK} delay={0.4} duration={1.3} />
      </div>
      <div className="mt-auto flex h-10 items-center rounded-full bg-white/[0.06] pr-1 pl-3">
        <span className="flex-1 text-[12px] text-white/35">Ask Eva</span>
        <span className="flex size-8 items-center justify-center rounded-full bg-white/[0.12] text-white/70">
          <IconArrowUp size={15} />
        </span>
      </div>
    </FriWindow>
  );
}

const BUILD_ROWS: readonly string[] = [
  "Referral form",
  "Decline reasons",
  "Tests",
];

function BuildPanel() {
  const running = useDeckStep() >= 1;
  return (
    <FriWindow
      label="Cloud workspace"
      className="h-full w-full"
      bodyClassName="flex flex-col gap-3"
    >
      {BUILD_ROWS.map((row, index) => (
        <m.div
          key={row}
          className="flex items-center gap-2.5 rounded-[12px] bg-white/[0.05] px-3 py-2 text-[12px] text-white/70"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: running ? 1 : 0, x: running ? 0 : -10 }}
          transition={{ ...SETTLE, delay: running ? 0.25 + index * 0.22 : 0 }}
        >
          <IconCheck size={14} className="text-[#3B7DD8]" />
          {row}
        </m.div>
      ))}
      <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <m.div
          className="h-full origin-left rounded-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8]"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: running ? 1 : 0 }}
          transition={{
            duration: running ? 1.5 : 0.2,
            ease: EASE_OUT,
            delay: running ? 0.25 : 0,
          }}
        />
      </div>
    </FriWindow>
  );
}

function PreviewPanel() {
  const live = useDeckStep() >= 2;
  return (
    <FriWindow
      label="Live preview"
      className="h-full w-full"
      bodyClassName="relative flex flex-col gap-3"
    >
      <div className="h-6 rounded-[10px] bg-white/[0.07]" />
      <FriLines widths={[210, 170, 190]} />
      <m.div
        className="mt-auto w-fit rounded-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8] px-3.5 py-1.5 text-[12px] font-medium text-white"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: live ? 1 : 0, scale: live ? 1 : 0.9 }}
        transition={{ ...SETTLE, delay: live ? 0.3 : 0 }}
      >
        Decline
      </m.div>
      <m.div
        aria-hidden
        className="absolute bottom-3 left-[92px] text-white"
        initial={{ opacity: 0, x: 26, y: 18 }}
        animate={{ opacity: live ? 1 : 0, x: live ? 0 : 26, y: live ? 0 : 18 }}
        transition={{ ...SETTLE, delay: live ? 0.55 : 0 }}
      >
        <IconPointer size={20} fill="white" />
      </m.div>
    </FriWindow>
  );
}

export function FridayAsk() {
  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>How it works</Kicker>
        <Title size="md">How to ask for something.</Title>
      </Reveal>

      <div className="mt-10 flex items-start gap-5">
        <Panel index={0}>
          <AskPanel />
        </Panel>
        <Arrow step={1} />
        <Panel index={1}>
          <BuildPanel />
        </Panel>
        <Arrow step={2} />
        <Panel index={2}>
          <PreviewPanel />
        </Panel>
      </div>

      <Reveal step={3} className="mt-11">
        <p className="text-3xl text-pretty text-white/85">
          No forms. No tickets. <Accent>A sentence.</Accent>
        </p>
      </Reveal>
    </Shell>
  );
}
