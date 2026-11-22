import {
  Accent,
  Card,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import { MaskedText } from "../../_components/motion";

const LABEL = "text-sm font-semibold tracking-[0.14em] text-white/45 uppercase";

/** The presenter's own reflection. The 40+ ideas list is their own count. */
const CARDS: readonly { label: string; text: string }[] = [
  { label: "Before", text: "40+ ideas, filtered down to a few" },
  {
    label: "Now",
    text: "Several at once: Eva, CarePulse and four side projects",
  },
];

export function AnnualUnlocked() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">
          What AI <Accent>unlocked</Accent> for me
        </Title>
      </Reveal>

      <div className="mt-10 grid grid-cols-2 gap-5">
        {CARDS.map((card, index) => (
          <Reveal key={card.label} step={index + 1}>
            {/* p-8 inside a 28px outer radius keeps the corners concentric. */}
            <Card className="flex h-[220px] flex-col rounded-[28px] p-8">
              <div className={LABEL}>{card.label}</div>
              <div className="mt-auto text-3xl leading-snug font-semibold text-white">
                {card.text}
              </div>
            </Card>
          </Reveal>
        ))}
      </div>

      <Reveal step={2} delay={0.4}>
        <p className="mt-6 text-xl text-white/55">
          Learned from people on X, and from Krzys
        </p>
      </Reveal>

      <p className="mt-10 text-3xl text-white/85">
        <MaskedText step={3} delay={0.1}>
          Building the product is the part I love most
        </MaskedText>
      </p>
    </Shell>
  );
}
