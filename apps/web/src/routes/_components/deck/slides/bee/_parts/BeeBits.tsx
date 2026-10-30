import type { CSSProperties } from "react";
import type { Icon } from "@tabler/icons-react";
import { IconExternalLink, IconFileText } from "@tabler/icons-react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { DUR, EASE, cueTransition } from "../../../_components/motion";
import { BEE, BEE_SPRING } from "./BeeIsland";

/** A cream card on the cream stage: lifted by a warm hairline and soft shadow. */
export const BEE_CARD =
  "rounded-[22px] bg-[#fffdf8] ring-1 ring-[#2a1e0c]/10 shadow-[0_10px_30px_-12px_rgba(42,30,12,0.25)]";

/** One of your markdown notes, as Bee sees it. `match` lights it as found. */
export function NoteCard({
  name,
  lines = 3,
  match = false,
  dim = false,
  className,
  style,
}: {
  name: string;
  lines?: number;
  match?: boolean;
  dim?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <m.div
      className={cn(BEE_CARD, "flex w-[230px] flex-col gap-2.5 p-4", className)}
      style={style}
      initial={false}
      animate={{
        opacity: dim ? 0.35 : 1,
        boxShadow: match
          ? `0 0 0 2.5px ${BEE.accent}, 0 14px 34px -12px rgba(194,116,6,0.45)`
          : "0 0 0 0px rgba(250,190,40,0), 0 10px 30px -12px rgba(42,30,12,0.25)",
      }}
      transition={{ duration: DUR.slow, ease: EASE.out }}
    >
      <div className="flex items-center gap-2 text-[15px] font-semibold text-[#2a1e0c]">
        <IconFileText size={17} className="shrink-0 text-[#c27406]" />
        <span className="truncate">{name}</span>
      </div>
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="h-2 rounded-full bg-[#2a1e0c]/10"
          style={{ width: `${92 - index * 17}%` }}
        />
      ))}
    </m.div>
  );
}

/** A labelled pill with an icon that lights up on its cue. */
export function BeeChip({
  icon: Glyph,
  label,
  shown,
  delay = 0,
  className,
}: {
  icon: Icon;
  label: string;
  shown: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <m.div
      className={cn(
        BEE_CARD,
        "flex h-14 items-center gap-3 rounded-full px-5 text-lg font-medium text-[#2a1e0c]",
        className,
      )}
      initial={{ opacity: 0, x: -14 }}
      animate={shown ? { opacity: 1, x: 0 } : { opacity: 0, x: -14 }}
      transition={cueTransition(shown, delay, BEE_SPRING)}
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-[#fabe28]/25 text-[#a15f00]">
        <Glyph size={18} stroke={1.8} />
      </span>
      {label}
    </m.div>
  );
}

/**
 * A source under an answer, in the style of Bee's link chips: a pill with an
 * icon, the label and an open-link arrow. A web source shows the site's
 * favicon from Google's favicon service; a note shows a file icon.
 */
export function SourceChip({
  label,
  domain,
}: {
  label: string;
  /** The website, for its favicon. Omit for one of your notes. */
  domain?: string;
}) {
  return (
    <span
      className="inline-flex h-9 items-center gap-2 rounded-full pr-3 pl-3 text-[16px]"
      style={{ background: BEE.raised, color: BEE.text }}
    >
      {domain ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt=""
          className="size-5 rounded-[5px] object-contain p-px"
          style={{ background: BEE.text }}
        />
      ) : (
        <IconFileText size={18} stroke={1.75} style={{ color: BEE.accent }} />
      )}
      {label}
      <IconExternalLink size={15} stroke={2} style={{ color: BEE.muted }} />
    </span>
  );
}
