import { IconCheck, IconFileCode } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import {
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { CountUp } from "../../_components/CountUp";
import {
  DUR,
  DrawPath,
  EASE,
  LEAVE,
  SETTLE,
  Sheen,
  cueTransition,
} from "../../_components/motion";
import { FriWindow } from "../_parts/FriMock";
import { MoF3SearchOverlay } from "../_parts/MoF3SearchOverlay";

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

/** Five diff blocks per file, the way a reviewer reads the size of a change. */
const BLOCKS = 5;
const blocksFor = ({ added, removed }: FileRow) => {
  const total = added + removed;
  const plus = Math.round((added / total) * BLOCKS);
  return Array.from({ length: BLOCKS }, (_, index) =>
    index < plus ? "bg-[#3B7DD8]" : "bg-white/25",
  );
};

/** The comment thread runs up the gutter from the avatar to the first file. */
const THREAD = "M40 247 H22 Q12 247 12 237 V48 Q12 38 22 38 H26";
function FileLine({ file, index }: { file: FileRow; index: number }) {
  const commented = useDeckStep() >= 1 && index === 0;
  const delay = 0.45 + index * 0.1;
  return (
    <m.div
      className="relative flex items-center gap-4 rounded-[12px] bg-white/[0.04] px-4 py-3"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.slow, ease: EASE.expo, delay }}
    >
      <m.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-[#8B3FB8]/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: commented ? 1 : 0 }}
        transition={cueTransition(commented, 1.0, { duration: DUR.base })}
      />
      <IconFileCode size={15} aria-hidden className="text-white/35" />
      <span className="flex-1 truncate text-[13px] text-white/70">
        {file.name}
      </span>
      <span className="text-[12px] text-[#3B7DD8] tabular-nums">
        <CountUp
          value={file.added}
          prefix="+"
          delay={delay + 0.2}
          duration={1}
        />
      </span>
      <span className="w-10 text-right text-[12px] text-white/40 tabular-nums">
        −{file.removed}
      </span>
      <span className="flex gap-[3px]" aria-hidden>
        {blocksFor(file).map((tone, block) => (
          <m.span
            key={block}
            className={`size-2 rounded-[2px] ${tone}`}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: DUR.base,
              ease: EASE.out,
              delay: delay + 0.35 + block * 0.05,
            }}
          />
        ))}
      </span>
    </m.div>
  );
}

function CommentCard() {
  const landed = useDeckStep() >= 1;

  return (
    <m.div
      className="absolute right-6 bottom-4 left-6 rounded-[16px] bg-white/[0.1] ring-1 ring-white/10"
      initial={{ opacity: 0, y: 18, scale: 0.95 }}
      animate={{
        opacity: landed ? 1 : 0,
        y: landed ? 0 : 18,
        scale: landed ? 1 : 0.95,
      }}
      transition={landed ? SETTLE : LEAVE}
    >
      <Sheen step={1} delay={0.5} className="rounded-[16px]">
        <div className="flex items-center gap-3 px-4 py-3">
          <span
            aria-hidden
            className="size-7 shrink-0 rounded-full bg-gradient-to-br from-[#8B3FB8] to-[#3B7DD8]"
          />
          <span className="text-[13px] leading-snug text-white/85">
            Rename this to decline reason
          </span>
        </div>
      </Sheen>
    </m.div>
  );
}

export function FridayReviews() {
  const step = useDeckStep();
  const searching = step >= 2;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Trust and reach · Reviewing</Kicker>
        <Title size="md">Review it without leaving.</Title>
      </Reveal>

      <Reveal delay={0.1} className="relative mt-10 mx-auto w-[900px]">
        {/* Behind the search the review recedes a touch, so the palette reads as in front. */}
        <m.div
          initial={false}
          animate={{ scale: searching ? 0.975 : 1 }}
          transition={
            searching ? { duration: DUR.slow, ease: EASE.expo } : LEAVE
          }
        >
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
            {FILES.map((file, index) => (
              <FileLine key={file.name} file={file} index={index} />
            ))}
            <DrawPath
              d={THREAD}
              width={60}
              height={260}
              step={1}
              delay={0.35}
              duration={0.8}
              strokeWidth={1.5}
              dot
              className="pointer-events-none absolute top-0 left-0"
            />
            <CommentCard />
          </FriWindow>
        </m.div>

        <AnimatePresence>
          {searching ? <MoF3SearchOverlay key="search" /> : null}
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
