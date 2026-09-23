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
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";

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

const GARDENING: readonly string[] = [
  "Lints that catch mistakes early",
  "Types that say what is allowed",
  "Checks on every change",
  "Written rules the model reads",
];

function ArchetypeCard({ archetype }: { archetype: Archetype }) {
  const spotlit = useDeckStep() >= 1;
  const lit = spotlit && archetype.gardener;
  const dimmed = spotlit && !archetype.gardener;

  return (
    <StaggerItem className="relative w-[196px]">
      <m.div
        aria-hidden
        className="pointer-events-none absolute -inset-2 rounded-3xl bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8] blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: lit ? 0.35 : 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      />
      <m.div
        className="relative"
        initial={{ opacity: 1, scale: 1 }}
        animate={{ opacity: dimmed ? 0.35 : 1, scale: lit ? 1.04 : 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      >
        <Card className="flex h-[124px] flex-col justify-between p-5">
          <archetype.icon
            size={26}
            stroke={1.6}
            className="text-white/70"
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

export function Slide13Developer() {
  const step = useDeckStep();

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>The role of the developer</Kicker>
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

        {/* Bracket spans the Sweeper and Maintainer cards: 424px → 1044px. */}
        <div className="relative h-[58px]">
          <Reveal
            step={1}
            distance={8}
            className="absolute top-3 left-[424px] flex w-[620px] flex-col items-center"
          >
            <div className="h-2 w-full rounded-t-lg border-x border-t border-white/15" />
            <div className="mt-2 rounded-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8] px-4 py-1 text-sm font-medium text-white">
              The Gardener
            </div>
          </Reveal>
        </div>
      </div>

      <div className="mt-16 flex gap-3">
        {GARDENING.map((item, index) => (
          <m.div
            key={item}
            className="rounded-full bg-white/[0.07] px-5 py-2.5 text-base text-white/80"
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={
              step >= 2
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 14, scale: 0.94 }
            }
            transition={{
              type: "spring",
              bounce: 0,
              duration: 0.55,
              delay: step >= 2 ? index * 0.08 : 0,
            }}
          >
            {item}
          </m.div>
        ))}
      </div>

      <Reveal step={3} className="mt-14">
        <p className="flex items-center gap-4 text-2xl text-pretty text-white/85">
          <IconSeeding
            size={28}
            stroke={1.6}
            className="shrink-0 text-[#3B7DD8]"
            aria-hidden
          />
          <span>
            For CarePulse, that job is the <Accent>v3 migration</Accent>.
          </span>
        </p>
      </Reveal>

      <Footnote>
        Archetypes: Boris Cherny, X, 28 June 2026. Hand-written code remark:
        Fortune Brainstorm Tech, reported 11 June 2026.
      </Footnote>
    </Shell>
  );
}
