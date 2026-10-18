import type { Icon } from "@tabler/icons-react";
import { IconMessageQuestion, IconScale } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  DUR,
  EASE,
  Spotlight,
  brandTint,
  cueTransition,
} from "../../_components/motion";

const ASK = 1;
const JUDGE = 2;
const CLOSE = 3;

const W = 1088;
const CARD_W = 500;
const GAP = 88;
const H = 260;

interface Skill {
  step: number;
  icon: Icon;
  line: string;
}

const SKILLS: readonly Skill[] = [
  { step: ASK, icon: IconMessageQuestion, line: "Knowing what to ask" },
  { step: JUDGE, icon: IconScale, line: "Knowing how to judge the answer" },
];

/** Leans towards each half as it lands, then squares up for the close. */
const SHOTS: readonly CameraShot[] = [
  { translateZ: -40 },
  { rotateY: 6, x: 60 },
  { rotateY: -6, x: -60 },
  { translateZ: -20, y: -10 },
];

const GLOW = [
  { x: W / 2, y: H / 2, size: 520 },
  { x: CARD_W / 2, y: H / 2, size: 560 },
  { x: CARD_W + GAP + CARD_W / 2, y: H / 2, size: 560 },
  { x: W / 2, y: H / 2, size: 900 },
];

function SkillCard({ skill }: { skill: Skill }) {
  const step = useDeckStep();
  const shown = step >= skill.step;
  const current = step === skill.step;
  const Glyph = skill.icon;

  return (
    <m.div
      className="flex flex-col justify-between rounded-[28px] p-8 ring-1 ring-white/10 ring-inset"
      style={{
        width: CARD_W,
        height: H,
        background: brandTint("26", "1a"),
      }}
      initial={{ opacity: 0.18, y: 18, scale: 0.97 }}
      animate={{
        opacity: shown ? (current || step >= CLOSE ? 1 : 0.6) : 0.18,
        y: shown ? 0 : 18,
        scale: shown ? 1 : 0.97,
      }}
      transition={{ duration: DUR.hero, ease: EASE.expo }}
    >
      <m.span
        className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8B3FB8]/40 to-[#3B7DD8]/40"
        initial={{ scale: 0.6, rotate: -14 }}
        animate={shown ? { scale: 1, rotate: 0 } : { scale: 0.6, rotate: -14 }}
        transition={cueTransition(shown, 0.25, {
          type: "spring",
          bounce: 0.4,
          duration: 0.7,
        })}
      >
        <Glyph size={28} stroke={1.6} className="text-white" />
      </m.span>
      <div className="text-4xl leading-[1.1] font-semibold tracking-[-0.02em] text-balance text-white">
        {skill.line}
      </div>
    </m.div>
  );
}

export function FridayAskJudge() {
  const step = useDeckStep();
  const closed = step >= CLOSE;
  const both = step >= JUDGE;

  return (
    <Shell className="py-14">
      <Title size="md">
        The only intelligence that <Accent>matters</Accent>.
      </Title>

      <Camera shots={SHOTS} className="mt-14">
        <div
          className="relative isolate flex"
          style={{ width: W, height: H, gap: GAP }}
        >
          <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />
          {SKILLS.map((skill) => (
            <SkillCard key={skill.line} skill={skill} />
          ))}
          {/* The two halves only count together. */}
          <m.span
            aria-hidden
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl font-semibold text-white/40"
            style={{ left: CARD_W + GAP / 2 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: both ? 1 : 0 }}
            transition={cueTransition(both, 0.1, { duration: DUR.base })}
          >
            +
          </m.span>
        </div>
      </Camera>

      <m.div
        className="mt-12 text-center text-2xl text-white/70"
        initial={{ opacity: 0, y: 14 }}
        animate={closed ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
        transition={cueTransition(closed, 0.3, {
          duration: DUR.slow,
          ease: EASE.expo,
        })}
      >
        Increasingly so, in the age of AI.
      </m.div>
    </Shell>
  );
}
