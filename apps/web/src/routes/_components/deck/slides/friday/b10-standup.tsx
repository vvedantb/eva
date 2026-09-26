import { IconSunrise } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  BRAND,
  Body,
  Footnote,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  DUR,
  DrawPath,
  EASE,
  MaskedText,
  Pulse,
  Spotlight,
  cueTransition,
} from "../../_components/motion";
import { Fri2Panel } from "../_parts/Fri2Panel";
import { MOF2_TIMELINE_DOT_Y, MoF2Timeline } from "../_parts/MoF2Timeline";

/**
 * A stand-in for the real thing: plain English, no file names, no jargon. It is
 * written out word by word so the room watches it arrive rather than reads it.
 */
const SUMMARY =
  "Yesterday the team shipped the new referral export, fixed two problems people had reported that morning, and started on the admin dashboard. Nothing is blocked. Three pieces of work are waiting for someone to check them.";

const WORDS = SUMMARY.split(" ");

/** Fast enough to read as typing, slow enough that the last word still lands. */
const WORD_STAGGER = 0.032;
const WRITE_AT = 0.2;
const WRITTEN = WRITE_AT + WORDS.length * WORD_STAGGER + 0.2;

const PANEL_W = 560;
const GAP = 64;

/** Morning light behind the panel while it writes, easing off for the feed. */
const GLOW = [
  null,
  { x: PANEL_W / 2, y: 140, size: 620 },
  { x: PANEL_W / 2, y: 140, size: 460 },
];

export function FridayStandup() {
  const step = useDeckStep();
  const writing = step >= 1;

  return (
    <Shell className="py-12">
      <Kicker>
        <span className="inline-flex items-center gap-2">
          <IconSunrise size={15} aria-hidden />
          On its own · Daily standup
        </span>
      </Kicker>
      <Title size="md">
        A summary, <Accent>every morning</Accent>.
      </Title>
      <Body className="mt-4 max-w-3xl">
        <MaskedText delay={0.4} duration={0.8}>
          About 150 words on what happened yesterday.
        </MaskedText>
      </Body>

      <div
        className="relative isolate mt-10 flex items-start"
        style={{ gap: GAP }}
      >
        <Spotlight shots={GLOW} className="-inset-20 overflow-visible" />
        <m.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.hero, ease: EASE.expo, delay: 0.45 }}
        >
          <Fri2Panel
            className="w-[560px]"
            header={
              <>
                <Pulse color={BRAND.blue} size={6} reach={2.4} delay={1} />
                <span className="ml-1 tabular-nums">08:00 UTC</span>
                <span className="text-white/25">·</span>
                <span>Weekdays</span>
              </>
            }
            bodyClassName="relative min-h-[216px] p-6"
          >
            <m.span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center text-white/[0.12]"
              initial={{ opacity: 0, y: 14 }}
              animate={writing ? { opacity: 0, y: -10 } : { opacity: 1, y: 0 }}
              transition={cueTransition(!writing, 0.8, {
                duration: DUR.hero,
                ease: EASE.expo,
              })}
            >
              <IconSunrise size={64} stroke={1.2} />
            </m.span>
            <p className="relative text-[17px] leading-relaxed text-pretty text-white/85">
              {WORDS.map((word, index) => (
                <m.span
                  // Words repeat, so the index is part of the identity.
                  key={`${word}-${index}`}
                  className="inline-block"
                  style={{ marginRight: "0.26em" }}
                  initial={{ opacity: 0, y: 5 }}
                  animate={
                    writing ? { opacity: 1, y: 0 } : { opacity: 0, y: 5 }
                  }
                  transition={cueTransition(
                    writing,
                    WRITE_AT + index * WORD_STAGGER,
                    { duration: DUR.base, ease: EASE.out },
                  )}
                >
                  {word}
                </m.span>
              ))}
              <m.span
                aria-hidden
                className="inline-block h-[17px] w-[2px] translate-y-[3px] bg-white/70"
                initial={{ opacity: 0 }}
                animate={
                  writing ? { opacity: [0, 1, 1, 0, 0] } : { opacity: 0 }
                }
                transition={
                  writing
                    ? {
                        duration: 1,
                        times: [0, 0.01, 0.5, 0.5, 1],
                        ease: "linear",
                        repeat: Infinity,
                        delay: WRITTEN,
                      }
                    : { duration: 0 }
                }
              />
            </p>
          </Fri2Panel>
        </m.div>

        {/* The summary feeds the timeline: a light runs from the panel to today. */}
        <div
          className="absolute"
          style={{ left: PANEL_W + 6, top: MOF2_TIMELINE_DOT_Y - 1 }}
        >
          <DrawPath
            d={`M0 1 L${GAP - 8} 1`}
            width={GAP - 8}
            height={2}
            step={2}
            duration={0.4}
            strokeWidth={1.5}
            dot
          />
        </div>

        <MoF2Timeline />
      </div>

      <Footnote>
        The morning summary started 20 August 2026. It was rewritten for
        non-technical readers on 21 August 2026.
      </Footnote>
    </Shell>
  );
}
