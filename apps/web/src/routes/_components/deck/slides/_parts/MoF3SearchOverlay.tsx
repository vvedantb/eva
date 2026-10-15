import { IconSearch } from "@tabler/icons-react";
import { m } from "motion/react";
import { DUR, EASE, SETTLE } from "../../_components/motion";
import { FriChip, FriTyped } from "./FriMock";

/** What the search reaches, named in the room's words. */
const RESULTS: readonly { title: string; kind: string }[] = [
  { title: "Referral portal", kind: "Codebase" },
  { title: "Decline reasons", kind: "Project" },
  { title: "Export audit trail", kind: "Document" },
  { title: "Zuza — admin pages", kind: "Session" },
];

/** Search results are fixed-height rows, so the selection can glide between them. */
const RESULT_H = 44;
const MATCH_INDEX = 1;

/** The one-search palette: drops in, types the query, then the selection glides to the match. */
export function MoF3SearchOverlay() {
  return (
    <m.div
      className="absolute inset-0 flex items-start justify-center rounded-[20px] bg-black/60 pt-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: DUR.fast, ease: EASE.out } }}
      transition={{ duration: DUR.base, ease: EASE.out }}
    >
      <m.div
        className="w-[520px] overflow-hidden rounded-[20px] bg-[#16161a] p-4 ring-1 ring-white/15"
        initial={{ opacity: 0, y: -18, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{
          opacity: 0,
          scale: 0.97,
          transition: { duration: DUR.fast, ease: EASE.out },
        }}
        transition={{ duration: DUR.slow, ease: EASE.expo, delay: 0.05 }}
      >
        <div className="flex items-center gap-3 rounded-[12px] bg-white/[0.06] px-3 py-2.5">
          <IconSearch size={16} className="text-white/40" />
          <span className="flex-1 text-[14px] text-white/85">
            <FriTyped text="decline" delay={0.35} duration={0.6} />
          </span>
          <FriChip>Cmd K</FriChip>
        </div>
        <div className="relative mt-2 flex flex-col">
          {/* The selection lands on the first result, then glides to the match. */}
          <m.span
            aria-hidden
            className="absolute inset-x-0 top-0 rounded-[12px] bg-white/[0.07]"
            style={{ height: RESULT_H }}
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: RESULT_H * MATCH_INDEX }}
            transition={{
              opacity: { duration: DUR.base, delay: 0.9 },
              y: { ...SETTLE, delay: 1.25 },
            }}
          />
          {RESULTS.map((result, index) => (
            <m.div
              key={result.title}
              className="relative flex items-center gap-3 px-3"
              style={{ height: RESULT_H }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: DUR.slow,
                ease: EASE.expo,
                delay: 0.75 + index * 0.07,
              }}
            >
              <m.span
                className="flex-1 truncate text-[13px] text-white"
                initial={{ opacity: 0.75 }}
                animate={{ opacity: index === MATCH_INDEX ? 1 : 0.7 }}
                transition={{ duration: DUR.base, delay: 1.35 }}
              >
                {result.title}
              </m.span>
              <FriChip>{result.kind}</FriChip>
            </m.div>
          ))}
        </div>
      </m.div>
    </m.div>
  );
}
