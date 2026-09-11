import { AnimatePresence, m } from "motion/react";
import { cn } from "@eva/ui";
import { BRAND, EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";

const NAV: readonly string[] = [
  "Home",
  "Notes",
  "Databases",
  "Calendar",
  "Mail",
  "Sites",
  "Forms",
  "AI meeting notes",
  "Marketplace",
];

/** The three rows that survive the trim, in the order they already appear. */
const KEPT: readonly string[] = ["Home", "Notes", "Calendar"];

interface Block {
  key: string;
  height: number;
}

const BLOCKS_BEFORE: readonly Block[] = [
  { key: "a", height: 54 },
  { key: "b", height: 54 },
  { key: "c", height: 54 },
];

const BLOCKS_AFTER: readonly Block[] = [
  { key: "a", height: 88 },
  { key: "b", height: 88 },
];

function NavRow({ label, index }: { label: string; index: number }) {
  return (
    <m.div
      className="flex items-center gap-2 overflow-hidden rounded-md px-2"
      initial={{ opacity: 0, height: 26 }}
      animate={{ opacity: 1, height: 26 }}
      exit={{
        opacity: 0,
        height: 0,
        transition: { duration: 0.3, ease: EASE_OUT, delay: index * 0.05 },
      }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-white/25" />
      <span className="truncate text-xs text-white/70">{label}</span>
    </m.div>
  );
}

function NewNavRow() {
  return (
    <m.div
      className="flex items-center gap-2 overflow-hidden rounded-md bg-white/[0.07] px-2"
      initial={{ opacity: 0, height: 0, x: -12 }}
      animate={{ opacity: 1, height: 26, x: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.5 }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{
          background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
        }}
      />
      <span className="flex-1 truncate text-xs text-white">Referral queue</span>
      <span className="rounded-full bg-white/15 px-1.5 text-[10px] text-white/75">
        new
      </span>
    </m.div>
  );
}

/** A note-taking app that grew too many features, then gets trimmed to one person's. */
export function PersonalAppMock() {
  const personal = useDeckStep() >= 2;
  const rows = personal ? NAV.filter((item) => KEPT.includes(item)) : NAV;
  const blocks = personal ? BLOCKS_AFTER : BLOCKS_BEFORE;

  return (
    <div className="h-[310px] w-[540px] overflow-hidden rounded-2xl bg-white/[0.06]">
      <div className="flex h-9 items-center gap-2 border-b border-white/[0.06] px-4">
        <span className="size-2 rounded-full bg-white/20" />
        <span className="size-2 rounded-full bg-white/20" />
        <span className="size-2 rounded-full bg-white/20" />
        <div className="relative ml-3 h-4 flex-1">
          <AnimatePresence initial={false}>
            <m.span
              key={personal ? "personal" : "everyone"}
              className="absolute inset-0 text-xs text-white/55"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
            >
              {personal ? "An app, for me" : "An app, for everyone"}
            </m.span>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex h-[calc(310px-36px)] gap-4 p-4">
        <m.div layout className="w-[164px] shrink-0">
          <AnimatePresence initial={false}>
            {rows.map((label, index) => (
              <NavRow key={label} label={label} index={index} />
            ))}
          </AnimatePresence>
          {personal ? <NewNavRow /> : null}
        </m.div>

        <m.div layout className="flex flex-1 flex-col gap-3">
          <AnimatePresence initial={false}>
            {blocks.map((block) => (
              <m.div
                key={block.key}
                layout
                className={cn("rounded-lg bg-white/[0.05]")}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, height: block.height }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.45, ease: EASE_OUT }}
              />
            ))}
          </AnimatePresence>
        </m.div>
      </div>
    </div>
  );
}
