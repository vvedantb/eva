import { IconAlertTriangle, IconSparkles } from "@tabler/icons-react";
import { cn } from "@eva/ui";
import { MockChip, MockLabel, MockLine, MockWindow } from "./MockParts";

type DiffKind = "ctx" | "add" | "del";

const DIFF_LINES: readonly {
  sign: string;
  text: string;
  kind: DiffKind;
}[] = [
  {
    sign: " ",
    text: "export function isValidPostcode(raw: string) {",
    kind: "ctx",
  },
  { sign: "-", text: "  return POSTCODE.test(raw);", kind: "del" },
  {
    sign: "+",
    text: '  const value = raw.replace(/\\s+/g, "").toUpperCase();',
    kind: "add",
  },
  { sign: "+", text: "  return POSTCODE.test(value);", kind: "add" },
  { sign: " ", text: "}", kind: "ctx" },
];

const DIFF_TONE: Record<DiffKind, string> = {
  ctx: "text-muted-foreground",
  add: "bg-success/10 text-success",
  del: "bg-destructive/10 text-destructive",
};

/** Pull request view: metadata, the diff, and the recap Eva posts back. */
export function ReviewsPreview() {
  return (
    <MockWindow
      title="acme/web · pull request #142"
      trailing={
        <span className="flex items-center gap-2 font-mono text-3xs">
          <span className="text-success">+142</span>
          <span className="text-destructive">−38</span>
        </span>
      }
      bodyClassName="p-3.5"
    >
      <div className="flex items-center gap-2">
        <MockChip tone="success">Open</MockChip>
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
          Fix checkout postcode validation
        </p>
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-border">
        <div className="border-b border-border bg-muted/40 px-2.5 py-1.5">
          <p className="truncate font-mono text-[9.5px] text-muted-foreground">
            src/checkout/validate.ts
          </p>
        </div>
        <div className="divide-y divide-border/50 font-mono text-[9.5px] leading-[1.7]">
          {DIFF_LINES.map((line) => (
            <p
              key={line.text}
              className={cn("truncate px-2.5", DIFF_TONE[line.kind])}
            >
              <span className="select-none opacity-60">{line.sign} </span>
              {line.text}
            </p>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-1.5 rounded-md border border-primary/25 bg-primary/5 p-2.5">
        <div className="flex items-center gap-1.5">
          <IconSparkles size={12} className="text-primary" aria-hidden />
          <MockLabel>Eva recap · sticky comment</MockLabel>
        </div>
        <MockLine width="w-[94%]" />
        <MockLine width="w-[72%]" />
      </div>
    </MockWindow>
  );
}

const GAPS = [
  {
    title: "Guest checkout is not implemented",
    where: "Requirement 3.2",
    tone: "danger" as const,
    label: "Critical",
  },
  {
    title: "No retry on payment timeout",
    where: "Requirement 5.1",
    tone: "warning" as const,
    label: "Major",
  },
  {
    title: "Error copy differs from the spec",
    where: "Requirement 2.4",
    tone: "neutral" as const,
    label: "Minor",
  },
];

/** Testing Arena: the codebase scored against a document's requirements. */
export function ArenaPreview() {
  return (
    <MockWindow
      title="testing arena · checkout-rework.md"
      trailing={<MockChip tone="warning">3 gaps</MockChip>}
      bodyClassName="p-3.5"
    >
      <div className="flex items-center gap-3 rounded-md border border-border bg-muted/25 px-3 py-2.5">
        <p className="text-2xl font-semibold tabular-nums text-foreground">
          14<span className="text-base text-muted-foreground">/17</span>
        </p>
        <div className="min-w-0 flex-1">
          <MockLabel>Requirements met</MockLabel>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
            <span className="block h-full w-[82%] rounded-full bg-success" />
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {GAPS.map((gap) => (
          <div
            key={gap.title}
            className="flex items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-2"
          >
            <IconAlertTriangle
              size={13}
              className={cn(
                "shrink-0",
                gap.tone === "danger" ? "text-destructive" : "text-warning",
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-medium text-foreground">
                {gap.title}
              </p>
              <p className="truncate text-3xs text-muted-foreground">
                {gap.where}
              </p>
            </div>
            <MockChip tone={gap.tone}>{gap.label}</MockChip>
          </div>
        ))}
      </div>

      <p className="mt-3 text-center text-[10.5px] text-muted-foreground">
        Turn any gap into a task without leaving the page.
      </p>
    </MockWindow>
  );
}
