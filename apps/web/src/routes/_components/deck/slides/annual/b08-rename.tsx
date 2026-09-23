import { AnimatePresence, m } from "motion/react";
import {
  Accent,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  useDeckStep,
} from "../../_components/DeckPrimitives";

interface Moment {
  date: string;
  label: string;
}

const MOMENTS: readonly Moment[] = [
  { date: "3 June 2026", label: "The repository moved" },
  { date: "24 July 2026", label: "Packages renamed to match" },
];

const WORD_CLASS =
  "text-8xl leading-none font-semibold tracking-[-0.03em] text-white";

export function AnnualRename() {
  const named = useDeckStep() >= 1;

  return (
    <Shell center className="py-14">
      <Reveal from="none">
        <Kicker>The name</Kicker>
      </Reveal>

      <div className="flex h-40 items-center">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={named ? "eva" : "conductor"}
            className={WORD_CLASS}
            initial={{ opacity: 0, filter: "blur(18px)", scale: 0.96 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
            exit={{
              opacity: 0,
              filter: "blur(18px)",
              scale: 1.03,
              transition: { duration: 0.35, ease: EASE_OUT },
            }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
          >
            {named ? <Accent>Eva</Accent> : "Conductor"}
          </m.div>
        </AnimatePresence>
      </div>

      <Reveal step={2} delay={0.1}>
        <div className="flex gap-20">
          {MOMENTS.map((moment) => (
            <div key={moment.date}>
              <div className="text-2xl font-medium tabular-nums text-white">
                {moment.date}
              </div>
              <div className="mt-2 text-sm text-white/45">{moment.label}</div>
            </div>
          ))}
        </div>
      </Reveal>

      <Footnote className="text-center">
        Renamed 3 June 2026; internal packages 24 July 2026.
      </Footnote>
    </Shell>
  );
}
