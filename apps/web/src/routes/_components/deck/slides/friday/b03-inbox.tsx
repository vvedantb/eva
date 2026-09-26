import type { Icon } from "@tabler/icons-react";
import {
  IconMessageCircle,
  IconClockHour3,
  IconGitPullRequest,
  IconRocket,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import {
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { DUR, EASE, Morph, SETTLE } from "../../_components/motion";
import { FriChip, FriWindow } from "../_parts/FriMock";
import {
  MoF2BrowserTab,
  MoF2InboxDetail,
  MoF2KeyHint,
} from "../_parts/MoF2Inbox";

interface Row {
  title: string;
  kind: string;
  icon: Icon;
}

/** Newest first, the way the real list reads. */
const ROWS: readonly Row[] = [
  { title: "Referral export ready", kind: "Review", icon: IconGitPullRequest },
  { title: "Overnight checks finished", kind: "Routine", icon: IconClockHour3 },
  { title: "Zuza replied", kind: "Session", icon: IconMessageCircle },
  { title: "Decline emails shipped", kind: "Task", icon: IconRocket },
];

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
        >
          <span
            aria-hidden
            className="absolute top-3 bottom-3 left-0 w-[3px] rounded-full bg-gradient-to-b from-[#8B3FB8] to-[#3B7DD8]"
          />
        </m.span>
      ) : null}
      <div className="relative flex items-center gap-3 px-3 py-2.5">
        <m.span
          aria-hidden
          className="size-2 shrink-0 rounded-full bg-[#3B7DD8]"
          animate={{ opacity: selected ? 0.2 : 1, scale: selected ? 0.7 : 1 }}
          transition={{ duration: DUR.base, ease: EASE.out }}
        />
        <span
          className={cn(
            "flex-1 truncate text-[13px] transition-colors duration-300",
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

export function FridayInbox() {
  const step = useDeckStep();
  const selected = step >= 1 ? 1 : 0;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Using Eva · Inbox</Kicker>
        <Title size="md">Everything that needs you, in one place.</Title>
      </Reveal>

      <div className="mt-9 flex justify-end pr-10">
        <MoF2BrowserTab />
      </div>

      <Reveal delay={0.2} distance={28}>
        <FriWindow
          label="Inbox"
          className="h-[340px] w-full"
          bodyClassName="flex gap-4 p-0"
          trailing={
            <>
              <MoF2KeyHint label="↑" />
              <MoF2KeyHint label="↓" pressed />
            </>
          }
        >
          <Stagger
            delayChildren={0.45}
            staggerChildren={0.07}
            className="w-[380px] shrink-0 border-r border-white/[0.06] px-2 py-2"
          >
            {ROWS.map((entry, index) => (
              <StaggerItem key={entry.title}>
                <InboxRow
                  row={entry}
                  index={index}
                  selected={index === selected}
                />
              </StaggerItem>
            ))}
          </Stagger>

          <Morph
            blur={false}
            className="flex-1 p-6"
            states={ROWS.slice(0, 2).map((row) => (
              <MoF2InboxDetail
                key={row.title}
                title={row.title}
                icon={row.icon}
              />
            ))}
          />
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
