import { m } from "motion/react";
import type { Transition } from "motion/react";
import {
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { FriLines, FriTyped, FriWindow } from "../_parts/FriMock";

interface Cursor {
  name: string;
  colour: string;
  left: number;
  top: number;
  drift: number[];
}

/** Two people in the same paragraph, which is the whole point of the slide. */
const CURSORS: readonly Cursor[] = [
  { name: "Zuza", colour: "#8B3FB8", left: 318, top: 96, drift: [0, 10, 0] },
  { name: "Eva", colour: "#3B7DD8", left: 96, top: 156, drift: [0, -8, 0] },
];

interface Version {
  label: string;
  when: string;
}

/** Newest first. The times are the only numbers on the slide. */
const VERSIONS: readonly Version[] = [
  { label: "Zuza", when: "now" },
  { label: "Eva", when: "11:04" },
  { label: "Kezia", when: "09:20" },
  { label: "Matt", when: "Tue" },
];

const SETTLE: Transition = { type: "spring", bounce: 0, duration: 0.55 };

function LiveCursor({ cursor }: { cursor: Cursor }) {
  return (
    <m.div
      className="absolute flex items-start"
      style={{ left: cursor.left, top: cursor.top }}
      animate={{ x: cursor.drift }}
      transition={{ duration: 3.2, ease: "easeInOut", repeat: Infinity }}
    >
      <span
        aria-hidden
        className="h-5 w-[2px] rounded-full"
        style={{ backgroundColor: cursor.colour }}
      />
      <span
        className="ml-1 rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium text-white"
        style={{ backgroundColor: cursor.colour }}
      >
        {cursor.name}
      </span>
    </m.div>
  );
}

function CommentPin() {
  const anchored = useDeckStep() >= 1;

  return (
    <div className="absolute top-[196px] right-5 flex items-center gap-2.5">
      <m.span
        className="size-7 shrink-0 rounded-full bg-gradient-to-br from-[#8B3FB8] to-[#3B7DD8]"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: anchored ? 1 : 0, scale: anchored ? 1 : 0.6 }}
        transition={anchored ? SETTLE : { duration: 0.2, ease: EASE_OUT }}
      />
      <m.span
        className="rounded-[12px] bg-white/[0.1] px-3 py-1.5 text-[12px] text-white/80"
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: anchored ? 1 : 0, x: anchored ? 0 : 12 }}
        transition={{ ...SETTLE, delay: anchored ? 0.15 : 0 }}
      >
        Agree, resolved
      </m.span>
    </div>
  );
}

function VersionList() {
  const shown = useDeckStep() >= 2;

  return (
    <m.div
      className="w-[300px] shrink-0"
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: shown ? 1 : 0, x: shown ? 0 : 28 }}
      transition={shown ? SETTLE : { duration: 0.25, ease: EASE_OUT }}
    >
      <FriWindow
        label="History"
        className="h-[330px] w-full"
        bodyClassName="flex flex-col gap-2"
      >
        {VERSIONS.map((version, index) => (
          <m.div
            key={version.when}
            className="flex items-center gap-3 rounded-[12px] bg-white/[0.05] px-3 py-2.5"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: shown ? 1 : 0, x: shown ? 0 : 16 }}
            transition={{ ...SETTLE, delay: shown ? 0.12 + index * 0.08 : 0 }}
          >
            <span className="flex-1 text-[13px] text-white/70">
              {version.label}
            </span>
            <span className="text-[12px] text-white/40 tabular-nums">
              {version.when}
            </span>
          </m.div>
        ))}
      </FriWindow>
    </m.div>
  );
}

export function FridayDocuments() {
  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Documents</Kicker>
        <Title size="md">Write it down together.</Title>
      </Reveal>

      <div className="mt-10 flex gap-6">
        <Reveal delay={0.1} className="relative">
          <FriWindow
            label="Referral portal — plan"
            className="h-[330px] w-[700px]"
            bodyClassName="relative flex flex-col gap-4 px-6 py-5"
          >
            <div className="text-lg font-medium text-white">
              <FriTyped text="Decline reasons" delay={0.5} duration={0.9} />
            </div>
            <FriLines widths={[560, 480, 520]} />
            <FriLines widths={[440, 500, 380]} className="mt-1" />
            {CURSORS.map((cursor) => (
              <LiveCursor key={cursor.name} cursor={cursor} />
            ))}
          </FriWindow>
          <CommentPin />
        </Reveal>

        <VersionList />
      </div>

      <Footnote>Collaborative documents, 10 June 2026.</Footnote>
    </Shell>
  );
}
