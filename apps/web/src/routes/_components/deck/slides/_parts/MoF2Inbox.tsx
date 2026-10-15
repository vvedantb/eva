import type { Icon } from "@tabler/icons-react";
import { IconBell } from "@tabler/icons-react";
import { m } from "motion/react";
import { useDeckStep } from "../../_components/DeckPrimitives";
import {
  BRAND,
  BRAND_GRADIENT,
  CountRoll,
  DUR,
  EASE,
  MaskedText,
  Pulse,
  SETTLE,
  cueTransition,
} from "../../_components/motion";

/** Grey bars standing in for text the room is not meant to read. */
function Bars({ widths }: { widths: readonly number[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {widths.map((width, index) => (
        <m.span
          key={`${width}-${index}`}
          aria-hidden
          className="block h-2 origin-left rounded-[4px] bg-white/[0.09]"
          style={{ width }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{
            duration: DUR.slow,
            ease: EASE.expo,
            delay: 0.3 + index * 0.06,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The reading pane for one item: title, who and when, the thing itself as an
 * attachment card, then the body. Structure only; the title is the one word.
 */
export function MoF2InboxDetail({
  title,
  icon: KindIcon,
}: {
  title: string;
  icon: Icon;
}) {
  return (
    <div className="flex flex-col">
      <MaskedText className="text-lg font-medium text-white" duration={0.7}>
        {title}
      </MaskedText>
      <m.div
        className="mt-3 flex items-center gap-2.5"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.base, ease: EASE.out, delay: 0.15 }}
      >
        <span
          aria-hidden
          className="size-5 rounded-full"
          style={{ background: BRAND_GRADIENT }}
        />
        <span className="h-2 w-24 rounded-[4px] bg-white/[0.14]" />
        <span className="h-2 w-12 rounded-[4px] bg-white/[0.07]" />
      </m.div>
      <m.div
        className="mt-4 flex items-center gap-3 rounded-[12px] bg-white/[0.06] p-3 ring-1 ring-white/[0.06]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.slow, ease: EASE.expo, delay: 0.22 }}
      >
        <span className="flex size-8 items-center justify-center rounded-[8px] bg-white/[0.07]">
          <KindIcon
            size={16}
            stroke={1.7}
            aria-hidden
            style={{ color: BRAND.blue }}
          />
        </span>
        <div className="flex flex-1 flex-col gap-2">
          <span className="h-2 w-40 rounded-[4px] bg-white/[0.16]" />
          <span className="h-1.5 w-24 rounded-[4px] bg-white/[0.08]" />
        </div>
        <span className="h-6 w-16 rounded-full bg-white/[0.08]" />
      </m.div>
      <div className="mt-5">
        <Bars widths={[420, 360, 400, 300]} />
      </div>
    </div>
  );
}

/** An arrow key cap. The down arrow is pressed on the step that moves the selection. */
export function MoF2KeyHint({
  label,
  pressed = false,
}: {
  label: string;
  pressed?: boolean;
}) {
  const shown = useDeckStep() >= 1;
  return (
    <m.span
      className="flex h-6 min-w-6 items-center justify-center rounded-[8px] bg-white/[0.08] px-1.5 text-[11px] text-white/55 ring-1 ring-white/[0.08]"
      initial={{ opacity: 0, y: -6 }}
      animate={
        shown
          ? pressed
            ? { opacity: 1, y: [-6, 0, 2, 0], scale: [1, 1, 0.84, 1] }
            : { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0, y: -6, scale: 1 }
      }
      transition={
        shown
          ? {
              duration: 0.7,
              times: [0, 0.35, 0.55, 1],
              ease: EASE.out,
              opacity: { duration: DUR.base },
            }
          : { duration: DUR.fast }
      }
    >
      {label}
    </m.span>
  );
}

/** The tab that carries the unread count while the room is looking elsewhere. */
export function MoF2BrowserTab() {
  const shown = useDeckStep() >= 2;

  return (
    <div className="relative isolate">
      <m.span
        aria-hidden
        className="pointer-events-none absolute -inset-x-16 -inset-y-10 -z-10 rounded-full"
        style={{
          background: `radial-gradient(closest-side, ${BRAND.blue}40, transparent)`,
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={shown ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
        transition={cueTransition(shown, 0.1, {
          duration: 1.2,
          ease: EASE.expo,
        })}
      />
      <m.div
        className="flex items-center gap-2.5 rounded-t-[14px] bg-white/[0.08] px-4 py-2 ring-1 ring-white/[0.08]"
        initial={{ opacity: 0, y: 14, scale: 0.94 }}
        animate={
          shown
            ? { opacity: 1, y: 0, scale: 1 }
            : { opacity: 0, y: 14, scale: 0.94 }
        }
        transition={cueTransition(shown, 0, SETTLE)}
      >
        <span
          aria-hidden
          className="size-3 rounded-full"
          style={{ background: BRAND_GRADIENT }}
        />
        <span className="text-[12px] text-white/70">Eva</span>
        {/* The chime: one ring of the bell, as the count lands. */}
        <m.span
          aria-hidden
          className="origin-top text-white/55"
          initial={{ rotate: 0 }}
          animate={shown ? { rotate: [0, 18, -14, 8, -4, 0] } : { rotate: 0 }}
          transition={
            shown
              ? { duration: 0.9, ease: EASE.out, delay: 0.35 }
              : { duration: 0 }
          }
        >
          <IconBell size={13} stroke={1.8} />
        </m.span>
        <Pulse
          step={2}
          delay={0.5}
          rings={2}
          reach={2}
          className="rounded-full"
        >
          <span className="relative flex size-5 items-center justify-center rounded-full bg-[#3B7DD8] text-[11px] font-semibold text-white">
            <CountRoll value={3} step={2} delay={0.2} duration={0.9} />
          </span>
        </Pulse>
      </m.div>
    </div>
  );
}
