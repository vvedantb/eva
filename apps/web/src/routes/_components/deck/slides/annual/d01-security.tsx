import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { m } from "motion/react";
import { AnnCCountDown } from "../_parts/AnnCCountDown";
import {
  Accent,
  BRAND,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

/** Every surface the August audit read, in the order it read them. */
const SURFACES: readonly string[] = [
  "Codebases",
  "Sessions",
  "Tasks",
  "Teams",
  "Workspaces",
  "Snapshots",
  "Integrations",
];

const GRADIENT = `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`;

function SurfaceChip({
  name,
  index,
  guarded,
}: {
  name: string;
  index: number;
  guarded: boolean;
}) {
  const delay = index * 0.07;

  return (
    <m.div
      className="flex h-[76px] flex-1 flex-col items-center justify-center gap-2.5 rounded-[14px] bg-white/[0.05]"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: guarded ? -6 : 0 }}
      transition={{
        type: "spring",
        bounce: 0,
        duration: 0.55,
        delay: guarded ? delay : 0.3 + delay,
      }}
    >
      <span className="relative flex size-6 items-center justify-center">
        <m.span
          className="absolute flex size-6 items-center justify-center rounded-full bg-amber-400/15 text-amber-300"
          initial={false}
          animate={{ opacity: guarded ? 0 : 1, scale: guarded ? 0.6 : 1 }}
          transition={{ duration: guarded ? 0.25 : 0.4, ease: EASE_OUT }}
        >
          <IconAlertTriangle size={14} stroke={2} aria-hidden />
        </m.span>
        <m.span
          className="absolute flex size-6 items-center justify-center rounded-full text-white"
          style={{ background: GRADIENT }}
          initial={false}
          animate={{ opacity: guarded ? 1 : 0, scale: guarded ? 1 : 0.5 }}
          transition={{
            type: "spring",
            bounce: 0.35,
            duration: 0.5,
            delay: guarded ? delay : 0,
          }}
        >
          <IconCheck size={14} stroke={3} aria-hidden />
        </m.span>
      </span>
      <span className="text-[13px] text-white/75">{name}</span>
    </m.div>
  );
}

function WarningCount({
  from,
  to,
  label,
}: {
  from: number;
  to: number;
  label: string;
}) {
  return (
    <div className="text-center">
      <div className="text-7xl leading-none font-semibold tabular-nums">
        <Accent>
          <AnnCCountDown from={from} to={to} step={2} delay={0.35} />
        </Accent>
      </div>
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
        <Kicker>Security</Kicker>
        <Title size="md">Locking the doors.</Title>
      </Reveal>

      <div className="mt-12 flex gap-3">
        {SURFACES.map((name, index) => (
          <SurfaceChip key={name} name={name} index={index} guarded={guarded} />
        ))}
      </div>

      <div className="relative mt-5 h-10">
        <m.div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px] origin-left rounded-full"
          style={{ background: GRADIENT }}
          initial={false}
          animate={{ scaleX: guarded ? 1 : 0, opacity: guarded ? 1 : 0 }}
          transition={{ duration: guarded ? 0.6 : 0.3, ease: EASE_OUT }}
        />
        <Reveal step={1} distance={8} className="pt-4 text-center">
          <p className="text-sm text-white/50">One shared guard</p>
        </Reveal>
      </div>

      <Reveal step={2} className="mt-16 flex justify-center gap-28">
        <WarningCount from={2} to={0} label="critical warnings, from 2" />
        <WarningCount from={48} to={2} label="high warnings, from 48" />
      </Reveal>

      <Reveal step={3} className="mt-16 text-center">
        <p className="text-3xl text-white/85">
          Checked against <Accent>production</Accent>, not only against tests.
        </p>
      </Reveal>

      <Footnote>
        Ownership audit 8 August 2026; boundary verified against production data
        19 August 2026.
      </Footnote>
    </Shell>
  );
}
