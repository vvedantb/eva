import type { Icon } from "@tabler/icons-react";
import {
  IconCalendarRepeat,
  IconInbox,
  IconMail,
  IconPencil,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { buildAutomationEmailHtml } from "@eva/backend";
import { cn } from "@eva/ui";
import {
  Accent,
  BRAND,
  Footnote,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  DUR,
  EASE,
  Pulse,
  Spotlight,
  cueTransition,
} from "../../_components/motion";
import { Fri2Chip } from "../_parts/Fri2Chip";

const OPEN = 1;
const FACTS = 2;

const W = 1088;
const H = 420;
const INBOX_W = 400;
const MAIL_X = INBOX_W + 36;
const MAIL_W = W - MAIL_X;
/** The template is 560px wide plus its grey margin; shown at this scale. */
const EMAIL_SCALE = 0.95;
const EMAIL_FRAME_W = Math.round(MAIL_W / EMAIL_SCALE);
const EMAIL_FRAME_H = 1100;
const MAIL_BODY_H = H - 44;

/**
 * Example content in the shape the real runs use: emoji section headings and
 * plain-English bullets. Written for the slide; not a real edition.
 */
const EXAMPLE_HTML = `
<p><strong>✨ New Features</strong></p>
<ul>
  <li>Drag a quick task to Code Review and Eva now merges and deploys it for you.</li>
  <li>Eva checks your task description and suggests what is missing before it starts.</li>
  <li>A new Artifacts page collects every report and mockup agents have made.</li>
</ul>
<p><strong>⚡ Faster &amp; Smoother</strong></p>
<ul>
  <li>Workspaces now start in under a second.</li>
  <li>Simple view hides more technical controls, so the screen is easier to read.</li>
</ul>
<p><strong>🐛 Fixed</strong></p>
<ul>
  <li>Exports now show the right date in every time zone.</li>
  <li>Long chats no longer jump to the top when a reply arrives.</li>
</ul>
`;

/** Monday 12 October 2026, 03:00 UTC: when the latest run published. */
const PUBLISHED_AT = Date.UTC(2026, 9, 12, 3, 0);

/** The real template, built once with the example body. */
const EMAIL_HTML = buildAutomationEmailHtml({
  appUrl: "",
  contentHtml: EXAMPLE_HTML,
  publishedAt: PUBLISHED_AT,
  heading: "Eva Weekly Changelog",
});

interface InboxRow {
  subject: string;
  preview: string;
  time: string;
}

/** Older mail already in the inbox. The new edition lands above these. */
const OLDER: readonly InboxRow[] = [
  {
    subject: "Daily summary",
    preview: "You have 3 unread notifications",
    time: "Sun",
  },
  {
    subject: "Your task is ready for review",
    preview: "Fix the date on exports",
    time: "Fri",
  },
  {
    subject: "Eva Weekly Changelog",
    preview: "✨ New Features: each chat can hold several…",
    time: "5 Oct",
  },
];

interface Fact {
  icon: Icon;
  label: string;
}

const FACTS_LIST: readonly Fact[] = [
  { icon: IconCalendarRepeat, label: "Every Monday morning, by itself" },
  { icon: IconPencil, label: "Written by Eva from what shipped" },
  { icon: IconMail, label: "35 editions since 11 April 2026" },
];

const SHOTS: readonly CameraShot[] = [
  { rotateY: 8, translateZ: -20, x: 80 },
  { rotateY: -4, translateZ: 10, x: -20 },
  { rotateY: -2, translateZ: -30, y: -10 },
];

const GLOW = [
  { x: INBOX_W / 2, y: 120, size: 480 },
  { x: MAIL_X + MAIL_W / 2, y: H / 2, size: 680 },
  { x: W / 2, y: H / 2, size: 900 },
];

function Row({
  row,
  fresh = false,
  open = false,
}: {
  row: InboxRow;
  fresh?: boolean;
  open?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-[68px] items-center gap-3 rounded-xl px-3",
        open ? "bg-primary/15" : "bg-transparent",
      )}
    >
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
        <img src="/icon.png" alt="" className="size-6 rounded-md" />
        {fresh && !open ? (
          <span className="absolute -top-0.5 -right-0.5">
            <Pulse color={BRAND.blue} size={8} />
          </span>
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              fresh
                ? "font-semibold text-foreground"
                : "font-medium text-foreground/70",
            )}
          >
            {row.subject}
          </span>
          <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
            {row.time}
          </span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {row.preview}
        </div>
      </div>
    </div>
  );
}

