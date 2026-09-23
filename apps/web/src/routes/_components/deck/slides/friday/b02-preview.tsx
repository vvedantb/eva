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
import {
  Body,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { FriWindow } from "../_parts/FriMock";

/** Phone, then tablet, then desktop. The frame walks these in order. */
const PHONE = 360;
const WIDTH_SEQUENCE: number[] = [PHONE, 620, 980];

/**
 * The frame and the device highlight share one transition, so the highlight is
 * always over the width the frame is currently at. A keyframed tween rather
 * than a spring on purpose: Motion drops the whole update when a spring is
 * handed a keyframe array.
 */
const WALK: Transition = { duration: 1.5, times: [0, 0.45, 1], ease: EASE_OUT };

/** Settling back to the phone when the build is stepped backwards. */
const SETTLE: Transition = { type: "spring", bounce: 0, duration: 0.5 };

/** Icon pitch in the title bar: 24px button, 8px gap. */
const DEVICE_PITCH = 32;

const DEVICES: readonly { name: string; glyph: Icon }[] = [
  { name: "phone", glyph: IconDeviceMobile },
  { name: "tablet", glyph: IconDeviceTablet },
  { name: "desktop", glyph: IconDeviceDesktop },
];

/** Six cards, so the grid visibly re-flows as the frame widens. */
const CARDS = [0, 1, 2, 3, 4, 5];

function DeviceSwitch() {
  const switching = useDeckStep() >= 1;

  return (
    <div className="relative flex items-center gap-2">
      <m.span
        aria-hidden
        className="absolute top-0 left-0 size-6 rounded-[8px] bg-white/[0.14]"
        animate={{ x: switching ? [0, DEVICE_PITCH, DEVICE_PITCH * 2] : 0 }}
        transition={switching ? WALK : SETTLE}
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

function ToolbarButton({ glyph: Glyph }: { glyph: Icon }) {
  const shown = useDeckStep() >= 1;
  return (
    <m.span
      className="flex size-6 items-center justify-center rounded-[8px] bg-white/[0.06] text-white/45"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: shown ? 1 : 0, scale: shown ? 1 : 0.8 }}
      transition={{
        type: "spring",
        bounce: 0,
        duration: 0.5,
        delay: shown ? 1.1 : 0,
      }}
    >
      <Glyph size={13} stroke={1.8} />
    </m.span>
  );
}

function CommentPin() {
  const dropped = useDeckStep() >= 2;

  return (
    <div className="absolute top-[56px] left-[44px] flex items-center gap-3">
      <m.span
        className="relative flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#8B3FB8] to-[#3B7DD8] text-[12px] font-semibold text-white"
        initial={{ opacity: 0, y: -26, scale: 0.7 }}
        animate={{
          opacity: dropped ? 1 : 0,
          y: dropped ? 0 : -26,
          scale: dropped ? 1 : 0.7,
        }}
        transition={
          dropped
            ? { type: "spring", bounce: 0, duration: 0.55 }
            : { duration: 0.2, ease: EASE_OUT }
        }
      >
        1
      </m.span>
      <m.span
        className="rounded-[12px] bg-white/[0.1] px-3 py-1.5 text-[12px] text-white/80"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: dropped ? 1 : 0, x: dropped ? 0 : -10 }}
        transition={{
          type: "spring",
          bounce: 0,
          duration: 0.5,
          delay: dropped ? 0.18 : 0,
        }}
      >
        Make this heading bigger
      </m.span>
    </div>
  );
}

export function FridayPreview() {
  const switching = useDeckStep() >= 1;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Live preview</Kicker>
        <Title size="md">See it before it is real.</Title>
        <Body className="mt-5 max-w-3xl">
          Click through a change before anyone merges it.
        </Body>
      </Reveal>

      <Reveal delay={0.15} className="mt-10 flex justify-center">
        <m.div
          className="relative"
          animate={{ width: switching ? WIDTH_SEQUENCE : PHONE }}
          transition={switching ? WALK : SETTLE}
        >
          <FriWindow
            label="Preview"
            className="h-[300px] w-full"
            bodyClassName="flex flex-col gap-3"
            trailing={
              <>
                <DeviceSwitch />
                <ToolbarButton glyph={IconRotate} />
                <ToolbarButton glyph={IconCamera} />
              </>
            }
          >
            <div className="h-7 shrink-0 rounded-[10px] bg-white/[0.1]" />
            <div className="flex flex-wrap gap-2.5">
              {CARDS.map((card) => (
                <m.span
                  key={card}
                  layout
                  transition={SETTLE}
                  className="h-[52px] w-[150px] rounded-[12px] bg-white/[0.08]"
                />
              ))}
            </div>
          </FriWindow>
          <CommentPin />
        </m.div>
      </Reveal>

      <Footnote>
        Click-to-comment and phone, tablet and desktop widths, 21 July 2026.
        Device toolbar with rotate and screenshot, 25 August 2026. Previews
        survive leaving the session, 14 August 2026.
      </Footnote>
    </Shell>
  );
}
