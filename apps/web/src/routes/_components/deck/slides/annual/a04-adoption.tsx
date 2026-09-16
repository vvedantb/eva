import {
  Body,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../../_components/DeckPrimitives";
import { AnnualAdoptionChart } from "../_parts/AnnualAdoptionChart";

const ROWS: readonly string[] = [
  "13 people beyond the developer have raised work in Eva",
  "390 pieces of work raised against CarePulse",
  "225 sessions ended in a bundle of changes ready to review",
];

export function AnnualAdoption() {
  return (
    <Shell className="py-12">
      <Reveal from="none">
        <Kicker>How it took hold</Kicker>
      </Reveal>
      <Reveal delay={0.1}>
        <Title size="md">From one person to the whole team.</Title>
      </Reveal>
      <Reveal delay={0.25}>
        <Body className="mt-4 max-w-4xl text-lg">
          Every bar is a month of work raised in Eva. The habit spread as the
          tool got easier to use.
        </Body>
      </Reveal>

      <div className="mt-4">
        <AnnualAdoptionChart />
      </div>

      <Reveal step={2} className="mt-5">
        <Card className="py-4">
          <Stagger
            step={2}
            delayChildren={0.2}
            staggerChildren={0.12}
            className="space-y-2"
          >
            {ROWS.map((row) => (
              <StaggerItem key={row}>
                <div className="text-base text-white/80">{row}</div>
              </StaggerItem>
            ))}
          </Stagger>
        </Card>
      </Reveal>

      <Footnote>
        Counts are sessions created per calendar month in Eva, to 16 September
        2026. June 2026 has none recorded.
      </Footnote>
    </Shell>
  );
}
