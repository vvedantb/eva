import { IconFileText, IconLink, IconLock } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  DUR,
  DrawPath,
  EASE,
  HERO,
  LEAVE,
  Pulse,
  SETTLE,
  Sheen,
  cueTransition,
} from "../../_components/motion";
import { FriLines, FriTyped } from "./FriMock";

export const PAGE_WIDTH = 560;
export const PAGE_HEIGHT = 372;
const FILE_WIDTH = 300;
const FILE_HEIGHT = 200;

/** Relative bar heights for the page's chart. Shape only, no figures. */
const CHART: readonly number[] = [42, 58, 50, 72, 64, 86, 78, 96];
const CHART_W = 488;
const CHART_H = 112;
const CHART_PAD = 16;
const BAR_GAP = 10;
const BAR_W = (CHART_W - CHART_PAD * 2 - BAR_GAP * (CHART.length - 1)) / 8;
const PLOT_H = CHART_H - CHART_PAD;

/** The trend line through the bar tops, in the chart box's own pixels. */
const TREND = CHART.map((height, index) => {
  const x = CHART_PAD + index * (BAR_W + BAR_GAP) + BAR_W / 2;
  const y = CHART_H - (height / 100) * PLOT_H + 10;
  return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
}).join(" ");

/** Table rows: a status tone and two widths per row. Shape only. */
const ROWS: readonly { tone: string; name: number; value: number }[] = [
  { tone: "bg-emerald-400/80", name: 150, value: 56 },
  { tone: "bg-[#3B7DD8]", name: 118, value: 44 },
  { tone: "bg-white/30", name: 136, value: 62 },
];

const at = (on: boolean, delay: number) =>
  cueTransition(on, delay, { duration: DUR.slow, ease: EASE.expo });

function HostedPage({ hosted }: { hosted: boolean }) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <m.div
        className="flex items-baseline justify-between"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: hosted ? 1 : 0, y: hosted ? 0 : 8 }}
        transition={at(hosted, 0.35)}
      >
        <span className="text-lg font-semibold text-white">
          Referral report
        </span>
        <span className="text-[11px] text-white/40">Last 12 weeks</span>
      </m.div>
      <div
        className="relative rounded-[12px] bg-white/[0.04]"
        style={{ height: CHART_H }}
      >
        {[0.33, 0.66].map((line) => (
          <span
            key={line}
            aria-hidden
            className="absolute inset-x-4 h-px bg-white/[0.05]"
            style={{ top: `${line * 100}%` }}
          />
        ))}
        <div
          className="absolute inset-x-4 top-4 bottom-0 flex items-end"
          style={{ gap: BAR_GAP }}
        >
          {CHART.map((height, index) => (
            <m.span
              key={index}
              className="flex-1 origin-bottom rounded-t-[6px] bg-gradient-to-t from-[#8B3FB8]/70 to-[#3B7DD8]/80"
              style={{ height: `${height}%` }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: hosted ? 1 : 0 }}
              transition={cueTransition(hosted, 0.45 + index * 0.05, {
                duration: DUR.slow,
                ease: EASE.expo,
              })}
            />
          ))}
        </div>
        <DrawPath
          d={TREND}
          width={CHART_W}
          height={CHART_H}
          step={1}
          delay={0.85}
          duration={1.1}
          color="rgba(255,255,255,0.85)"
          dot
          className="absolute inset-0"
        />
      </div>
      <div className="flex flex-col gap-2">
        {ROWS.map((row, index) => (
          <m.div
            key={index}
            className="flex h-8 items-center gap-3 rounded-[10px] bg-white/[0.04] px-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: hosted ? 1 : 0, y: hosted ? 0 : 8 }}
            transition={at(hosted, 0.7 + index * 0.08)}
          >
            <span className={`size-2 rounded-full ${row.tone}`} />
            <span
              className="h-2 rounded-full bg-white/20"
              style={{ width: row.name }}
            />
            <span className="h-2 w-10 rounded-full bg-white/[0.08]" />
            <span
              className="ml-auto h-2 rounded-full bg-white/15"
              style={{ width: row.value }}
            />
          </m.div>
        ))}
      </div>
    </div>
  );
}

