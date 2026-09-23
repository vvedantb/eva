import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../../_components/DeckPrimitives";

interface CommitRow {
  hash: string;
  label: string;
}

/** The first commit, then the two that set the data layer, in order. */
const COMMITS: readonly CommitRow[] = [
  { hash: "5468954a6", label: "The first commit" },
  { hash: "317b85cd5", label: "Projects and tasks schema" },
  { hash: "5467d4ca2", label: "The queries behind it" },
];

export function AnnualDayOne() {
  return (
    <Shell className="justify-center py-16">
      <Reveal from="none">
        <Kicker>Day one</Kicker>
      </Reveal>
      <Reveal delay={0.1}>
        <Title size="xl">11 January 2026</Title>
      </Reveal>

      <Stagger
        step={1}
        delayChildren={0.15}
        staggerChildren={0.12}
        className="mt-12 w-[760px] space-y-3"
      >
        {COMMITS.map((commit) => (
          <StaggerItem key={commit.hash}>
            <div className="flex items-center gap-7 rounded-2xl bg-white/[0.05] px-7 py-4">
              <span className="font-mono text-sm tabular-nums text-white/40">
                {commit.hash}
              </span>
              <span className="text-2xl text-white">{commit.label}</span>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal step={2} delay={0.15} className="mt-12">
        <p className="max-w-3xl text-3xl leading-snug text-balance text-white/85">
          The foundation it still runs on was{" "}
          <Accent>chosen in the first hour</Accent>.
        </p>
      </Reveal>

      <Footnote>First commit 11 January 2026.</Footnote>
    </Shell>
  );
}
