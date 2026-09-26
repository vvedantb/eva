import {
  IconCamera,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconRotate,
  IconSearch,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import { m } from "motion/react";
import type { Transition } from "motion/react";
import { cn } from "@eva/ui";
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
import { FriLines, FriWindow } from "../_parts/FriMock";

/** Phone, then tablet, then desktop. The frame walks these in order. */
const PHONE = 360;
const WIDTH_SEQUENCE: number[] = [PHONE, 650, 960];

/**
 * Frame and device highlight share one keyframed tween, not a spring: Motion
 * drops the whole update when a spring is handed a keyframe array.
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

/** Six unnamed cards: one column at phone width, two at tablet, three wide. */
const TONES: Record<string, string> = {
  New: "bg-[#3B7DD8]/25 text-[#9cc0f0]",
  Accepted: "bg-emerald-400/15 text-emerald-300",
  Declined: "bg-white/[0.08] text-white/55",
};
const CARDS = ["New", "Accepted", "New", "Declined", "Accepted", "New"];

const NAV = ["Home", "Referrals", "Reports"];

/** Pins, rings and toolbar buttons land on this; they leave faster. */
const PIN_ENTER: Transition = { type: "spring", bounce: 0, duration: 0.55 };
const PIN_EXIT: Transition = { duration: 0.2, ease: EASE_OUT };

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
      transition={shown ? { ...PIN_ENTER, delay: 1.1 } : PIN_EXIT}
    >
      <Glyph size={13} stroke={1.8} />
    </m.span>
  );
}

/** Rides at the right-hand end of the heading it annotates. */
function CommentPin() {
  const dropped = useDeckStep() >= 2;

  return (
    <div className="absolute top-0 left-full ml-4 flex h-full items-center gap-3">
      <m.span
        className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8B3FB8] to-[#3B7DD8] text-[12px] font-semibold text-white"
        initial={{ opacity: 0, y: -26, scale: 0.7 }}
        animate={{
          opacity: dropped ? 1 : 0,
          y: dropped ? 0 : -26,
          scale: dropped ? 1 : 0.7,
        }}
        transition={dropped ? PIN_ENTER : PIN_EXIT}
      >
        1
      </m.span>
      <m.span
        className="rounded-[12px] bg-white/[0.1] px-3 py-1.5 text-[13px] whitespace-nowrap text-white/85"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: dropped ? 1 : 0, x: dropped ? 0 : -10 }}
        transition={dropped ? { ...PIN_ENTER, delay: 0.18 } : PIN_EXIT}
      >
        Make this heading bigger
      </m.span>
    </div>
  );
}

/** The heading the note points at, with the selection ring clicking it adds. */
function PageHeading() {
  const dropped = useDeckStep() >= 2;
  return (
    <div className="relative shrink-0">
      <m.span
        aria-hidden
        className="absolute -inset-x-2 -inset-y-1 rounded-[10px] ring-2 ring-[#8B3FB8]"
        initial={{ opacity: 0, scale: 1.06 }}
        animate={{ opacity: dropped ? 1 : 0, scale: dropped ? 1 : 1.06 }}
        transition={dropped ? { ...PIN_ENTER, delay: 0.1 } : PIN_EXIT}
      />
      <span className="relative text-[26px] leading-none font-semibold tracking-[-0.01em] text-white">
        Referrals
      </span>
      <CommentPin />
    </div>
  );
}

/** A small but recognisable app page: nav bar, heading, action, search, cards. */
function PreviewPage() {
  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-3">
        <span className="size-6 shrink-0 rounded-[8px] bg-gradient-to-br from-[#8B3FB8] to-[#3B7DD8]" />
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
          {NAV.map((item, index) => (
            <span
              key={item}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[12px] text-white/45",
                index === 1 && "bg-white/[0.1] text-white/85",
              )}
            >
              {item}
            </span>
          ))}
        </div>
        <span className="size-7 shrink-0 rounded-full bg-white/[0.12]" />
      </div>

      <div className="mt-4 flex h-10 shrink-0 items-center gap-4">
        <PageHeading />
        <span className="ml-auto shrink-0 rounded-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8] px-4 py-2 text-[12px] font-medium whitespace-nowrap text-white">
          New referral
        </span>
      </div>

      <div className="mt-3 flex h-9 shrink-0 items-center gap-2 rounded-full bg-white/[0.06] px-4 text-[12px] text-white/35">
        <IconSearch size={14} stroke={1.8} aria-hidden />
        Search referrals
      </div>

      <div className="mt-3.5 flex flex-wrap gap-3">
        {CARDS.map((status, index) => (
          <m.div
            key={index}
            layout
            transition={SETTLE}
            className="flex h-[76px] w-[298px] items-center gap-3 rounded-[14px] bg-white/[0.06] px-4"
          >
            <span className="size-9 shrink-0 rounded-full bg-white/[0.1]" />
            <FriLines widths={[110, 72]} className="flex-1" />
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${TONES[status]}`}
            >
              {status}
            </span>
          </m.div>
        ))}
      </div>
    </>
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

      <Reveal delay={0.15} className="mt-8 flex justify-center">
        <m.div
          className="relative"
          animate={{ width: switching ? WIDTH_SEQUENCE : PHONE }}
          transition={switching ? WALK : SETTLE}
        >
          <FriWindow
            label="Preview"
            className="h-[396px] w-full"
            bodyClassName="flex flex-col px-5 pt-4"
            trailing={
              <>
                <DeviceSwitch />
                <ToolbarButton glyph={IconRotate} />
                <ToolbarButton glyph={IconCamera} />
              </>
            }
          >
            <PreviewPage />
          </FriWindow>
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
