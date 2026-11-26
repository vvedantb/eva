import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
} from "@tabler/icons-react";
import type { ReactNode } from "react";

const TERMINAL_KEYS: ReadonlyArray<{
  label: ReactNode;
  name: string;
  data: string;
}> = [
  { label: "esc", name: "Escape", data: "\x1b" },
  { label: "tab", name: "Tab", data: "\t" },
  { label: "^C", name: "Control C, interrupt", data: "\x03" },
  { label: "^D", name: "Control D, end of input", data: "\x04" },
  { label: "^Z", name: "Control Z, suspend", data: "\x1a" },
  { label: <IconArrowUp className="size-4" />, name: "Up", data: "\x1b[A" },
  { label: <IconArrowDown className="size-4" />, name: "Down", data: "\x1b[B" },
  { label: <IconArrowLeft className="size-4" />, name: "Left", data: "\x1b[D" },
  {
    label: <IconArrowRight className="size-4" />,
    name: "Right",
    data: "\x1b[C",
  },
];

/**
 * Gated on pointer type rather than width: what decides whether the row is
 * needed is a soft keyboard, not a narrow viewport. A coarse pointer means no
 * physical keyboard to send these from, and a tablet needs the row at any width;
 * a mouse-and-keyboard desktop never sees it, so it never eats terminal rows.
 */
export function TerminalKeyRow({ onKey }: { onKey: (data: string) => void }) {
  return (
    <div
      role="group"
      aria-label="Terminal keys"
      className="hidden shrink-0 items-center gap-1 overflow-x-auto border-t border-border bg-card px-2 py-1.5 scrollbar-none pointer-coarse:flex"
    >
      {TERMINAL_KEYS.map((key) => (
        <button
          key={key.name}
          type="button"
          aria-label={key.name}
          onPointerDown={(event) => {
            event.preventDefault();
            onKey(key.data);
          }}
          className="motion-press flex h-9 min-w-9 shrink-0 items-center justify-center rounded-md bg-muted px-2 font-mono text-xs text-muted-foreground active:scale-[0.96] active:bg-secondary"
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}
