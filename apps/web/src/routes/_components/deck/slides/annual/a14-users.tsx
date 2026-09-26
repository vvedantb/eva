import type { Icon } from "@tabler/icons-react";
import {
  IconChevronRight,
  IconDeviceMobile,
  IconKeyboard,
  IconRouteOff,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  BRAND_GRADIENT,
  DUR,
  EASE,
  MaskedText,
} from "../../_components/motion";

interface Change {
  before: string;
  after: string;
}

/** Top to bottom, in the order they were decided. */
const CHANGES: Change[] = [
  { before: "Reviews, diffs, meters", after: "The conversation and a preview" },
  { before: "A list of twenty models", after: "One slider" },
  { before: "Called PRD", after: "Called Plan" },
  { before: "Written for engineers", after: "Written in plain language" },
];

const CHIPS: readonly { icon: Icon; label: string }[] = [
  { icon: IconDeviceMobile, label: "Usable on a phone" },
  { icon: IconKeyboard, label: "Shortcuts made visible" },
  { icon: IconRouteOff, label: "Dead-end pages removed" },
];

/** The before phrases rise first, then each is struck out and replaced in turn. */
const ROW_GAP = 0.1;
const STRIKE_START = 0.75;
const STRIKE_GAP = 0.2;

function ChangeRow({ before, after, index }: Change & { index: number }) {
  const strike = STRIKE_START + index * STRIKE_GAP;

  return (
    <div className="flex items-center gap-7">
      <m.div
        className="w-[420px] shrink-0 text-2xl leading-snug text-white"
        initial={{ opacity: 0.45 }}
        animate={{ opacity: 0.32 }}
        transition={{ duration: DUR.slow, ease: EASE.out, delay: strike + 0.3 }}
      >
        <span className="relative inline-block">
          <MaskedText delay={index * ROW_GAP} duration={DUR.slow}>
            {before}
          </MaskedText>
          <m.span
            aria-hidden
            className="absolute top-1/2 -left-1 h-[2px] w-[calc(100%+8px)] origin-left rounded-full bg-white/70"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.45, ease: EASE.inOut, delay: strike }}
          />
        </span>
      </m.div>

      <div className="flex items-center gap-4">
        {/* The arrow draws itself from the struck phrase towards its replacement. */}
        <span className="relative flex h-5 w-7 items-center">
          <m.span
            aria-hidden
            className="h-[1.5px] w-full origin-left rounded-full"
            style={{ background: BRAND_GRADIENT }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{
              duration: DUR.base,
              ease: EASE.out,
              delay: strike + 0.2,
            }}
          />
          <m.span
            className="absolute -right-2 flex"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: DUR.base,
              ease: EASE.out,
              delay: strike + 0.35,
            }}
          >
            <IconChevronRight
              size={18}
              stroke={2}
              className="text-[#3B7DD8]"
              aria-hidden
            />
          </m.span>
        </span>
        <span className="text-2xl leading-snug text-white/95">
          <MaskedText delay={strike + 0.3} duration={DUR.slow}>
            {after}
          </MaskedText>
        </span>
      </div>
    </div>
  );
}

export function AnnualUsers() {
  const step = useDeckStep();
  const chipsIn = step >= 1;

  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>People · Users</Kicker>
        <Title size="md">Built for who actually uses it.</Title>
      </Reveal>

      <div className="mt-12 flex flex-col gap-8">
        {CHANGES.map((change, index) => (
          <ChangeRow
            key={change.before}
            before={change.before}
            after={change.after}
            index={index}
          />
        ))}
      </div>

      <div className="mt-12 flex gap-3">
        {CHIPS.map((chip, index) => {
          const at = index * 0.1;
          return (
            <m.div
              key={chip.label}
              initial={false}
              animate={
                chipsIn
                  ? { opacity: 1, y: 0, scale: 1 }
                  : { opacity: 0, y: 16, scale: 0.94 }
              }
              transition={
                chipsIn
                  ? { duration: DUR.slow, ease: EASE.expo, delay: at }
                  : { duration: DUR.fast }
              }
              className="flex items-center gap-2.5 rounded-full bg-white/[0.07] py-2.5 pr-5 pl-4 text-sm text-white/80"
            >
              <m.span
                className="flex"
                initial={false}
                animate={
                  chipsIn
                    ? { opacity: 1, scale: 1, rotate: 0 }
                    : { opacity: 0, scale: 0.4, rotate: -20 }
                }
                transition={
                  chipsIn
                    ? { duration: DUR.base, ease: EASE.expo, delay: at + 0.2 }
                    : { duration: DUR.fast }
                }
              >
                <chip.icon
                  size={16}
                  stroke={1.8}
                  className="text-[#3B7DD8]"
                  aria-hidden
                />
              </m.span>
              {chip.label}
            </m.div>
          );
        })}
      </div>

      <p className="mt-10 text-center text-3xl font-medium text-white/90">
        <MaskedText step={2} delay={0.1}>
          Not cleverer.
        </MaskedText>{" "}
        <MaskedText step={2} delay={0.55} duration={1.1}>
          <Accent>Usable.</Accent>
        </MaskedText>
      </p>

      <Footnote>
        Simple Mode from 14 August 2026; mobile audits August and September
        2026.
      </Footnote>
    </Shell>
  );
}
