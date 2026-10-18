import type { ReactNode } from "react";
import type { Icon } from "@tabler/icons-react";
import {
  IconArrowRight,
  IconBolt,
  IconCoin,
  IconFeather,
  IconPlus,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import {
  useInk,
  Accent,
  BRAND,
  Footnote,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  BRAND_GRADIENT,
  DUR,
  EASE,
  Spotlight,
  cueTransition,
} from "../../_components/motion";

const WRITE = 1;
const SCORE = 2;
const RECIPE = 3;
const WHY = 4;

const PANEL_W = 524;
const GAP = 40;

/** Left camera on the writer, right on the judge, then back for the recipe. */
const SHOTS: readonly CameraShot[] = [
  { translateZ: -20 },
  { rotateY: 6, x: 40, translateZ: 10 },
  { rotateY: -6, x: -40, translateZ: 10 },
  { translateZ: -40, y: -10 },
  { translateZ: -60, y: -18 },
];

const GLOW = [
  null,
  { x: PANEL_W / 2, y: 170, size: 520 },
  { x: PANEL_W + GAP + PANEL_W / 2, y: 170, size: 560 },
  { x: PANEL_W + GAP / 2, y: 200, size: 900 },
  { x: PANEL_W + GAP / 2, y: 320, size: 900 },
];

interface Benefit {
  icon: Icon;
  label: string;
}

/** Why a model this size is worth having: the reason it can run on everything. */
const BENEFITS: readonly Benefit[] = [
  { icon: IconFeather, label: "Very small model" },
  { icon: IconCoin, label: "Fractions of a penny per check" },
  { icon: IconBolt, label: "Answers in under a second" },
];

function Benefits() {
  const shown = useDeckStep() >= WHY;
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      {BENEFITS.map((benefit, index) => {
        const Glyph = benefit.icon;
        const at = 0.25 + index * 0.16;
        return (
          <m.span
            key={benefit.label}
            className="flex items-center gap-2.5 rounded-full bg-white/[0.07] px-5 py-2.5 text-lg text-white/90"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={
              shown
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 16, scale: 0.96 }
            }
            transition={cueTransition(shown, at, {
              duration: DUR.slow,
              ease: EASE.expo,
            })}
          >
            <m.span
              className="flex"
              style={{ color: BRAND.blue }}
              initial={{ rotate: -20, scale: 0.6 }}
              animate={
                shown ? { rotate: 0, scale: 1 } : { rotate: -20, scale: 0.6 }
              }
              transition={cueTransition(shown, at + 0.1, {
                type: "spring",
                bounce: 0.45,
                duration: 0.6,
              })}
            >
              <Glyph size={20} stroke={1.8} />
            </m.span>
            {benefit.label}
          </m.span>
        );
      })}
    </div>
  );
}

/** What a writing model hands back: new words, a different answer each time. */
const WRITTEN =
  "The export shows the wrong date because the time zone is not applied. A fix would convert the date before it is written, and…".split(
    " ",
  );

interface Row {
  item: string;
  score: number;
}

/** The data, judged against one condition. Above the line, Eva acts. */
const ROWS: readonly Row[] = [
  { item: "Login fails for everyone", score: 97 },
  { item: "Export shows the wrong date", score: 64 },
  { item: "Make the logo bigger", score: 6 },
  { item: "Typo on the help page", score: 3 },
];

const LINE = 60;
const BAR_W = 150;

function Panel({
  label,
  focused,
  dimmed,
  children,
}: {
  label: string;
  focused: boolean;
  dimmed: boolean;
  children: ReactNode;
}) {
  return (
    <m.div
      className="flex h-[340px] flex-col rounded-[24px] bg-white/[0.05] p-6 ring-1 ring-white/10 ring-inset"
      style={{ width: PANEL_W }}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: dimmed ? 0.4 : focused ? 1 : 0.7, y: 0 }}
      transition={{ duration: DUR.slow, ease: EASE.out }}
    >
      <div className="text-sm font-medium tracking-wide text-white/50">
        {label}
      </div>
      {children}
    </m.div>
  );
}

