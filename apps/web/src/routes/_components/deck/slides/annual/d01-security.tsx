import type { Icon } from "@tabler/icons-react";
import {
  IconAlertTriangle,
  IconBox,
  IconCamera,
  IconCheck,
  IconChecklist,
  IconFolderCode,
  IconMessages,
  IconPlug,
  IconUsers,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { AnnCCountDown } from "../_parts/AnnCCountDown";
import { moA3InOutAt } from "../_parts/MoA3Timing";
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
  DrawPath,
  EASE,
  MaskedText,
  Sheen,
  cueTransition,
} from "../../_components/motion";

/** Every surface the August audit read, in the order it read them. */
const SURFACES: readonly { name: string; icon: Icon }[] = [
  { name: "Codebases", icon: IconFolderCode },
  { name: "Sessions", icon: IconMessages },
  { name: "Tasks", icon: IconChecklist },
  { name: "Teams", icon: IconUsers },
  { name: "Workspaces", icon: IconBox },
  { name: "Snapshots", icon: IconCamera },
  { name: "Integrations", icon: IconPlug },
];

const ROW_W = 1088;
/** The guard's scan: one beam across the row, one shared rule drawn under it. */
const SCAN = 1.4;
const SCAN_LEAD = 0.15;
const BEAM_W = 180;

/** When the beam passes the middle of chip `index`. */
function passAt(index: number): number {
  return SCAN_LEAD + moA3InOutAt((index + 0.5) / SURFACES.length) * SCAN;
}

function SurfaceChip({
  name,
  icon: SurfaceIcon,
  index,
  guarded,
}: {
  name: string;
  icon: Icon;
  index: number;
  guarded: boolean;
}) {
  const pass = passAt(index);

  return (
    <m.div
      className="relative flex h-[92px] flex-1 flex-col items-center justify-center gap-2.5 rounded-[14px] bg-white/[0.05]"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: guarded ? -6 : 0 }}
      transition={
        guarded
          ? { duration: DUR.slow, ease: EASE.expo, delay: pass }
          : { duration: DUR.hero, ease: EASE.expo, delay: 0.3 + index * 0.06 }
      }
    >
      <SurfaceIcon
        size={22}
        stroke={1.5}
        className="text-white/60"
        aria-hidden
      />
      <span className="text-[13px] text-white/75">{name}</span>

      {/* Status sits in the corner: a warning, swapped for a tick as the guard passes. */}
      <span className="absolute top-2.5 right-2.5 flex size-5 items-center justify-center">
        <m.span
          className="absolute flex size-5 items-center justify-center rounded-full bg-amber-400/15 text-amber-300"
          initial={false}
          animate={{ opacity: guarded ? 0 : 1, scale: guarded ? 0.5 : 1 }}
          transition={cueTransition(guarded, pass - 0.05, {
            duration: DUR.fast,
            ease: EASE.in,
          })}
        >
          <IconAlertTriangle size={12} stroke={2} aria-hidden />
        </m.span>
        <m.span
          className="absolute flex size-5 items-center justify-center rounded-full text-white"
          style={{ background: BRAND_GRADIENT }}
          initial={false}
          animate={{
            opacity: guarded ? 1 : 0,
            scale: guarded ? 1 : 0.4,
            rotate: guarded ? 0 : -45,
          }}
          transition={cueTransition(guarded, pass, {
            duration: DUR.slow,
            ease: EASE.expo,
          })}
        >
          <IconCheck size={12} stroke={3} aria-hidden />
        </m.span>
      </span>
    </m.div>
  );
}

function WarningCount({
  from,
  to,
  label,
  delay,
}: {
  from: number;
  to: number;
  label: string;
  delay: number;
}) {
  return (
    <div className="text-center">
      <Sheen step={2} delay={delay + 1.3} className="rounded-xl px-3">
        <div className="text-7xl leading-none font-semibold tabular-nums">
          <Accent>
            <AnnCCountDown
              from={from}
              to={to}
              step={2}
              delay={delay}
              duration={1.3}
            />
          </Accent>
        </div>
      </Sheen>
      <div className="mt-4 text-base text-white/50">{label}</div>
    </div>
  );
}

export function AnnualSecurity() {
  const step = useDeckStep();
  const guarded = step >= 1;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Craft · Security</Kicker>
        <Title size="md">One guard on every door.</Title>
      </Reveal>

      <m.div
        className="relative mt-10 overflow-hidden rounded-[14px]"
        animate={{ opacity: step >= 2 ? 0.7 : 1 }}
        transition={{ duration: DUR.slow, ease: EASE.out }}
      >
        <div className="flex gap-3 pt-1.5">
          {SURFACES.map((surface, index) => (
            <SurfaceChip
              key={surface.name}
              name={surface.name}
              icon={surface.icon}
              index={index}
              guarded={guarded}
            />
          ))}
        </div>
        {/* The guard itself: one band of light reading every door in turn. */}
        <m.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: BEAM_W,
            background:
              "linear-gradient(90deg, transparent, rgba(139,63,184,0.18) 45%, rgba(255,255,255,0.14) 55%, transparent)",
          }}
          initial={{ x: -BEAM_W }}
          animate={{ x: guarded ? ROW_W : -BEAM_W }}
          transition={
            guarded
              ? { duration: SCAN, ease: EASE.inOut, delay: SCAN_LEAD }
              : { duration: 0 }
          }
        />
      </m.div>

      <div className="relative mt-5 h-10">
        <DrawPath
          d={`M0 1.5 L${ROW_W} 1.5`}
          width={ROW_W}
          height={3}
          step={1}
          delay={SCAN_LEAD}
          duration={SCAN}
          strokeWidth={3}
          dot
        />
        <div className="pt-3.5 text-center">
          <MaskedText
            step={1}
            delay={SCAN_LEAD + SCAN - 0.2}
            className="text-sm text-white/50"
          >
            Seven surfaces, one shared check
          </MaskedText>
        </div>
      </div>

      <Reveal
        step={2}
        distance={24}
        className="mt-14 flex justify-center gap-28"
      >
        <WarningCount
          from={2}
          to={0}
          label="critical warnings, from 2"
          delay={0.35}
        />
        <WarningCount
          from={48}
          to={2}
          label="high warnings, from 48"
          delay={0.5}
        />
      </Reveal>

      <div className="mt-14 text-center">
        <MaskedText step={3} className="text-3xl text-white/85">
          Checked against <Accent>production</Accent>, not only against tests.
        </MaskedText>
      </div>

      <Footnote>
        Ownership audit 8 August 2026; boundary verified against production data
        19 August 2026.
      </Footnote>
    </Shell>
  );
}
