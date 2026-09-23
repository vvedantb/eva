import { IconSunrise } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  BRAND,
  Body,
  EASE_OUT,
  Footnote,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Fri2Panel } from "../_parts/Fri2Panel";

/**
 * A stand-in for the real thing: plain English, no file names, no jargon. It is
 * written out word by word so the room watches it arrive rather than reads it.
 */
const SUMMARY =
  "Yesterday the team shipped the new referral export, fixed two problems people had reported that morning, and started on the admin dashboard. Nothing is blocked. Three pieces of work are waiting for someone to check them.";

const WORDS = SUMMARY.split(" ");

/** Fast enough to read as typing, slow enough that the last word still lands. */
const WORD_STAGGER = 0.035;

const DAYS: readonly string[] = ["Today", "Yesterday"];

function TimelineEntry({ shown, delay }: { shown: boolean; delay: number }) {
  return (
    <m.div
      className="flex gap-3 rounded-[14px] bg-white/[0.05] p-3.5"
      initial={{ opacity: 0, y: 22 }}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }}
      transition={{ type: "spring", bounce: 0, duration: 0.6, delay }}
    >
      <span
        aria-hidden
        className="mt-1 size-2 shrink-0 rounded-full"
        style={{ backgroundColor: BRAND.blue }}
      />
      <div className="flex-1">
        <div className="text-xs tabular-nums text-white/55">08:00</div>
        <div className="mt-2.5 space-y-2">
          <span className="block h-1.5 w-full rounded-full bg-white/15" />
          <span className="block h-1.5 w-[86%] rounded-full bg-white/12" />
          <span className="block h-1.5 w-[92%] rounded-full bg-white/12" />
          <span className="block h-1.5 w-[64%] rounded-full bg-white/10" />
        </div>
      </div>
    </m.div>
  );
}

export function FridayStandup() {
  const step = useDeckStep();
  const writing = step >= 1;
  const timeline = step >= 2;

  return (
    <Shell className="py-12">
      <Kicker>
        <span className="inline-flex items-center gap-2">
          <IconSunrise size={15} aria-hidden />
          Daily standup
        </span>
      </Kicker>
      <Title size="md">
        A summary, <Accent>every morning</Accent>.
      </Title>
      <Body className="mt-4 max-w-3xl">
        About 150 words on what happened yesterday.
      </Body>

      <div className="mt-8 flex items-start gap-14">
        <Fri2Panel
          className="w-[560px]"
          header={
            <>
              <span className="tabular-nums">08:00 UTC</span>
              <span className="text-white/25">·</span>
              <span>Weekdays</span>
            </>
          }
          bodyClassName="min-h-[216px] p-6"
        >
          <p className="text-[17px] leading-relaxed text-pretty text-white/85">
            {WORDS.map((word, index) => (
              <m.span
                // Words repeat, so the index is part of the identity.
                key={`${word}-${index}`}
                className="inline-block"
                style={{ marginRight: "0.26em" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: writing ? 1 : 0 }}
                transition={{
                  duration: 0.18,
                  ease: EASE_OUT,
                  delay: writing ? index * WORD_STAGGER : 0,
                }}
              >
                {word}
              </m.span>
            ))}
            <m.span
              aria-hidden
              className="inline-block h-[17px] w-[2px] translate-y-[3px] bg-white/70"
              animate={{ opacity: [1, 1, 0, 0] }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          </p>
        </Fri2Panel>

        <div className="w-[320px]">
          {DAYS.map((day, index) => (
            <div key={day} className={index > 0 ? "mt-4" : undefined}>
              <m.div
                className="mb-2.5 text-sm font-medium text-white/85"
                initial={{ opacity: 0, y: 22 }}
                animate={
                  timeline ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }
                }
                transition={{
                  type: "spring",
                  bounce: 0,
                  duration: 0.6,
                  delay: timeline ? index * 0.14 : 0,
                }}
              >
                {day}
              </m.div>
              <TimelineEntry
                shown={timeline}
                delay={timeline ? index * 0.14 + 0.07 : 0}
              />
            </div>
          ))}
        </div>
      </div>

      <Footnote>
        The morning summary started 20 August 2026. It was rewritten for
        non-technical readers on 21 August 2026.
      </Footnote>
    </Shell>
  );
}
