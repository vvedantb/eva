import { IconSearch } from "@tabler/icons-react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useDeckStep } from "../../_components/DeckPrimitives";
import { BRAND, DUR, EASE, LEAVE, Pulse } from "../../_components/motion";

/** Six unnamed cards: one column at phone width, two at tablet, three wide. */
const TONES: Record<string, string> = {
  New: "bg-[#3B7DD8]/25 text-[#9cc0f0]",
  Accepted: "bg-emerald-400/15 text-emerald-300",
  Declined: "bg-white/[0.08] text-white/55",
};
const AVATARS: Record<string, string> = {
  New: `linear-gradient(135deg, ${BRAND.blue}aa, ${BRAND.blue}33)`,
  Accepted:
    "linear-gradient(135deg, rgba(52,211,153,0.55), rgba(52,211,153,0.12))",
  Declined:
    "linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))",
};
const CARDS = ["New", "Accepted", "New", "Declined", "Accepted", "New"];
const NAV = ["Home", "Referrals", "Reports"];
const GAP = 12;

const PIN = { duration: DUR.slow, ease: EASE.expo };

/** Rides at the right-hand end of the heading it annotates. */
function CommentPin() {
  const dropped = useDeckStep() >= 2;
  return (
    <div className="absolute top-0 left-full ml-4 flex h-full items-center gap-3">
      <m.span
        className="relative flex size-8 shrink-0"
        initial={{ opacity: 0, y: -30, scale: 0.7 }}
        animate={
          dropped
            ? { opacity: 1, y: 0, scale: 1 }
            : { opacity: 0, y: -30, scale: 0.7 }
        }
        transition={dropped ? { ...PIN, opacity: { duration: 0.2 } } : LEAVE}
      >
        <Pulse
          step={2}
          delay={0.6}
          rings={2}
          period={2.4}
          reach={1.9}
          color={BRAND.purple}
          className="rounded-full"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#8B3FB8] to-[#3B7DD8] text-[12px] font-semibold text-white">
            1
          </span>
        </Pulse>
      </m.span>
      <m.span
        className="rounded-[12px] bg-white/[0.1] px-3 py-1.5 text-[13px] whitespace-nowrap text-white/85"
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: dropped ? 1 : 0, x: dropped ? 0 : -12 }}
        transition={dropped ? { ...PIN, delay: 0.3 } : LEAVE}
      >
        Make this heading bigger
      </m.span>
    </div>
  );
}

/** The heading the note points at, with the selection ring clicking it adds. */
function PageHeading({ pinned }: { pinned: boolean }) {
  const dropped = useDeckStep() >= 2 && pinned;
  return (
    <div className="relative shrink-0">
      <m.span
        aria-hidden
        className="absolute -inset-x-2 -inset-y-1 rounded-[10px] ring-2 ring-[#8B3FB8]"
        initial={{ opacity: 0, scale: 1.12 }}
        animate={{ opacity: dropped ? 1 : 0, scale: dropped ? 1 : 1.12 }}
        transition={dropped ? { ...PIN, delay: 0.12 } : LEAVE}
      />
      <span className="relative text-[26px] leading-none font-semibold tracking-[-0.01em] text-white">
        Referrals
      </span>
      {pinned ? <CommentPin /> : null}
    </div>
  );
}

function ReferralCard({ status, width }: { status: string; width: number }) {
  return (
    <div
      className="flex h-[76px] shrink-0 items-center gap-3 rounded-[14px] bg-white/[0.06] px-4"
      style={{ width }}
    >
      <span
        className="size-9 shrink-0 rounded-full"
        style={{ background: AVATARS[status] }}
      />
      <div className="flex flex-1 flex-col gap-2">
        <span className="h-2 w-[110px] max-w-full rounded-[4px] bg-white/[0.16]" />
        <span className="h-2 w-[72px] rounded-[4px] bg-white/[0.08]" />
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${TONES[status]}`}
      >
        {status}
      </span>
    </div>
  );
}

/**
 * The app page laid out for one device width: nav bar, heading, action,
 * search, then the cards in as many columns as the width allows. Laid out
 * once per width and cross-faded, so nothing reflows while the frame moves.
 */
export function MoF1PreviewPage({
  width,
  pinned = false,
}: {
  width: number;
  pinned?: boolean;
}) {
  const columns = width < 400 ? 1 : width < 700 ? 2 : 3;
  const card = (width - GAP * (columns - 1)) / columns;

  return (
    <div className="flex flex-col" style={{ width }}>
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
        <PageHeading pinned={pinned} />
        <span className="ml-auto shrink-0 rounded-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8] px-4 py-2 text-[12px] font-medium whitespace-nowrap text-white">
          New referral
        </span>
      </div>

      <div className="mt-3 flex h-9 shrink-0 items-center gap-2 rounded-full bg-white/[0.06] px-4 text-[12px] text-white/35">
        <IconSearch size={14} stroke={1.8} aria-hidden />
        Search referrals
      </div>

      <div className="mt-3.5 flex flex-wrap" style={{ gap: GAP }}>
        {CARDS.map((status, index) => (
          <ReferralCard key={index} status={status} width={card} />
        ))}
      </div>
    </div>
  );
}
