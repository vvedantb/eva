import {
  Accent,
  Card,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import { MaskedText } from "../../_components/motion";

const LABEL = "text-sm font-semibold tracking-[0.14em] text-white/45 uppercase";

/**
 * Eva's connector gives Claude read-only access to live data: the remote MCP
 * server with sign-in for Claude connectors (19 February 2026) and the
 * read-only Postgres replica (10 June 2026). Matt's dashboard is the example.
 */
const USES: readonly string[] = [
  "Their own dashboards",
  "Their own KPIs",
  "Help with their own work",
];

const MATT: readonly string[] = [
  "Designed it with Claude",
  "Uploaded it to Eva",
  "Live in CarePulse",
];

export function AnnualLiveData() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">
          Live data for <Accent>everyone</Accent>
        </Title>
      </Reveal>

      <div className="mt-10 grid grid-cols-2 gap-5">
        <Reveal step={1}>
          {/* p-8 inside a 28px outer radius keeps the corners concentric. */}
          <Card className="flex h-[290px] flex-col gap-6 rounded-[28px] p-8">
            <div className={LABEL}>Anyone, with Claude</div>
            <ul className="flex flex-col gap-4">
              {USES.map((use) => (
                <li key={use} className="text-2xl leading-snug text-white/85">
                  {use}
                </li>
              ))}
            </ul>
          </Card>
        </Reveal>

        <Reveal step={2}>
          <Card className="flex h-[290px] flex-col gap-6 rounded-[28px] p-8">
            <div className={LABEL}>Matt’s dashboard</div>
            <ol className="flex flex-col gap-4">
              {MATT.map((line, index) => (
                <li
                  key={line}
                  className="flex items-baseline gap-4 text-2xl leading-snug text-white/85"
                >
                  <span className="text-base text-white/40 tabular-nums">
                    {index + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </Card>
        </Reveal>
      </div>

      <p className="mt-10 text-3xl text-white/85">
        <MaskedText step={3} delay={0.1}>
          Read-only, live, and no developer in the way
        </MaskedText>
      </p>
    </Shell>
  );
}
