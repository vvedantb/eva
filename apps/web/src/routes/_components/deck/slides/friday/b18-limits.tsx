import { m } from "motion/react";
import {
  Accent,
  Footnote,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import { Camera, Layer } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  DUR,
  DrawPath,
  EASE,
  GridBackdrop,
  MaskedText,
  Spotlight,
} from "../../_components/motion";
import {
  FRI3_BASE_Y,
  FRI3_LADDER_H,
  FRI3_PLOT_W,
  FRI3_PLOT_X,
  Fri3LimitsLadder,
  fri3X,
} from "../_parts/Fri3LimitsLadder";
import { FRI3_LANES_H, Fri3LimitsLanes } from "../_parts/Fri3LimitsLanes";

const W = 1088;
const AXIS_Y = FRI3_LADDER_H + 14;
const LANES_Y = AXIS_Y + 30;
const H = LANES_Y + FRI3_LANES_H;
const CLOSING = 3;

const MONTHS: readonly { label: string; date: string }[] = [
  { label: "Feb", date: "2026-02-01" },
  { label: "Mar", date: "2026-03-01" },
  { label: "Apr", date: "2026-04-01" },
  { label: "May", date: "2026-05-01" },
  { label: "Jun", date: "2026-06-01" },
  { label: "Jul", date: "2026-07-01" },
  { label: "Aug", date: "2026-08-01" },
  { label: "Sep", date: "2026-09-01" },
];

/** Low and tilted while the ladder climbs, square for the lanes, eased back to close. */
const SHOTS: readonly CameraShot[] = [
  { rotateX: 6, translateZ: -30 },
  { rotateX: 3, rotateY: -3 },
  {},
  { translateZ: -24, y: -18 },
];

/** The light climbs with the ladder, then drops onto the problems and stays. */
const GLOW = [
  null,
  { x: fri3X("2026-08-20"), y: 70, size: 560 },
  { x: fri3X("2026-06-01"), y: LANES_Y + FRI3_LANES_H / 2, size: 760 },
  { x: fri3X("2026-06-01"), y: LANES_Y + FRI3_LANES_H / 2, size: 640 },
];

/** The year draws itself on entry; the ladder then climbs off this line. */
function Axis() {
  return (
    <>
      <div className="absolute inset-0">
        <DrawPath
          d={`M ${FRI3_PLOT_X} ${FRI3_BASE_Y} H ${FRI3_PLOT_X + FRI3_PLOT_W}`}
          width={W}
          height={H}
          delay={0.45}
          duration={1.3}
          strokeWidth={1.5}
          color="rgba(255,255,255,0.16)"
          dot
        />
      </div>
      <div className="absolute inset-x-0" style={{ top: AXIS_Y }}>
        {MONTHS.map((month, index) => (
          <m.span
            key={month.label}
            className="absolute text-xs text-white/35"
            style={{ left: fri3X(month.date) }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: DUR.slow,
              ease: EASE.out,
              delay: 0.55 + index * 0.13,
            }}
          >
            {month.label}
          </m.span>
        ))}
      </div>
    </>
  );
}

export function FridayLimits() {
  return (
    <Shell className="py-12">
      <Title size="md">
        Better models. <Accent>Same problems.</Accent>
      </Title>

      <div className="flex flex-1 flex-col justify-center pb-10">
        <Camera shots={SHOTS}>
          <div
            className="relative isolate"
            style={{ width: W, height: H, transformStyle: "preserve-3d" }}
          >
            <Layer depth={-60} className="absolute -inset-x-12 -inset-y-8">
              <GridBackdrop variant="dots" cell={26} period={10} />
            </Layer>
            <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />
            <Fri3LimitsLadder />
            <Axis />
            <Fri3LimitsLanes top={LANES_Y} />
          </div>
        </Camera>

        <p className="mt-9 text-3xl text-white/90">
          <MaskedText step={CLOSING} delay={0.2}>
            The work left is <Accent>judgement, review and systems</Accent>.
          </MaskedText>
        </p>
      </div>

      <Footnote>
        The presenter&rsquo;s view, backed by the evidence shown; not a measured
        law. Models: day added to Eva (git history). Problems: first and latest
        mention in Eva&rsquo;s changelog, 2026.
      </Footnote>
    </Shell>
  );
}
