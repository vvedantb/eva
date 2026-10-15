import {
  IconCamera,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconRotate,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import { m } from "motion/react";
import type { Transition } from "motion/react";
import { useDeckStep } from "../../_components/DeckPrimitives";
import { DUR, EASE, LEAVE, SETTLE } from "../../_components/motion";
import { MoF1PreviewPage } from "./MoF1PreviewPage";

/** Phone, then tablet, then desktop. The frame walks these in order. */
const WIDTHS: readonly number[] = [360, 650, 960];
const MAX = 960;
const HEIGHT = 396;
const BAR = 45;
/** Rounded end caps; the plate between them is the only thing that stretches. */
const CAP = 40;
const PAD = 20;

/**
 * One keyframed tween for every moving part, not a spring: Motion drops the
 * whole update when a spring is handed a keyframe array.
 */
const WALK: Transition = { duration: 1.5, times: [0, 0.45, 1], ease: EASE.out };

const leftEdge = (width: number) => (MAX - width) / 2;
const rightEdge = (width: number) => (MAX + width) / 2 - CAP;
const plateScale = (width: number) => (width - CAP * 2) / (MAX - CAP * 2);

/** Walks the three widths on step 1; settles straight back to the phone. */
function useWalk(at: (width: number) => number): {
  value: number | number[];
  transition: Transition;
} {
  const walking = useDeckStep() >= 1;
  return walking
    ? { value: WIDTHS.map(at), transition: WALK }
    : { value: at(WIDTHS[0] ?? MAX), transition: SETTLE };
}

/** Icon pitch in the title bar: 24px button, 8px gap. */
const DEVICE_PITCH = 32;
const DEVICES: readonly { name: string; glyph: Icon }[] = [
  { name: "phone", glyph: IconDeviceMobile },
  { name: "tablet", glyph: IconDeviceTablet },
  { name: "desktop", glyph: IconDeviceDesktop },
];

function DeviceSwitch() {
  const walk = useWalk((width) => WIDTHS.indexOf(width) * DEVICE_PITCH);
  return (
    <div className="relative flex items-center gap-2">
      <m.span
        aria-hidden
        className="absolute top-0 left-0 size-6 rounded-[8px] bg-white/[0.14]"
        animate={{ x: walk.value }}
        transition={walk.transition}
      />
      {DEVICES.map((device) => (
        <span
          key={device.name}
          className="relative flex size-6 items-center justify-center text-white/55"
        >
          <device.glyph size={14} stroke={1.8} />
        </span>
      ))}
    </div>
  );
}

function ToolbarButton({
  glyph: Glyph,
  delay,
}: {
  glyph: Icon;
  delay: number;
}) {
  const shown = useDeckStep() >= 1;
  return (
    <m.span
      className="flex size-6 items-center justify-center rounded-[8px] bg-white/[0.06] text-white/45"
      initial={{ opacity: 0, scale: 0.7, y: 4 }}
      animate={
        shown
          ? { opacity: 1, scale: 1, y: 0 }
          : { opacity: 0, scale: 0.7, y: 4 }
      }
      transition={
        shown ? { duration: DUR.base, ease: EASE.expo, delay } : LEAVE
      }
    >
      <Glyph size={13} stroke={1.8} />
    </m.span>
  );
}

/**
 * Which layout shows while the frame walks: phone, tablet, desktop. A layout
 * only appears once the frame is wide enough to hold it, and the previous one
 * holds until then, so the page never spills past the glass.
 */
const FADES: readonly { opacity: number[]; times: number[] }[] = [
  { opacity: [1, 1, 0, 0], times: [0, 0.38, 0.46, 1] },
  { opacity: [0, 0, 1, 1, 0, 0], times: [0, 0.38, 0.46, 0.86, 0.94, 1] },
  { opacity: [0, 0, 1], times: [0, 0.86, 0.96] },
];
/** The page scrolls under the bottom edge rather than stopping at it. */
const SCROLL_FADE = "linear-gradient(black calc(100% - 28px), transparent)";

function Layout({ index }: { index: number }) {
  const walking = useDeckStep() >= 1;
  const width = WIDTHS[index] ?? MAX;
  const left = useWalk(leftEdge);
  const fade = FADES[index] ?? { opacity: [1], times: [0] };
  const rest = index === 0 ? 1 : 0;

  return (
    <m.div
      className="absolute top-0 left-0 overflow-hidden"
      style={{
        top: BAR + 16,
        height: HEIGHT - BAR - 22,
        width: width - PAD,
        maskImage: SCROLL_FADE,
      }}
      initial={{ opacity: rest }}
      animate={{
        x: left.value,
        opacity: walking ? fade.opacity : rest,
      }}
      transition={{
        x: left.transition,
        opacity: walking
          ? { duration: WALK.duration, times: fade.times, ease: "linear" }
          : { duration: DUR.fast },
      }}
    >
      <div style={{ paddingLeft: PAD }}>
        <MoF1PreviewPage width={width - PAD * 2} pinned={index === 2} />
      </div>
    </m.div>
  );
}

/**
 * The preview window, resized the way a keynote would do it: the rounded ends
 * glide apart and the plate between them stretches, all on transforms. The
 * page itself is laid out once per device width and cross-fades at each stop.
 */
export function MoF1PreviewFrame() {
  const left = useWalk(leftEdge);
  const right = useWalk(rightEdge);
  const plate = useWalk(plateScale);
  const surface = "absolute top-0 h-full border-white/10 bg-white/[0.045]";
  const bar = "absolute inset-x-0 h-px bg-white/[0.06]";

  return (
    <div className="relative" style={{ width: MAX, height: HEIGHT }}>
      <m.div
        className={`${surface} rounded-l-[20px] border border-r-0`}
        style={{ width: CAP }}
        animate={{ x: left.value }}
        transition={left.transition}
      >
        <span className={bar} style={{ top: BAR }} />
        <div className="absolute top-0 left-4 flex h-[45px] items-center gap-2 whitespace-nowrap">
          {["red", "amber", "green"].map((dot) => (
            <span
              key={dot}
              aria-hidden
              className="size-2 rounded-full bg-white/15"
            />
          ))}
          <span className="ml-2 text-[11px] text-white/40">Preview</span>
        </div>
      </m.div>
      <m.div
        className={`${surface} origin-center border-y`}
        style={{ left: CAP, width: MAX - CAP * 2 }}
        animate={{ scaleX: plate.value }}
        transition={plate.transition}
      >
        <span className={bar} style={{ top: BAR - 1 }} />
      </m.div>
      <m.div
        className={`${surface} rounded-r-[20px] border border-l-0`}
        style={{ width: CAP }}
        animate={{ x: right.value }}
        transition={right.transition}
      >
        <span className={bar} style={{ top: BAR }} />
        <div className="absolute top-0 right-4 flex h-[45px] items-center gap-1.5">
          <DeviceSwitch />
          <ToolbarButton glyph={IconRotate} delay={1.1} />
          <ToolbarButton glyph={IconCamera} delay={1.2} />
        </div>
      </m.div>
      {WIDTHS.map((width, index) => (
        <Layout key={width} index={index} />
      ))}
    </div>
  );
}
