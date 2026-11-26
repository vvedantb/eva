import type { ReactNode } from "react";
import { IconArrowBackUp, IconFileText, IconShare3 } from "@tabler/icons-react";
import { m } from "motion/react";
import { DUR, EASE, cueTransition } from "../../../_components/motion";
import { BEE_SPRING } from "./BeeIsland";
import { BEE_CARD, SourceChip } from "./BeeBits";

/**
 * The meeting summary Bee writes, and what happens to it after: shared by the
 * summary slide and its fold draft, so both always show the same detail.
 */

interface Action {
  text: string;
  owner: string;
}

/** Example meeting: what was decided and who does what. */
const DECIDED: readonly string[] = [
  "Provider joins the AQP list, if forms are back by Friday",
  "Start with nursing home placements only",
];
const ACTION_ITEMS: readonly Action[] = [
  { text: "Send the onboarding pack", owner: "Sam" },
  { text: "Book the follow-up call", owner: "Jo" },
];

function Section({
  title,
  shown,
  children,
}: {
  title: string;
  shown: boolean;
  children: ReactNode;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={cueTransition(shown, 0.1, BEE_SPRING)}
    >
      <div className="mb-2 text-[15px] font-semibold tracking-[0.1em] text-[#a15f00] uppercase">
        {title}
      </div>
      {children}
    </m.div>
  );
}

/** The note Bee writes when the meeting ends: decisions, then who does what. */
export function SummaryCard({
  decisions,
  actions,
}: {
  decisions: boolean;
  actions: boolean;
}) {
  return (
    <div className={`${BEE_CARD} flex w-[620px] flex-col gap-6 p-8`}>
      <div className="flex items-center gap-3">
        <IconFileText size={22} className="text-[#c27406]" />
        <span className="text-2xl font-semibold text-[#2a1e0c]">
          Provider onboarding · summary
        </span>
      </div>

      <Section title="Decisions" shown={decisions}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {DECIDED.map((line) => (
            <li key={line} className="flex gap-3 text-xl text-[#2a1e0c]/85">
              <span className="mt-2.5 size-2 shrink-0 rounded-full bg-[#f2a516]" />
              {line}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Action items" shown={actions}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {ACTION_ITEMS.map((item) => (
            <li
              key={item.text}
              className="flex items-center gap-3 text-xl text-[#2a1e0c]/85"
            >
              <span className="size-5 shrink-0 rounded-md ring-2 ring-[#2a1e0c]/25" />
              <span className="flex-1">{item.text}</span>
              <span className="rounded-full bg-[#fabe28]/30 px-3 py-0.5 text-[15px] font-semibold text-[#7a4800]">
                {item.owner}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/** Saved to your notes, then forwarded to anyone who missed it. */
export function SummaryAfter({
  saved,
  forward,
}: {
  saved: boolean;
  forward: boolean;
}) {
  return (
    <m.div
      className="mt-24 flex w-[340px] flex-col gap-4"
      initial={{ opacity: 0, x: 24 }}
      animate={saved ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
      transition={cueTransition(saved, 0.2, {
        duration: DUR.hero,
        ease: EASE.expo,
      })}
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-[#fabe28]/30 text-[#7a4800]">
        <IconArrowBackUp size={28} />
      </span>
      <p className="m-0 text-3xl leading-snug font-semibold text-balance text-[#2a1e0c]">
        Saved to your notes, so Bee finds it next time
      </p>

      {/* Missed it: whoever was there forwards the same file. */}
      <m.div
        className="mt-6 flex flex-col gap-3"
        initial={{ opacity: 0, y: 16 }}
        animate={forward ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={cueTransition(forward, 0.2, BEE_SPRING)}
      >
        <span className="flex size-14 items-center justify-center rounded-2xl bg-[#fabe28]/30 text-[#7a4800]">
          <IconShare3 size={28} />
        </span>
        <p className="m-0 text-3xl leading-snug font-semibold text-balance text-[#2a1e0c]">
          Missed it? A colleague forwards it to you
        </p>
        <span className="self-start">
          <SourceChip label="Provider onboarding summary.md" />
        </span>
      </m.div>
    </m.div>
  );
}
