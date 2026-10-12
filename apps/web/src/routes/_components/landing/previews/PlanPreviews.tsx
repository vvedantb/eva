import { IconArrowRight, IconNotes } from "@tabler/icons-react";
import {
  MockAvatar,
  MockChip,
  MockDot,
  MockLabel,
  MockLine,
  MockRow,
  MockWindow,
} from "./MockParts";

/** Collaborative document editor with two other people in the file. */
export function DocumentsPreview() {
  return (
    <MockWindow
      title="documents / checkout-rework.md"
      trailing={
        <span className="flex -space-x-1.5">
          <MockAvatar initials="RK" tone="primary" />
          <MockAvatar initials="JM" tone="review" />
        </span>
      }
      bodyClassName="p-5"
    >
      <p className="text-sm font-semibold text-foreground">
        Checkout rework — PRD
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <MockDot tone="success" pulse />
        <span className="text-[10.5px] text-muted-foreground">
          2 people editing · saved just now
        </span>
      </div>

      <div className="mt-5 space-y-3">
        <MockLabel>Requirements</MockLabel>
        <div className="space-y-2">
          <MockLine width="w-[92%]" />
          <MockLine width="w-[78%]" />
          <span className="relative block">
            <MockLine width="w-[60%]" />
            <span className="absolute -top-0.5 left-[60%] h-3 w-px bg-primary" />
            <span className="absolute -top-3 left-[60%] rounded-sm bg-primary px-1 py-px text-[8px] font-medium text-primary-foreground">
              Riya
            </span>
          </span>
        </div>

        <div className="pt-2">
          <MockLabel>Acceptance criteria</MockLabel>
        </div>
        <div className="space-y-2">
          <MockLine width="w-[85%]" tone="faint" />
          <MockLine width="w-[70%]" tone="faint" />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-2">
        <MockChip tone="primary">In agent context</MockChip>
        <span className="truncate text-[10.5px] text-muted-foreground">
          Read by 3 tasks in this repository
        </span>
      </div>
    </MockWindow>
  );
}

const PROJECT_COLUMNS = [
  {
    name: "Backlog",
    cards: [
      { title: "Postcode lookup", tone: "neutral" as const },
      { title: "Saved cards", tone: "neutral" as const },
    ],
  },
  {
    name: "In progress",
    cards: [
      { title: "Address form", tone: "warning" as const },
      { title: "Tax rules", tone: "warning" as const },
    ],
  },
  {
    name: "In review",
    cards: [{ title: "Basket totals", tone: "review" as const }],
  },
];

/** Project board: a feature split into tasks that each run on their own. */
export function ProjectsPreview() {
  return (
    <MockWindow
      title="projects / checkout-rework"
      trailing={<MockChip tone="primary">5 tasks</MockChip>}
      bodyClassName="p-4"
    >
      <div className="grid h-full grid-cols-3 gap-2">
        {PROJECT_COLUMNS.map((column) => (
          <div
            key={column.name}
            className="flex flex-col gap-2 rounded-md border border-border bg-muted/25 p-2"
          >
            <div className="flex items-center justify-between">
              <MockLabel>{column.name}</MockLabel>
              <span className="text-[9.5px] text-muted-foreground">
                {column.cards.length}
              </span>
            </div>
            {column.cards.map((card) => (
              <div
                key={card.title}
                className="space-y-2 rounded-md border border-border bg-card p-2"
              >
                <p className="text-2xs font-medium leading-tight text-foreground">
                  {card.title}
                </p>
                <div className="flex items-center justify-between">
                  <MockDot tone={card.tone} pulse={card.tone === "warning"} />
                  <MockAvatar initials="EV" tone="primary" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </MockWindow>
  );
}

const DRAFTS = [
  { title: "Retry failed webhooks", meta: "Edited 2 hours ago" },
  { title: "Cache the pricing table", meta: "Edited yesterday" },
  { title: "Drop the legacy admin route", meta: "Edited 3 days ago" },
];

/** Drafts list: unspecified ideas, one step away from becoming a task. */
export function DraftsPreview() {
  return (
    <MockWindow
      title="acme/web · drafts"
      trailing={<MockChip>3 drafts</MockChip>}
      bodyClassName="p-4"
    >
      <div className="space-y-1.5">
        {DRAFTS.map((draft, index) => (
          <MockRow
            key={draft.title}
            active={index === 0}
            leading={
              <IconNotes
                size={15}
                className="shrink-0 text-muted-foreground"
                aria-hidden
              />
            }
            label={draft.title}
            meta={draft.meta}
            trailing={
              index === 0 ? (
                <span className="flex items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-1 text-3xs font-medium text-primary">
                  Promote
                  <IconArrowRight size={11} aria-hidden />
                </span>
              ) : null
            }
          />
        ))}
      </div>

      <div className="mt-4 rounded-md border border-dashed border-border px-3 py-6 text-center">
        <p className="text-2xs text-muted-foreground">
          Write it down now, specify it later.
        </p>
      </div>
    </MockWindow>
  );
}
