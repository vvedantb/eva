import {
  Badge,
  Button,
  CodeBlock,
  cn,
  Progress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@eva/ui";
import { IconCheck, IconCircle } from "@tabler/icons-react";
import type { ComponentRenderProps } from "@json-render/react";
import type { ChatUiTone } from "@eva/shared/generativeUi";
import {
  BADGE_VARIANT,
  TONE_SURFACE,
  TONE_TEXT,
} from "@/lib/components/chat/generativeUi/toneStyles";

/** The leaves of a composed panel: everything that shows the agent's content. */

const TEXT_VARIANT = {
  body: "text-sm text-foreground",
  lead: "text-sm font-medium text-foreground",
  muted: "text-xs text-muted-foreground",
};

export function HeadingElement({
  element,
}: ComponentRenderProps<{ text: string; level: "h2" | "h3" }>) {
  const { text, level } = element.props;
  return (
    <p
      className={cn(
        "font-semibold text-foreground",
        level === "h2" ? "text-base" : "text-sm",
      )}
    >
      {text}
    </p>
  );
}

export function TextElement({
  element,
}: ComponentRenderProps<{
  text: string;
  variant: "body" | "lead" | "muted";
}>) {
  return (
    <p className={cn("wrap-anywhere", TEXT_VARIANT[element.props.variant])}>
      {element.props.text}
    </p>
  );
}

export function MetricElement({
  element,
}: ComponentRenderProps<{
  label: string;
  value: string;
  delta: string | null;
  tone: ChatUiTone;
}>) {
  const { label, value, delta, tone } = element.props;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-lg font-semibold tabular-nums leading-tight",
          TONE_TEXT[tone],
        )}
      >
        {value}
      </span>
      {delta ? (
        <span className="text-[11px] text-muted-foreground">{delta}</span>
      ) : null}
    </div>
  );
}

export function BadgeElement({
  element,
}: ComponentRenderProps<{ text: string; tone: ChatUiTone }>) {
  return (
    <Badge variant={BADGE_VARIANT[element.props.tone]}>
      {element.props.text}
    </Badge>
  );
}

export function CalloutElement({
  element,
}: ComponentRenderProps<{
  title: string | null;
  text: string;
  tone: ChatUiTone;
}>) {
  const { title, text, tone } = element.props;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-surface p-3",
        TONE_SURFACE[tone],
      )}
    >
      {title ? (
        <span className={cn("text-xs font-semibold", TONE_TEXT[tone])}>
          {title}
        </span>
      ) : null}
      <span className="wrap-anywhere text-sm text-foreground">{text}</span>
    </div>
  );
}

export function ProgressElement({
  element,
}: ComponentRenderProps<{ label: string | null; value: number }>) {
  const { label, value } = element.props;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label ?? "Progress"}</span>
        <span className="tabular-nums">{Math.round(value)}%</span>
      </div>
      <Progress value={value} />
    </div>
  );
}

export function ChecklistElement({
  element,
}: ComponentRenderProps<{ items: { text: string; done: boolean }[] }>) {
  return (
    <ul className="flex min-w-0 flex-col gap-1.5">
      {element.props.items.map((item, index) => (
        <li key={index} className="flex items-start gap-2 text-sm">
          {item.done ? (
            <IconCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
          ) : (
            <IconCircle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
          )}
          <span
            className={cn(
              "wrap-anywhere",
              item.done ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TableElement({
  element,
}: ComponentRenderProps<{ columns: string[]; rows: string[][] }>) {
  const { columns, rows } = element.props;
  return (
    <div className="min-w-0 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column, index) => (
              <TableHead key={index}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {columns.map((_, cellIndex) => (
                <TableCell key={cellIndex}>{row[cellIndex] ?? ""}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function KeyValueElement({
  element,
}: ComponentRenderProps<{ items: { label: string; value: string }[] }>) {
  return (
    <dl className="flex min-w-0 flex-col gap-1.5">
      {element.props.items.map((item, index) => (
        <div key={index} className="flex items-baseline justify-between gap-3">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="wrap-anywhere text-right text-sm text-foreground">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CodeElement({
  element,
}: ComponentRenderProps<{ code: string; language: string | null }>) {
  const { code, language } = element.props;
  return (
    <CodeBlock
      code={code}
      className="min-w-0"
      {...(language ? { language } : {})}
    />
  );
}

export function ImageElement({
  element,
}: ComponentRenderProps<{ url: string; alt: string | null }>) {
  const { url, alt } = element.props;
  return (
    <img
      src={url}
      alt={alt ?? ""}
      loading="lazy"
      className="max-h-80 w-full rounded-surface object-contain"
    />
  );
}

const BUTTON_VARIANT = {
  primary: "default",
  secondary: "secondary",
  ghost: "ghost",
} as const;

export function ButtonElement({
  element,
  emit,
}: ComponentRenderProps<{
  label: string;
  variant: "primary" | "secondary" | "ghost";
}>) {
  const { label, variant } = element.props;
  return (
    <Button
      type="button"
      size="sm"
      variant={BUTTON_VARIANT[variant]}
      onClick={() => emit("press")}
    >
      {label}
    </Button>
  );
}
