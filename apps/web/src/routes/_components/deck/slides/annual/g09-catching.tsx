import {
  Accent,
  Card,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import { MaskedText } from "../../_components/motion";

const LABEL = "text-xs font-semibold tracking-[0.14em] text-white/45 uppercase";

interface Catch {
  asked: string;
  caught: string;
}

/**
 * The presenter's own lines from Eva sessions, lightly trimmed:
 * - CarePulse #119, 19 October 2026: production database connection limit.
 * - Eva #434, 9 November 2026: test audit; 21,708 lines removed, CI check
 *   83.6 s to 16.6 s (#1036, 20 November 2026).
 * - CarePulse #315, 19 November 2026: home care tiers, tested on staging.
 */
const CATCHES: readonly Catch[] = [
  {
    asked:
      "Is this really the correct approach? The official Prisma example uses the strategy we had before",
    caught:
      "The AI had no evidence for its fix. The real cause was about 22 database calls per page view",
  },
  {
    asked: "Be honest, have these tests ever helped us prevent a regression?",
    caught:
      "Hundreds of test files never ran. 21,708 lines went, and the CI check fell from 83.6 s to 16.6 s",
  },
  {
    asked:
      "Does it save in the backend, or is this just frontend manipulation?",
    caught:
      "“No backend change needed” was tested against staging before I accepted it",
  },
];

export function AnnualCatching() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">
          Catching the <Accent>AI</Accent>
        </Title>
      </Reveal>

      <div className="mt-8 flex flex-col gap-4">
        {CATCHES.map((item, index) => (
          <Reveal key={item.asked} step={index + 1}>
            {/* p-6 inside a 24px outer radius keeps the corners concentric. */}
            <Card className="grid grid-cols-[1.1fr_1fr] gap-8 rounded-[24px] p-6">
              <div>
                <div className={LABEL}>I asked</div>
                <div className="mt-2 text-xl leading-snug font-medium text-white">
                  “{item.asked}”
                </div>
              </div>
              <div>
                <div className={LABEL}>What it found</div>
                <div className="mt-2 text-lg leading-snug text-white/75">
                  {item.caught}
                </div>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>

      <p className="mt-8 text-3xl text-white/85">
        <MaskedText step={4} delay={0.1}>
          The right question is still the human’s job
        </MaskedText>
      </p>
    </Shell>
  );
}
