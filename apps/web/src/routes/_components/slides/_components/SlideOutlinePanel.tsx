import { useRef, useState, useSyncExternalStore } from "react";
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpandFilled,
} from "@tabler/icons-react";
import { cn } from "@eva/ui";
import { SLIDES } from "../slides/index";

interface SlideOutlinePanelProps {
  slide: number;
  onNavigate: (slide: number) => void;
  hidden?: boolean;
}

export function SlideOutlinePanel({
  slide,
  onNavigate,
  hidden = false,
}: SlideOutlinePanelProps) {
  const [open, setOpen] = useState(true);
  const activeRef = useRef<HTMLButtonElement>(null);

  useSyncExternalStore(
    () => {
      if (!open || hidden) return () => {};
      const id = requestAnimationFrame(() => {
        activeRef.current?.scrollIntoView({ block: "nearest" });
      });
      return () => cancelAnimationFrame(id);
    },
    () => `${slide}-${open}-${hidden}`,
    () => `${slide}-${open}-${hidden}`,
  );

  if (hidden) return null;

  if (!open) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center bg-background py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-[background-color] hover:bg-secondary hover:text-foreground"
          aria-label="Show slide list"
        >
          <IconLayoutSidebarLeftExpandFilled size={18} stroke={1.5} />
        </button>
      </div>
    );
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-background lg:w-60">
      <div className="flex items-center justify-between px-3 py-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Slides
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-[background-color] hover:bg-secondary hover:text-foreground"
          aria-label="Hide slide list"
        >
          <IconLayoutSidebarLeftCollapse size={17} stroke={1.5} />
        </button>
      </div>

      <nav
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-4"
        aria-label="Slide outline"
      >
        <ul className="space-y-1">
          {SLIDES.map((entry, i) => {
            const slideNumber = i + 1;
            const isActive = slideNumber === slide;

            return (
              <li key={entry.id}>
                <button
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  onClick={() => onNavigate(slideNumber)}
                  className={cn(
                    "flex w-full gap-2.5 rounded-xl px-2 py-2 text-left transition-[background-color]",
                    isActive ? "bg-secondary" : "hover:bg-secondary/50",
                  )}
                >
                  <span
                    className={cn(
                      "relative flex aspect-video w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-lg",
                      entry.theme === "dark"
                        ? "bg-zinc-800 text-zinc-100"
                        : "bg-secondary text-foreground",
                    )}
                  >
                    <span className="font-mono text-[10px] tabular-nums opacity-60">
                      {slideNumber}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 py-0.5">
                    <span
                      className={cn(
                        "block truncate text-xs font-medium",
                        isActive ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {entry.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-muted-foreground/70">
                      {entry.id}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
