import {
  Accent,
  Card,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import { MaskedText } from "../../_components/motion";

const LABEL = "text-xs font-semibold tracking-[0.14em] text-white/45 uppercase";

interface Option {
  name: string;
  verdict: string;
  why: string;
}

/**
 * Travel-time search on the nursing home referral portal, shipped 12 October
 * 2026 (carepulse-ts). Figures are estimates from the Eva session's own sizing,
 * 2 October 2026, in US dollars: Google driving at $10 per 1,000 elements,
 * about $685 to $1,330 a month; TfL 500 requests a minute per key; Mapbox free
 * for the first 100,000 elements a month, against about 73,450 expected.
 */
const OPTIONS: readonly Option[] = [
  {
    name: "Google APIs",
    verdict: "Ruled out",
    why: "About $685 to $1,330 a month, estimated",
  },
  {
    name: "One TfL API key",
    verdict: "Ruled out",
    why: "500 requests a minute, shared by everyone searching",
  },
  {
    name: "Mapbox",
    verdict: "Chosen",
    why: "Driving inside its free tier",
  },
];

export function AnnualJudgement() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">
          The <Accent>judgement</Accent> is still ours
        </Title>
      </Reveal>

      <Reveal delay={0.3}>
        <p className="mt-4 text-2xl text-white/60">
          Travel-time search looked like a simple feature
        </p>
      </Reveal>

      <div className="mt-10 grid grid-cols-3 gap-4">
        {OPTIONS.map((option, index) => (
          <Reveal key={option.name} step={index + 1}>
            {/* p-7 inside a 28px outer radius keeps the corners concentric. */}
            <Card className="flex h-[240px] flex-col rounded-[28px] p-7">
              <div className={LABEL}>{option.verdict}</div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {option.name}
              </div>
              <div className="mt-auto text-lg leading-snug text-white/75">
                {option.why}
              </div>
            </Card>
          </Reveal>
        ))}
      </div>

      <p className="mt-10 text-3xl text-white/85">
        <MaskedText step={4} delay={0.1}>
          The AI never raised either problem on its own
        </MaskedText>
      </p>
    </Shell>
  );
}
