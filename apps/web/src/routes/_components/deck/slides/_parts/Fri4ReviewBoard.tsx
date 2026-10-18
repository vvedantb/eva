import { IconLayoutKanban, IconPointerFilled } from "@tabler/icons-react";
import { m } from "motion/react";
import { Badge, BorderBeam, ListRow, cn } from "@eva/ui";
import { EntityNumLabel } from "@/lib/components/ui/EntityNumLabel";
import {
  statusConfig,
  type TaskStatus,
} from "@/lib/components/tasks/TaskStatusBadge";
import { useAppScheme, useDeckStep } from "../../_components/DeckPrimitives";
import { DUR, EASE } from "../../_components/motion";

/**
 * The quick-task board, drawn with the app's own row, badge and status tokens.
 * The real `QuickTasksKanbanBoard` needs a Convex repo and drag sensors, so the
 * columns are static and only the one task moves.
 */

export const BOARD_W = 624;
const TOOLBAR_H = 44;
const PAD = 12;
const COL_GAP = 12;
const COL_W = (BOARD_W - PAD * 2 - COL_GAP * 2) / 3;
const COL_HEADER_H = 40;
const COL_INSET = 6;
const CARD_H = 68;
const CARD_GAP = 8;
export const BOARD_H = TOOLBAR_H + PAD * 2 + 296;

/** When the cursor lands on the card, and how long the drag takes. */
const GRAB_AT = 0.5;
const DRAG = 0.95;
export const DROP_AT = GRAB_AT + DRAG;
/** The Grok bot merges, and the card moves itself, this long into step 2. */
export const MERGE_AT = 2.1;

interface Column {
  status: TaskStatus;
  cards: readonly { numId: number; title: string }[];
}

/** Left to right. The moving task is drawn on top, not listed here. */
const COLUMNS: readonly Column[] = [
  {
    status: "in_progress",
    cards: [{ numId: 409, title: "Tidy the settings copy" }],
  },
  {
    status: "code_review",
    cards: [{ numId: 405, title: "Fix the date on exports" }],
  },
  {
    status: "done",
    cards: [
      { numId: 398, title: "Faster sidebar load" },
      { numId: 402, title: "Jev picks reactions" },
    ],
  },
];

const HERO = { numId: 412, title: "Add export to reports" };

/** Pixel position of a card's top-left inside the board, by column. */
function slotX(column: number) {
  return PAD + column * (COL_W + COL_GAP) + COL_INSET;
}
const SLOT_Y = TOOLBAR_H + PAD + COL_HEADER_H;
const CARD_W = COL_W - COL_INSET * 2;

/** Where the hero card's grab point sits, in board pixels, for the connector. */
export const DROP_POINT = {
  x: slotX(1) + CARD_W,
  y: SLOT_Y + CARD_H / 2,
};

function heroColumn(step: number) {
  if (step >= 2) return 2;
  if (step >= 1) return 1;
  return 0;
}

function TaskRow({
  numId,
  title,
  status,
  className,
}: {
  numId: number;
  title: string;
  status: TaskStatus;
  className?: string;
}) {
  return (
    <ListRow
      accentClassName={statusConfig[status].bar}
      contentClassName="flex flex-col gap-1.5 px-3 py-2.5 pl-3.5"
      className={cn("h-[68px]", className)}
    >
      <div className="flex min-w-0 items-baseline gap-1.5">
        <EntityNumLabel numId={numId} />
        <span className="min-w-0 flex-1 truncate text-2sm leading-5 font-medium tracking-[-0.01em] text-foreground">
          {title}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="size-4 rounded-full bg-muted" />
        <span className="h-1.5 w-12 rounded-full bg-muted" />
      </div>
    </ListRow>
  );
}

function ColumnHeader({
  status,
  count,
}: {
  status: TaskStatus;
  count: number;
}) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <div className="flex h-10 items-center p-2">
      <Badge
        variant="outline"
        className={`${config.bg} ${config.text} gap-1.5 py-1`}
      >
        <Icon size={14} className={config.text} />
        {config.label}
        <m.span
          key={count}
          className="text-foreground/50 tabular-nums"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.base, ease: EASE.out }}
        >
          {count}
        </m.span>
      </Badge>
    </div>
  );
}

/** Follows the card from grab to drop on step 1 only. */
function Cursor({ dragging }: { dragging: boolean }) {
  const grab = { x: slotX(0) + CARD_W * 0.62, y: SLOT_Y + CARD_H * 0.55 };
  const drop = { x: slotX(1) + CARD_W * 0.62, y: SLOT_Y + CARD_H * 0.55 };
  return (
    <m.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-20 text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
      initial={{ opacity: 0, x: grab.x + 120, y: grab.y + 110 }}
      animate={
        dragging
          ? {
              opacity: [0, 1, 1, 1, 0],
              x: [grab.x + 120, grab.x, grab.x, drop.x, drop.x],
              y: [grab.y + 110, grab.y, grab.y, drop.y, drop.y + 6],
              scale: [1, 1, 0.86, 0.86, 1],
            }
          : { opacity: 0, x: grab.x + 120, y: grab.y + 110, scale: 1 }
      }
      transition={
        dragging
          ? {
              duration: DROP_AT + 0.5,
              ease: EASE.inOut,
              times: [
                0,
                GRAB_AT / (DROP_AT + 0.5),
                (GRAB_AT + 0.12) / (DROP_AT + 0.5),
                DROP_AT / (DROP_AT + 0.5),
                1,
              ],
            }
          : { duration: DUR.fast }
      }
    >
      <IconPointerFilled size={26} />
    </m.div>
  );
}