function Writer() {
  const step = useDeckStep();
  const writing = step >= WRITE;
  const at = step === WRITE ? 0.5 : 0;

  return (
    <Panel
      label="A typical model"
      focused={step === WRITE}
      dimmed={step >= RECIPE}
    >
      <div className="mt-5 w-fit rounded-2xl bg-white/[0.08] px-4 py-2.5 text-base text-white/85">
        Why is the export date wrong?
      </div>
      <p className="mt-5 text-xl leading-relaxed text-white/85">
        {WRITTEN.map((word, index) => (
          <m.span
            key={`${word}-${index}`}
            className="inline-block whitespace-pre"
            initial={{ opacity: 0, y: 4 }}
            animate={writing ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
            transition={cueTransition(writing, at + index * 0.07, {
              duration: DUR.base,
              ease: EASE.out,
            })}
          >
            {`${word} `}
          </m.span>
        ))}
      </p>
      <m.div
        className="mt-auto text-base text-white/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: writing ? 1 : 0 }}
        transition={cueTransition(writing, at + WRITTEN.length * 0.07, {
          duration: DUR.base,
        })}
      >
        Output: new text, worded differently each time.
      </m.div>
    </Panel>
  );
}

function ScoreRow({ row, index }: { row: Row; index: number }) {
  const ink = useInk();
  const step = useDeckStep();
  const scored = step >= SCORE;
  const at = step === SCORE ? 0.9 + index * 0.16 : 0;
  const above = row.score >= LINE;

  return (
    <div className="flex h-11 items-center gap-4">
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-base",
          scored && above ? "text-white" : "text-white/65",
        )}
      >
        {row.item}
      </span>
      <div
        className="relative h-2 shrink-0 rounded-full bg-white/[0.08]"
        style={{ width: BAR_W }}
      >
        <m.div
          className="absolute inset-y-0 left-0 origin-left rounded-full"
          style={{
            width: `${row.score}%`,
            background: above ? BRAND_GRADIENT : ink(0.3),
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: scored ? 1 : 0 }}
          transition={cueTransition(scored, at, {
            duration: DUR.slow,
            ease: EASE.expo,
          })}
        />
      </div>
      <m.span
        className={cn(
          "w-12 text-right text-base font-semibold tabular-nums",
          above ? "text-white" : "text-white/40",
        )}
        initial={{ opacity: 0 }}
        animate={{ opacity: scored ? 1 : 0 }}
        transition={cueTransition(scored, at + 0.3, { duration: DUR.base })}
      >
        {row.score}%
      </m.span>
    </div>
  );
}

function Judge() {
  const step = useDeckStep();
  const scored = step >= SCORE;
  const at = step === SCORE ? 0.35 : 0;

  return (
    <Panel label="Jev" focused={step === SCORE} dimmed={step >= RECIPE}>
      <m.div
        className="mt-5 w-fit rounded-2xl px-4 py-2.5 text-base text-white ring-1 ring-inset"
        style={{ background: `${BRAND.purple}26`, borderColor: BRAND.purple }}
        initial={{ opacity: 0, x: -10 }}
        animate={scored ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
        transition={cueTransition(scored, at, {
          duration: DUR.base,
          ease: EASE.out,
        })}
      >
        Condition: is this urgent?
      </m.div>
      <div className="relative mt-4 flex flex-col">
        {ROWS.map((row, index) => (
          <ScoreRow key={row.item} row={row} index={index} />
        ))}
        {/* The line you set: above it, Eva acts. */}
        <m.div
          aria-hidden
          className="absolute -top-2 -bottom-2 w-px bg-white/40"
          style={{ right: 64 + BAR_W * (1 - LINE / 100) }}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={
            scored ? { opacity: 1, scaleY: 1 } : { opacity: 0, scaleY: 0 }
          }
          transition={cueTransition(scored, at + 1.6, {
            duration: DUR.slow,
            ease: EASE.expo,
          })}
        />
      </div>
      <m.div
        className="mt-auto text-base text-white/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: scored ? 1 : 0 }}
        transition={cueTransition(scored, at + 1.9, { duration: DUR.base })}
      >
        Output: a score per item, the same every time.
      </m.div>
    </Panel>
  );
}

/** The recipe, read left to right: what you bring, and what comes back. */
function Recipe() {
  const shown = useDeckStep() >= RECIPE;
  const parts = [
    { kind: "chip", label: "Your data" },
    { kind: "plus" },
    { kind: "chip", label: "A condition" },
    { kind: "arrow" },
    { kind: "result", label: "A score for each item" },
  ];

  return (
    <div className="mt-8 flex items-center justify-center gap-4">
      {parts.map((part, index) => {
        const at = 0.3 + index * 0.14;
        return (
          <m.div
            key={`${part.kind}-${index}`}
            initial={{ opacity: 0, y: 16 }}
            animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            transition={cueTransition(shown, at, {
              duration: DUR.slow,
              ease: EASE.expo,
            })}
          >
            {part.kind === "plus" ? (
              <IconPlus size={22} className="text-white/40" aria-hidden />
            ) : part.kind === "arrow" ? (
              <IconArrowRight size={22} className="text-white/40" aria-hidden />
            ) : (
              <span
                className={cn(
                  "block rounded-full px-5 py-2.5 text-lg",
                  part.kind === "result"
                    ? "bg-white/[0.1] font-medium text-white ring-1 ring-[#8B3FB8]/60"
                    : "bg-white/[0.07] text-white/85",
                )}
              >
                {part.label}
              </span>
            )}
          </m.div>
        );
      })}
    </div>
  );
}

export function FridayJevWhat() {
  return (
    <Shell className="py-14">
      <Title size="md">
        Most models write. Jev <Accent>decides</Accent>.
      </Title>

      <Camera shots={SHOTS} className="mt-10">
        <div className="relative isolate flex" style={{ gap: GAP }}>
          <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />
          <Writer />
          <Judge />
        </div>
      </Camera>

      <Recipe />
      <Benefits />

      <Footnote>
        Jev is TypeSafe&apos;s decision model, reached through Vercel&apos;s AI
        Gateway. The question, items and scores shown are an illustration.
      </Footnote>
    </Shell>
  );
}
