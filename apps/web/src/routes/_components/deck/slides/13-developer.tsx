import type { Icon } from "@tabler/icons-react";
import {
  IconBrush,
  IconBulb,
  IconHammer,
  IconSeeding,
  IconShieldCheck,
  IconTrendingUp,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";
import {
  DUR,
  DrawPath,
  EASE,
  LEAVE,
  MaskedText,
  SETTLE,
  Sheen,
  cueTransition,
} from "../_components/motion";
import { MoF3Gardening } from "./_parts/MoF3Gardening";

interface Archetype {
  name: string;
  icon: Icon;
  /** Part of the Sweeper and Maintainer blend we call the Gardener. */
  gardener: boolean;
}

/** Boris Cherny's five archetypes, in his order. What each does is in the notes. */
const ARCHETYPES: readonly Archetype[] = [
  { name: "Prototyper", icon: IconBulb, gardener: false },
  { name: "Builder", icon: IconHammer, gardener: false },
  { name: "Sweeper", icon: IconBrush, gardener: true },
  { name: "Grower", icon: IconTrendingUp, gardener: false },
  { name: "Maintainer", icon: IconShieldCheck, gardener: true },
];

const ROW_WIDTH = 1088;
const CARD_WIDTH = 196;
const CARD_GAP = 16;
const cardCentre = (index: number) =>
  index * (CARD_WIDTH + CARD_GAP) + CARD_WIDTH / 2;
const SWEEPER = cardCentre(2);
const MAINTAINER = cardCentre(4);
const MIDDLE = (SWEEPER + MAINTAINER) / 2;

/** The bracket draws in from both cards and meets under the label. */
const BRACKET_H = 58;
const BRACKET_LEFT = `M${SWEEPER} 0 V6 Q${SWEEPER} 14 ${SWEEPER + 8} 14 H${MIDDLE}`;
const BRACKET_RIGHT = `M${MAINTAINER} 0 V6 Q${MAINTAINER} 14 ${MAINTAINER - 8} 14 H${MIDDLE}`;

/** Soft light under a gardener card. A painted gradient, never a blur. */
const CARD_GLOW =
  "radial-gradient(closest-side, rgba(139,63,184,0.5), rgba(59,125,216,0.2) 60%, transparent)";

function ArchetypeCard({ archetype }: { archetype: Archetype }) {
  const spotlit = useDeckStep() >= 1;
  const lit = spotlit && archetype.gardener;
  const dimmed = spotlit && !archetype.gardener;

  return (
    <StaggerItem className="relative">
      <m.div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 top-1/2 -bottom-14"
        style={{ background: CARD_GLOW }}
        initial={{ opacity: 0 }}
        animate={{ opacity: lit ? 0.75 : 0 }}
        transition={lit ? { duration: DUR.slow, delay: 0.15 } : LEAVE}
      />
      <m.div
        className="relative"
        style={{ width: CARD_WIDTH }}
        initial={false}
        animate={{
          opacity: dimmed ? 0.35 : 1,
          scale: lit ? 1.05 : dimmed ? 0.97 : 1,
          y: lit ? -8 : 0,
        }}
        transition={SETTLE}
      >
        <Card className="flex h-[124px] flex-col justify-between p-5">
          <archetype.icon
            size={26}
            stroke={1.6}
            className={lit ? "text-white" : "text-white/70"}
            aria-hidden
          />
          <div className="text-xl leading-none font-semibold text-white">
            {archetype.name}
          </div>
        </Card>
      </m.div>
    </StaggerItem>
  );
}

function GardenerBracket() {
  const on = useDeckStep() >= 1;
  return (
    <div className="relative" style={{ height: BRACKET_H }}>
      {[BRACKET_LEFT, BRACKET_RIGHT].map((d) => (
        <DrawPath
          key={d}
          d={d}
          width={ROW_WIDTH}
          height={BRACKET_H}
          step={1}
          delay={0.2}
          duration={0.7}
          strokeWidth={1.5}
          dot
          className="absolute inset-0"
        />
      ))}
      <m.div
        className="absolute top-6"
        style={{ left: MIDDLE, x: "-50%" }}
        initial={{ opacity: 0, scale: 0.8, y: -6 }}
        animate={
          on
            ? { opacity: 1, scale: 1, y: 0 }
            : { opacity: 0, scale: 0.8, y: -6 }
        }
        transition={on ? { ...SETTLE, delay: 0.8 } : LEAVE}
      >
        <Sheen step={1} delay={1.1} className="rounded-full">
          <div className="rounded-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8] px-4 py-1 text-sm font-medium whitespace-nowrap text-white">
            The Gardener
          </div>
        </Sheen>
      </m.div>
    </div>
  );
}

export function Slide13Developer() {
  const closing = useDeckStep() >= 3;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>What&apos;s next · Developers</Kicker>
        <Title size="md" className="text-balance">
          From writing code to <Accent>tending the garden</Accent>.
        </Title>
      </Reveal>

      <div className="mt-12">
        <Stagger delayChildren={0.4} className="flex gap-4">
          {ARCHETYPES.map((archetype) => (
            <ArchetypeCard key={archetype.name} archetype={archetype} />
          ))}
        </Stagger>
        <GardenerBracket />
        <MoF3Gardening from={MIDDLE} width={ROW_WIDTH} />
      </div>

      <div className="mt-14 flex items-center gap-4 text-2xl text-pretty text-white/85">
        {/* The seedling grows out of the soil line as the sentence rises. */}
        <m.span
          className="origin-bottom"
          initial={{ opacity: 0, scale: 0.3, rotate: -18 }}
          animate={
            closing
              ? { opacity: 1, scale: 1, rotate: 0 }
              : { opacity: 0, scale: 0.3, rotate: -18 }
          }
          transition={cueTransition(closing, 0.05, {
            duration: DUR.hero,
            ease: EASE.expo,
          })}
        >
          <IconSeeding
            size={28}
            stroke={1.6}
            className="shrink-0 text-[#3B7DD8]"
            aria-hidden
          />
        </m.span>
        <MaskedText step={3} delay={0.15}>
          For CarePulse, that job is the <Accent>v3 migration</Accent>.
        </MaskedText>
      </div>

      <Footnote>
        Archetypes: Boris Cherny, X, 28 June 2026. Hand-written code remark:
        Fortune Brainstorm Tech, reported 11 June 2026.
      </Footnote>
    </Shell>
  );
}
