import {
  Accent,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { MaskedText } from "../../_components/motion";
import { MoA3DurableTrack } from "../_parts/MoA3DurableTrack";

export function AnnualDurable() {
  const step = useDeckStep();
  const durable = step >= 1;

  return (
    <Shell className="py-14">
      <Reveal>
        <Title size="md">Finishing what it starts</Title>
      </Reveal>

      <div className="mt-36 h-[72px]">
        <MoA3DurableTrack durable={durable} closing={step >= 2} />
      </div>

      <div className="mt-32 text-center">
        <MaskedText step={2} className="text-3xl text-white/85">
          Interrupted is no longer the same as <Accent>lost</Accent>.
        </MaskedText>
      </div>
    </Shell>
  );
}
