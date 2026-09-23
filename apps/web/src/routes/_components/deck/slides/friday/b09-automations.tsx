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
  EASE_OUT,
  Footnote,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Fri2Chip, FRI2_CHIP_STAGGER } from "../_parts/Fri2Chip";

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

/** Clock-hand angles, with twelve o'clock at zero. 03:00 is 90°, 05:00 is 150°. */
const HAND_START = 90;
const HAND_END = 150;

/** One sixth of the dial: the window the routines are staggered across. */
const ARC_SWEEP = 1 / 6;

const DIAL = 210;

function Dial({ running }: { running: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: DIAL, height: DIAL }}>
        <svg
          viewBox="0 0 210 210"
          className="absolute inset-0"
          aria-hidden
          role="presentation"
        >
          <defs>
            <linearGradient id="fri2-dial" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={BRAND.purple} />
              <stop offset="100%" stopColor={BRAND.blue} />
            </linearGradient>
          </defs>
          <circle
            cx="105"
            cy="105"
            r="88"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="2"
          />
          <m.circle
            cx="105"
            cy="105"
            r="88"
            fill="none"
            stroke="url(#fri2-dial)"
            strokeWidth="6"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: running ? ARC_SWEEP : 0 }}
            transition={{ duration: 1, ease: EASE_OUT }}
          />
        </svg>

        <m.div
          aria-hidden
          className="absolute top-1/2 left-1/2 h-[64px] w-[3px] origin-bottom rounded-full bg-white/70"
          style={{ marginLeft: -1.5, marginTop: -64 }}
          animate={{ rotate: running ? HAND_END : HAND_START }}
          transition={{ type: "spring", bounce: 0, duration: 1.1 }}
        />
        <span className="absolute top-1/2 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </div>

      <div className="mt-6 text-center">
        <div className="text-3xl font-semibold tracking-tight tabular-nums text-white">
          03:00 — 05:00
        </div>
        <div className="mt-2 text-xs tracking-[0.2em] text-white/40 uppercase">
          UTC
        </div>
      </div>
    </div>
  );
}

export function FridayAutomations() {
  const step = useDeckStep();
  const running = step >= 1;
  const opened = step >= 2;

  return (
    <Shell className="py-12">
      <Kicker>
        <span className="inline-flex items-center gap-2">
          <IconMoonStars size={15} aria-hidden />
          Automations hub
        </span>
      </Kicker>
      <Title size="md">
        Work that <Accent>runs itself</Accent>.
      </Title>
      <Body className="mt-4 max-w-3xl">
        Ready-made routines, installed once for everyone.
      </Body>

      {/* Edge to edge on the 1088px content width: dial, routines, results. */}
      <div className="mt-10 flex items-center justify-between">
        <Dial running={running} />

        <div className="flex flex-col gap-3">
          {ROUTINES.map((routine, index) => (
            <Fri2Chip
              key={routine.label}
              icon={routine.icon}
              label={routine.label}
              lit={running}
              index={index}
              className="w-[320px]"
            />
          ))}
        </div>

        <div className="flex w-[280px] flex-col items-start gap-5">
          <m.div
            className="text-2xl font-semibold text-white"
            animate={{ opacity: opened ? 1 : 0, y: opened ? 0 : 12 }}
            transition={{ type: "spring", bounce: 0, duration: 0.55 }}
          >
            Opened for review
          </m.div>
          <div className="flex w-full flex-col gap-2.5">
            {ROUTINES.map((routine, index) => (
              <m.div
                key={routine.label}
                className="flex h-10 items-center gap-3 rounded-xl bg-white/[0.07] px-3.5"
                initial={{ opacity: 0, y: 18, scale: 0.94 }}
                animate={
                  opened
                    ? { opacity: 1, y: 0, scale: 1 }
                    : { opacity: 0, y: 18, scale: 0.94 }
                }
                transition={{
                  type: "spring",
                  bounce: 0,
                  duration: 0.55,
                  delay: opened ? index * FRI2_CHIP_STAGGER : 0,
                }}
              >
                <IconGitPullRequest
                  size={16}
                  stroke={1.6}
                  aria-hidden
                  style={{ color: BRAND.blue }}
                />
                <span className="h-1.5 flex-1 rounded-full bg-white/15" />
              </m.div>
            ))}
          </div>
        </div>
      </div>

      <Footnote>
        The Automations Hub landed 6 August 2026. The five maintenance routines
        were added 21 August 2026.
      </Footnote>
    </Shell>
  );
}