/** The one task that moves: dragged into review, then merged by the bot. */
function HeroCard() {
  const step = useDeckStep();
  const column = heroColumn(step);
  const status = COLUMNS[column]?.status ?? "in_progress";
  const dragged = step === 1;
  const merged = step >= 2;

  const travel = dragged
    ? { duration: DRAG, ease: EASE.inOut, delay: GRAB_AT + 0.12 }
    : merged
      ? { duration: 0.8, ease: EASE.inOut, delay: MERGE_AT }
      : { duration: DUR.fast };
  const lift = dragged
    ? {
        scale: [1, 1.05, 1.05, 1],
        rotate: [0, -2.5, -2.5, 0],
        boxShadow: [
          "0 0 0 rgba(0,0,0,0)",
          "0 24px 48px rgba(0,0,0,0.55)",
          "0 24px 48px rgba(0,0,0,0.55)",
          "0 0 0 rgba(0,0,0,0)",
        ],
      }
    : { scale: 1, rotate: 0, boxShadow: "0 0 0 rgba(0,0,0,0)" };

  const row = <TaskRow numId={HERO.numId} title={HERO.title} status={status} />;

  return (
    <m.div
      className="absolute top-0 left-0 z-10 rounded-surface"
      style={{ width: CARD_W }}
      initial={false}
      animate={{ x: slotX(column), y: SLOT_Y, ...lift }}
      transition={{
        x: travel,
        y: travel,
        scale: dragged
          ? { duration: DRAG + 0.24, times: [0, 0.12, 0.88, 1], delay: GRAB_AT }
          : { duration: DUR.fast },
        rotate: dragged
          ? { duration: DRAG + 0.24, times: [0, 0.12, 0.88, 1], delay: GRAB_AT }
          : { duration: DUR.fast },
        boxShadow: dragged
          ? { duration: DRAG + 0.24, times: [0, 0.12, 0.88, 1], delay: GRAB_AT }
          : { duration: DUR.fast },
      }}
    >
      {column === 0 ? (
        <BorderBeam active colorVariant="progress" className="rounded-surface">
          {row}
        </BorderBeam>
      ) : (
        row
      )}
    </m.div>
  );
}

/** Where the moving task will land: a dashed slot while it is in flight. */
function DropSlot({ column }: { column: number }) {
  const step = useDeckStep();
  const target = heroColumn(step) === column;
  const travelling =
    (step === 1 && column === 1) || (step >= 2 && column === 2);
  return (
    <m.div
      aria-hidden
      className="rounded-surface border border-dashed border-foreground/20"
      style={{ height: CARD_H }}
      initial={false}
      animate={{ opacity: target && travelling ? [0, 1, 1, 0] : 0 }}
      transition={
        target && travelling
          ? {
              duration: 1.4,
              times: [0, 0.2, 0.8, 1],
              delay: step === 1 ? GRAB_AT : MERGE_AT - 0.4,
            }
          : { duration: DUR.fast }
      }
    />
  );
}

export function Fri4ReviewBoard() {
  const appScheme = useAppScheme();
  const step = useDeckStep();
  const column = heroColumn(step);

  return (
    <div
      className={cn(
        appScheme,
        "relative overflow-hidden rounded-2xl bg-background ring-1 ring-white/10",
      )}
      style={{ width: BOARD_W, height: BOARD_H }}
    >
      <div
        className="flex items-center gap-2 border-b border-border/60 px-4"
        style={{ height: TOOLBAR_H }}
      >
        <IconLayoutKanban size={16} className="text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Quick tasks</span>
        <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-2xs text-muted-foreground">
          vvedantb/eva
        </span>
      </div>

      <div className="flex" style={{ padding: PAD, gap: COL_GAP }}>
        {COLUMNS.map((col, index) => (
          <div
            key={col.status}
            className="flex flex-col overflow-clip rounded-surface bg-muted/40"
            style={{ width: COL_W, height: 296 }}
          >
            <ColumnHeader
              status={col.status}
              count={col.cards.length + (column === index ? 1 : 0)}
            />
            <div
              className="flex flex-col"
              style={{ padding: `0 ${COL_INSET}px`, gap: CARD_GAP }}
            >
              <DropSlot column={index} />
              {col.cards.map((card) => (
                <TaskRow
                  key={card.numId}
                  numId={card.numId}
                  title={card.title}
                  status={col.status}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <HeroCard />
      <Cursor dragging={step === 1} />
    </div>
  );
}
