import {
  Accent,
  Card,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";

const LABEL = "text-sm font-semibold tracking-[0.14em] text-white/45 uppercase";

const AUTOMATIC: readonly string[] = [
  "Proof recorded with one checkbox",
  "Audits run in the background",
  "Pull requests opened and kept up to date",
  "Titles, tags and PR descriptions written",
  "Finished work closed and archived",
];

const SWITCHES: readonly string[] = [
  "Turn auto-archiving off",
  "Choose if pull requests open automatically",
  "Claude-style activity steps",
];

export function AnnualConfigurable() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">
          Simple by default, <Accent>configurable</Accent> by choice
        </Title>
      </Reveal>

      <div className="mt-10 grid grid-cols-[1.25fr_1fr] gap-5">
        <Reveal step={1}>
          <Card className="flex h-[360px] flex-col gap-5 rounded-[28px] p-8">
            <div className={LABEL}>Done for you</div>
            <ul className="flex flex-col gap-3">
              {AUTOMATIC.map((item) => (
                <li key={item} className="text-xl leading-snug text-white/85">
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </Reveal>

        <Reveal step={2}>
          <Card className="flex h-[360px] flex-col gap-5 rounded-[28px] p-8">
            <div className="flex items-center justify-between">
              <div className={LABEL}>Switches for developers</div>
              <span className="rounded-full bg-white/[0.08] px-3 py-1 text-sm text-white/70">
                Krzys’s requests
              </span>
            </div>
            <ul className="flex flex-col gap-3">
              {SWITCHES.map((item) => (
                <li key={item} className="text-xl leading-snug text-white/85">
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-auto text-lg text-white/55">
              19 experimental switches in all
            </div>
          </Card>
        </Reveal>
      </div>
    </Shell>
  );
}
