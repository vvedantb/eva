import { IconCheck, IconSearch } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import type { Transition } from "motion/react";
import {
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { FriChip, FriTyped, FriWindow } from "../_parts/FriMock";

interface FileRow {
  name: string;
  added: number;
  removed: number;
}

/** Three files, the shape a reviewer sees first. */
const FILES: readonly FileRow[] = [
  { name: "Referral form", added: 84, removed: 12 },
  { name: "Decline reasons", added: 57, removed: 3 },
  { name: "Tests", added: 96, removed: 0 },
];

/** What the search reaches, named in the room's words. */
const RESULTS: readonly { title: string; kind: string }[] = [
  { title: "Referral portal", kind: "Codebase" },
  { title: "Decline reasons", kind: "Project" },
  { title: "Export audit trail", kind: "Document" },
  { title: "Zuza — admin pages", kind: "Session" },
];

const SETTLE: Transition = { type: "spring", bounce: 0, duration: 0.55 };

function CommentCard() {
  const landed = useDeckStep() >= 1;

  return (
    <m.div
      className="absolute right-6 bottom-4 left-6 flex items-center gap-3 rounded-[16px] bg-white/[0.1] px-4 py-3 ring-1 ring-white/10"
      initial={{ opacity: 0, y: 18, scale: 0.95 }}
      animate={{
        opacity: landed ? 1 : 0,
        y: landed ? 0 : 18,
        scale: landed ? 1 : 0.95,
      }}
      transition={landed ? SETTLE : { duration: 0.25, ease: EASE_OUT }}
    >
      <span
        aria-hidden
        className="size-7 shrink-0 rounded-full bg-gradient-to-br from-[#8B3FB8] to-[#3B7DD8]"
      />
      <span className="text-[13px] leading-snug text-white/85">
        Rename this to decline reason
      </span>
    </m.div>
  );
}

function SearchOverlay() {
  return (
    <m.div
      className="absolute inset-0 flex items-start justify-center rounded-[20px] bg-black/60 pt-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE_OUT } }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      <m.div
        className="w-[520px] overflow-hidden rounded-[20px] bg-[#16161a] p-4 ring-1 ring-white/15"
        initial={{ opacity: 0, y: 22, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{
          opacity: 0,
          scale: 0.97,
          transition: { duration: 0.2, ease: EASE_OUT },
        }}
        transition={SETTLE}
      >
        <div className="flex items-center gap-3 rounded-[12px] bg-white/[0.06] px-3 py-2.5">
          <IconSearch size={16} className="text-white/40" />
          <span className="flex-1 text-[14px] text-white/85">
            <FriTyped text="decline" delay={0.35} duration={0.6} />
          </span>
          <FriChip>Cmd K</FriChip>
        </div>
        <div className="mt-2 flex flex-col">
          {RESULTS.map((result, index) => (
            <m.div
              key={result.title}
              className="flex items-center gap-3 rounded-[12px] px-3 py-2.5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SETTLE, delay: 0.25 + index * 0.08 }}
            >
              <span className="flex-1 truncate text-[13px] text-white/75">
                {result.title}
              </span>
              <FriChip>{result.kind}</FriChip>
            </m.div>
          ))}
        </div>
      </m.div>
    </m.div>
  );
}

export function FridayReviews() {
  const searching = useDeckStep() >= 2;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Reviews</Kicker>
        <Title size="md">Review it without leaving.</Title>
      </Reveal>

      <Reveal delay={0.1} className="relative mt-10 mx-auto w-[900px]">
        <FriWindow
          label="A bundle of changes · referral portal"
          className="h-[330px] w-full"
          bodyClassName="relative flex flex-col gap-2 px-6 py-4"
          trailing={
            <span className="flex items-center gap-1.5 rounded-full bg-[#3B7DD8]/20 px-2.5 py-1 text-[11px] text-white/80">
              <IconCheck size={12} />
              Ready
            </span>
          }
        >
          {FILES.map((file) => (
            <div
              key={file.name}
              className="flex items-center gap-4 rounded-[12px] bg-white/[0.04] px-4 py-3"
            >
              <span className="flex-1 truncate text-[13px] text-white/70">
                {file.name}
              </span>
              <span className="text-[12px] text-[#3B7DD8] tabular-nums">
                +{file.added}
              </span>
              <span className="w-10 text-right text-[12px] text-white/40 tabular-nums">
                −{file.removed}
              </span>
            </div>
          ))}
          <CommentCard />
        </FriWindow>

        <AnimatePresence>
          {searching ? <SearchOverlay key="search" /> : null}
        </AnimatePresence>
      </Reveal>

      <Footnote>
        Bundles of changes reviewed and answered inside Eva, 3 August 2026. One
        search across everything in Eva, 24 July 2026. Rebindable keyboard
        shortcuts, 6 August 2026.
      </Footnote>
    </Shell>
  );
}
