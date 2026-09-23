import { m } from "motion/react";
import type { Transition } from "motion/react";
import { cn } from "@eva/ui";
import {
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { FriChip, FriLines, FriWindow } from "../_parts/FriMock";

interface Row {
  title: string;
  kind: string;
}

/** Newest first, the way the real list reads. */
const ROWS: readonly Row[] = [
  { title: "Referral export ready", kind: "Review" },
  { title: "Overnight checks finished", kind: "Routine" },
  { title: "Zuza replied", kind: "Session" },
  { title: "Decline emails shipped", kind: "Task" },
];

const SETTLE: Transition = { type: "spring", bounce: 0, duration: 0.55 };

function InboxRow({
  row,
  index,
  selected,
}: {
  row: Row;
  index: number;
  selected: boolean;
}) {
  return (
    <div className="relative px-1 py-1">
      {selected ? (
        <m.span
          layoutId="fri-inbox-selection"
          className="absolute inset-0 rounded-[14px] bg-white/[0.09] ring-1 ring-white/10"
          transition={SETTLE}
        />
      ) : null}
      <div className="relative flex items-center gap-3 px-3 py-2.5">
        <m.span
          aria-hidden
          className="size-2 shrink-0 rounded-full bg-[#3B7DD8]"
          animate={{ opacity: selected ? 0.25 : 1 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
        />
        <span
          className={cn(
            "flex-1 truncate text-[13px]",
            selected ? "text-white" : "text-white/60",
          )}
        >
          {row.title}
        </span>
        <FriChip>{row.kind}</FriChip>
      </div>
      {index < ROWS.length - 1 ? (
        <span className="absolute right-4 bottom-0 left-4 h-px bg-white/[0.05]" />
      ) : null}
    </div>
  );
}

function KeyHint({ label }: { label: string }) {
  const shown = useDeckStep() >= 1;
  return (
    <m.span
      className="flex h-6 min-w-6 items-center justify-center rounded-[8px] bg-white/[0.08] px-1.5 text-[11px] text-white/55"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : -6 }}
      transition={{ ...SETTLE, delay: shown ? 0.2 : 0 }}
    >
      {label}
    </m.span>
  );
}

/** The tab that carries the unread count while the room is looking elsewhere. */
function BrowserTab() {
  const shown = useDeckStep() >= 2;

  return (
    <m.div
      className="flex items-center gap-2.5 rounded-t-[14px] bg-white/[0.08] px-4 py-2"
      initial={{ opacity: 0, y: 10, scale: 0.94 }}
      animate={{
        opacity: shown ? 1 : 0,
        y: shown ? 0 : 10,
        scale: shown ? 1 : 0.94,
      }}
      transition={shown ? SETTLE : { duration: 0.25, ease: EASE_OUT }}
    >
      <span
        aria-hidden
        className="size-3 rounded-full bg-gradient-to-br from-[#8B3FB8] to-[#3B7DD8]"
      />
      <span className="text-[12px] text-white/70">Eva</span>
      <span className="relative flex size-5 items-center justify-center">
        <m.span
          aria-hidden
          className="absolute inset-0 rounded-full ring-1 ring-[#3B7DD8]"
          animate={
            shown
              ? { scale: [1, 2.2], opacity: [0.7, 0] }
              : { scale: 1, opacity: 0 }
          }
          transition={{
            duration: 1.4,
            ease: EASE_OUT,
            repeat: Infinity,
            repeatDelay: 0.6,
          }}
        />
        <m.span
          className="relative flex size-5 items-center justify-center rounded-full bg-[#3B7DD8] text-[11px] font-semibold text-white tabular-nums"
          initial={{ scale: 0.4 }}
          animate={{ scale: shown ? 1 : 0.4 }}
          transition={{ ...SETTLE, delay: shown ? 0.15 : 0 }}
        >
          3
        </m.span>
      </span>
    </m.div>
  );
}

export function FridayInbox() {
  const step = useDeckStep();
  const selected = step >= 1 ? 1 : 0;
  const row = ROWS[selected] ?? ROWS[0];

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Inbox</Kicker>
        <Title size="md">Everything that needs you, in one place.</Title>
      </Reveal>

      <div className="mt-9 flex justify-end pr-10">
        <BrowserTab />
      </div>

      <Reveal delay={0.15}>
        <FriWindow
          label="Inbox"
          className="h-[320px] w-full"
          bodyClassName="flex gap-4 p-0"
          trailing={
            <>
              <KeyHint label="↑" />
              <KeyHint label="↓" />
            </>
          }
        >
          <div className="w-[380px] shrink-0 border-r border-white/[0.06] px-2 py-2">
            {ROWS.map((entry, index) => (
              <InboxRow
                key={entry.title}
                row={entry}
                index={index}
                selected={index === selected}
              />
            ))}
          </div>

          <div className="flex-1 p-5">
            <m.div
              key={row?.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            >
              <div className="text-lg font-medium text-white">{row?.title}</div>
              <div className="mt-4 h-8 rounded-[12px] bg-white/[0.07]" />
              <FriLines widths={[420, 360, 400, 300]} className="mt-4" />
            </m.div>
          </div>
        </FriWindow>
      </Reveal>

      <Footnote>
        List and detail in one view, driven by the arrow keys, 20 August 2026.
        Chime and unread count on the browser tab, 1 August 2026. Mark a row
        unread again, 29 August 2026.
      </Footnote>
    </Shell>
  );
}
