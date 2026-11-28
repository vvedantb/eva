import { IconArrowRight } from "@tabler/icons-react";
import {
  Accent,
  Card,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";

const LABEL = "text-sm font-semibold tracking-[0.14em] text-white/45 uppercase";

interface Column {
  label: string;
  items: readonly string[];
}

const COLUMNS: readonly Column[] = [
  {
    label: "Today, now",
    items: [
      "What merged into main",
      "What is new in the app",
      "Written every day, for each app",
    ],
  },
  {
    label: "In progress",
    items: [
      "Live, not once a day",
      "Needs you, in progress, merged",
      "Where every project is, for the business team",
    ],
  },
];

export function AnnualToday() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">
          The <Accent>Today</Accent> page
        </Title>
      </Reveal>

      <div className="mt-12 flex items-center gap-3">
        {COLUMNS.flatMap((column, index) => [
          ...(index > 0
            ? [
                <Reveal key={`${column.label}-arrow`} step={index + 1}>
                  <IconArrowRight
                    size={24}
                    className="text-white/35"
                    aria-hidden
                  />
                </Reveal>,
              ]
            : []),
          <Reveal key={column.label} step={index + 1} className="flex-1">
            <Card className="flex h-[300px] flex-col gap-6 rounded-[28px] p-8">
              <div className={LABEL}>{column.label}</div>
              <ul className="flex flex-col gap-4">
                {column.items.map((item) => (
                  <li
                    key={item}
                    className="text-2xl leading-snug text-white/85"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>,
        ])}
      </div>
    </Shell>
  );
}
