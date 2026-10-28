import type { ReactNode } from "react";
import { IconArrowBackUp, IconFileText, IconShare3 } from "@tabler/icons-react";
import { m } from "motion/react";
import { Shell, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { DUR, EASE, cueTransition } from "../../_components/motion";
import { BEE_SPRING } from "./_parts/BeeIsland";
import { BEE_CARD, SourceChip } from "./_parts/BeeBits";

const DECISIONS = 1;
const ACTIONS = 2;
const SAVED = 3;
const FORWARD = 4;

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

const SHOTS: readonly CameraShot[] = [
  { rotateY: -8, translateZ: -40, x: -60 },
  { rotateY: -4, x: -30 },
  { rotateY: 0 },
  { rotateY: 5, translateZ: -40, x: -90 },
  { rotateY: 6, translateZ: -50, x: -100 },
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

export function BeeSummary() {
  const step = useDeckStep();
  const saved = step >= SAVED;
  const forward = step >= FORWARD;

  return (
    <Shell className="justify-center py-14">
      <Camera shots={SHOTS}>
        <div className="relative flex h-[460px] w-[1088px] items-start gap-12">
          {/* The note Bee writes when the meeting ends. */}
          <div className={`${BEE_CARD} flex w-[620px] flex-col gap-6 p-8`}>
            <div className="flex items-center gap-3">
              <IconFileText size={22} className="text-[#c27406]" />
              <span className="text-2xl font-semibold text-[#2a1e0c]">
                Provider onboarding · summary
              </span>
            </div>

            <Section title="Decisions" shown={step >= DECISIONS}>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {DECIDED.map((line) => (
                  <li
                    key={line}
                    className="flex gap-3 text-xl text-[#2a1e0c]/85"
                  >
                    <span className="mt-2.5 size-2 shrink-0 rounded-full bg-[#f2a516]" />
                    {line}
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Action items" shown={step >= ACTIONS}>
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

          {/* It goes back into your notes, ready for next time. */}
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
        </div>
      </Camera>
    </Shell>
  );
}
