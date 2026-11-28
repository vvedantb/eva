import { IconCheck } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Card,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { ACCENT_GRADIENT, DUR, EASE } from "../../_components/motion";

interface CheckGroup {
  label: string;
  items: readonly string[];
}

const GROUPS: readonly CheckGroup[] = [
  {
    label: "Proof",
    items: ["Screenshots of the change", "A walkthrough video"],
  },
  { label: "Audits", items: ["Security", "Code review", "Code clean-up"] },
];

function Check({ label, at, on }: { label: string; at: number; on: boolean }) {
  return (
    <li className="flex items-center gap-3 text-xl text-white/85">
      <m.span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full"
        style={{ background: ACCENT_GRADIENT }}
        initial={false}
        animate={on ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -45 }}
        transition={
          on
            ? { duration: DUR.base, ease: EASE.expo, delay: at }
            : { duration: DUR.fast }
        }
      >
        <IconCheck size={15} stroke={3} className="text-white" />
      </m.span>
      {label}
    </li>
  );
}

export function AnnualChecks() {
  const step = useDeckStep();
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">
          Ready, at a <Accent>glance</Accent>
        </Title>
      </Reveal>

      <div className="mt-10 grid grid-cols-2 gap-5">
        {GROUPS.map((group, index) => (
          <Reveal key={group.label} step={index + 1}>
            <Card className="flex h-[300px] flex-col gap-6 rounded-[28px] p-8">
              <div className="text-sm font-semibold tracking-[0.14em] text-white/45 uppercase">
                {group.label}
              </div>
              <ul className="flex flex-col gap-4">
                {group.items.map((item, row) => (
                  <Check
                    key={item}
                    label={item}
                    on={step >= index + 1}
                    at={0.35 + row * 0.15}
                  />
                ))}
              </ul>
            </Card>
          </Reveal>
        ))}
      </div>
    </Shell>
  );
}
