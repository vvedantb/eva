import type { Icon } from "@tabler/icons-react";
import {
  IconBug,
  IconChecklist,
  IconFileText,
  IconGitPullRequest,
  IconMoonStars,
  IconStack2,
  IconTestPipe,
} from "@tabler/icons-react";
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
  cueTransition,
} from "../../_components/motion";
import { Fri2Chip } from "../_parts/Fri2Chip";
import { MOF2_SWEEP, MoF2Dial } from "../_parts/MoF2Dial";

interface Routine {
  icon: Icon;
  label: string;
}

/** The five maintenance routines, in the order they run overnight. */
const ROUTINES: readonly Routine[] = [
  { icon: IconBug, label: "Find critical bugs" },
  { icon: IconTestPipe, label: "Add test coverage" },
  { icon: IconFileText, label: "Generate docs" },
  { icon: IconStack2, label: "Improve code structure" },
  { icon: IconChecklist, label: "Code-quality review" },
];

/** Fixed geometry, so each routine's line lands on its own review row. */
const CHIPS_X = 300;
const CHIP_W = 320;
const PRS_X = 808;
const ROW = 44;
const GAP = 12;
const TOP = 16;
const rowY = (index: number) => TOP + index * (ROW + GAP);
const LINE_W = PRS_X - CHIPS_X - CHIP_W;
const HAND_OFF = 0.12;

function ReviewRow({ index }: { index: number }) {
  const opened = useDeckStep() >= 2;
  const at = 0.3 + index * HAND_OFF;
  return (
    <m.div
      className="absolute flex items-center gap-3 rounded-xl bg-white/[0.07] px-3.5 ring-1 ring-white/[0.06]"
      style={{ left: PRS_X, top: rowY(index), width: 280, height: ROW }}
      initial={{ opacity: 0, x: -18 }}
      animate={opened ? { opacity: 1, x: 0 } : { opacity: 0, x: -18 }}
      transition={cueTransition(opened, at, {
        duration: DUR.slow,
        ease: EASE.expo,
      })}
    >
      <IconGitPullRequest
        size={16}
        stroke={1.6}
        aria-hidden
        style={{ color: BRAND.blue }}
      />
      <div className="flex flex-1 flex-col gap-1.5">
        <span
          className="h-1.5 rounded-full bg-white/20"
          style={{ width: `${88 - index * 7}%` }}
        />
        <span className="h-1 w-1/3 rounded-full bg-white/[0.08]" />
      </div>
      <m.span
        aria-hidden
        className="size-2 rounded-full bg-emerald-400"
        initial={{ scale: 0 }}
        animate={{ scale: opened ? 1 : 0 }}
        transition={cueTransition(opened, at + 0.3, {
          duration: DUR.base,
          ease: EASE.out,
        })}
      />
    </m.div>
  );
}

export function FridayAutomations() {
  const step = useDeckStep();
  const running = step >= 1;

  return (
    <Shell className="py-12">
      <Kicker>
        <span className="inline-flex items-center gap-2">
          <IconMoonStars size={15} aria-hidden />
          On its own · Automations Hub
        </span>
      </Kicker>
      <Title size="md">
        Work that <Accent>starts itself</Accent>.
      </Title>
      <Body className="mt-4 max-w-3xl">
        <MaskedText delay={0.4} duration={0.8}>
          Install a routine once, for everyone.
        </MaskedText>
      </Body>

      {/* Edge to edge on the 1088px content width: dial, routines, results. */}
      <div className="relative mt-16 h-[300px] w-full">
        <div className="absolute top-0 left-0">
          <MoF2Dial running={running} />
        </div>

        {ROUTINES.map((routine, index) => (
          <div
            key={routine.label}
            className="absolute"
            style={{ left: CHIPS_X, top: rowY(index) }}
          >
            <Fri2Chip
              icon={routine.icon}
              label={routine.label}
              lit={running}
              index={index}
              delay={0.15 + (index * (MOF2_SWEEP - 0.3)) / ROUTINES.length}
              className="w-[320px]"
            />
          </div>
        ))}

        <div
          className="absolute -top-12 flex h-8 items-center text-2xl font-semibold text-white"
          style={{ left: PRS_X }}
        >
          <MaskedText step={2} delay={0.05} duration={0.8}>
            Opened for review
          </MaskedText>
        </div>

        {ROUTINES.map((routine, index) => (
          <div
            key={routine.label}
            className="absolute"
            style={{
              left: CHIPS_X + CHIP_W + 6,
              top: rowY(index) + ROW / 2 - 1,
            }}
          >
            <DrawPath
              d={`M0 1 L${LINE_W - 12} 1`}
              width={LINE_W - 12}
              height={2}
              step={2}
              delay={index * HAND_OFF}
              duration={0.5}
              strokeWidth={1.5}
              dot
            />
          </div>
        ))}

        {ROUTINES.map((routine, index) => (
          <ReviewRow key={routine.label} index={index} />
        ))}
      </div>

      <Footnote>
        The Automations Hub landed 6 August 2026. The five maintenance routines
        were added 21 August 2026.
      </Footnote>
    </Shell>
  );
}