/** Step 0: the file the agent saved. It hands over to the page on step 1. */
function SavedFile({ hosted }: { hosted: boolean }) {
  return (
    <m.div
      className="absolute rounded-[18px] bg-white/[0.06] p-2 ring-1 ring-white/10"
      style={{
        width: FILE_WIDTH,
        height: FILE_HEIGHT,
        left: (PAGE_WIDTH - FILE_WIDTH) / 2,
        top: (PAGE_HEIGHT - FILE_HEIGHT) / 2,
      }}
      initial={{ opacity: 0, y: 24 }}
      animate={
        hosted
          ? { opacity: 0, y: 0, scale: 1.12 }
          : { opacity: 1, y: 0, scale: 1 }
      }
      transition={
        hosted ? { duration: DUR.base, ease: EASE.in } : { ...HERO, delay: 0.5 }
      }
    >
      <Sheen step={0} delay={1.2} className="h-full rounded-[10px]">
        <div className="h-full rounded-[10px] bg-[#0b0c11] p-5 ring-1 ring-white/[0.06]">
          <div className="flex items-center gap-2 text-white/55">
            <IconFileText size={16} aria-hidden />
            <span className="text-sm">Saved page</span>
          </div>
          <FriLines widths={[220, 170, 120]} className="mt-5" />
          <div className="mt-6 flex gap-2">
            {[46, 30, 38].map((width) => (
              <span
                key={width}
                aria-hidden
                className="h-5 rounded-full bg-white/[0.06]"
                style={{ width }}
              />
            ))}
          </div>
        </div>
      </Sheen>
    </m.div>
  );
}

/**
 * The saved file opens out into a hosted page: the window grows from the
 * file's footprint (a scale, not a resize), the address types itself, the
 * chart builds and a trend line draws through it with a travelling light.
 */
export function MoF3ArtifactPage({ hosted }: { hosted: boolean }) {
  return (
    <div
      className="relative"
      style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
    >
      <SavedFile hosted={hosted} />
      <m.div
        className="absolute inset-0 rounded-[22px] bg-white/[0.06] p-2 ring-1 ring-white/10"
        initial={{ opacity: 0, scale: FILE_WIDTH / PAGE_WIDTH }}
        animate={
          hosted
            ? { opacity: 1, scale: 1 }
            : { opacity: 0, scale: FILE_WIDTH / PAGE_WIDTH }
        }
        transition={
          hosted
            ? { ...HERO, opacity: { duration: DUR.base, ease: EASE.out } }
            : LEAVE
        }
      >
        <Sheen step={1} delay={1.5} className="h-full rounded-[14px]">
          <div className="flex h-full flex-col rounded-[14px] bg-[#0b0c11] ring-1 ring-white/[0.06]">
            <div className="flex h-10 shrink-0 items-center gap-2 px-4">
              <IconLock size={13} aria-hidden className="text-emerald-400/70" />
              <span className="flex h-5 flex-1 items-center rounded-full bg-white/[0.07] px-3 text-[11px] text-white/45">
                <FriTyped
                  text="eva / artifacts / referral-report"
                  run={hosted}
                  delay={0.3}
                  duration={0.6}
                  caret={false}
                />
              </span>
            </div>
            <HostedPage hosted={hosted} />
          </div>
        </Sheen>
      </m.div>

      <m.span
        className="absolute -right-8 -bottom-5 rounded-full"
        initial={{ opacity: 0, scale: 0.8, y: 12 }}
        animate={
          hosted
            ? { opacity: 1, scale: 1, y: 0 }
            : { opacity: 0, scale: 0.8, y: 12 }
        }
        transition={hosted ? { ...SETTLE, delay: 1.1 } : LEAVE}
      >
        <Pulse
          step={1}
          delay={1.5}
          rings={1}
          period={2.6}
          reach={1.35}
          color="rgba(139,63,184,0.7)"
          className="rounded-full"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8] px-4 py-2 text-sm font-medium whitespace-nowrap text-white">
            <IconLink size={15} aria-hidden />
            Open the link
          </span>
        </Pulse>
      </m.span>
    </div>
  );
}