function Inbox() {
  const step = useDeckStep();
  const open = step >= OPEN;

  return (
    <div
      className="dark absolute top-0 left-0 overflow-hidden rounded-2xl bg-background ring-1 ring-white/10"
      style={{ width: INBOX_W, height: H }}
    >
      <div className="flex h-11 items-center gap-2 border-b border-border/60 px-4">
        <IconInbox size={16} className="text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Inbox</span>
      </div>
      <div className="flex flex-col gap-1 p-2">
        {/* The new edition drops in at the top on arrival. */}
        <m.div
          initial={{ opacity: 0, y: -24, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 68 }}
          transition={{ duration: DUR.hero, ease: EASE.expo, delay: 0.9 }}
        >
          <Row
            row={{
              subject: "Eva Weekly Changelog",
              preview: "✨ New Features: drag a quick task to Code Review…",
              time: "Mon 03:00",
            }}
            fresh
            open={open}
          />
        </m.div>
        {OLDER.map((row) => (
          <Row key={row.preview} row={row} />
        ))}
      </div>
    </div>
  );
}

/** The real template in a mail window. It scrolls slowly once opened. */
function Email() {
  const step = useDeckStep();
  const open = step >= OPEN;
  const reading = step === OPEN;

  return (
    <m.div
      className="dark absolute top-0 overflow-hidden rounded-2xl bg-background ring-1 ring-white/10"
      style={{ left: MAIL_X, width: MAIL_W, height: H }}
      initial={{ opacity: 0.35, scale: 0.97 }}
      animate={{ opacity: open ? 1 : 0.35, scale: open ? 1 : 0.97 }}
      transition={{ duration: DUR.slow, ease: EASE.out }}
    >
      <div className="flex h-11 items-center gap-3 border-b border-border/60 px-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Eva Weekly Changelog
        </span>
        <span className="ml-auto">Eva</span>
      </div>
      <div className="relative overflow-hidden" style={{ height: MAIL_BODY_H }}>
        <m.div
          className="origin-top-left"
          style={{ scale: EMAIL_SCALE }}
          initial={{ opacity: 0, y: 0 }}
          animate={{
            opacity: open ? 1 : 0,
            y: reading
              ? -(EMAIL_FRAME_H * EMAIL_SCALE - MAIL_BODY_H) * 0.42
              : 0,
          }}
          transition={
            reading
              ? {
                  opacity: { duration: DUR.slow, delay: 0.2 },
                  y: { duration: 7, ease: EASE.inOut, delay: 1.4 },
                }
              : { duration: DUR.slow, ease: EASE.out }
          }
        >
          <iframe
            title="Eva Weekly Changelog email"
            srcDoc={EMAIL_HTML}
            sandbox=""
            tabIndex={-1}
            className="pointer-events-none block border-0"
            style={{ width: EMAIL_FRAME_W, height: EMAIL_FRAME_H }}
          />
        </m.div>
      </div>
    </m.div>
  );
}

function Facts() {
  const shown = useDeckStep() >= FACTS;
  return (
    <m.div
      className="mt-6 flex justify-center gap-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: shown ? 1 : 0 }}
      transition={cueTransition(shown, 0.15, { duration: DUR.base })}
    >
      {FACTS_LIST.map((fact, index) => (
        <Fri2Chip
          key={fact.label}
          icon={fact.icon}
          label={fact.label}
          lit={shown}
          index={index}
          delay={0.3 + index * 0.12}
        />
      ))}
    </m.div>
  );
}

export function FridayWeeklyChangelog() {
  return (
    <Shell className="py-14">
      <Title size="md">
        Every Monday, the week in <Accent>plain English</Accent>.
      </Title>

      <Camera shots={SHOTS} className="mt-6">
        <div className="relative isolate" style={{ width: W, height: H }}>
          <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />
          <Inbox />
          <Email />
        </div>
      </Camera>

      <Facts />

      <Footnote>
        Real changelog email template, example text. Editions: successful runs,
        11 April to 12 October 2026 (Eva records).
      </Footnote>
    </Shell>
  );
}
