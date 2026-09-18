"use client";

import {
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { cn, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { tokenizedToDisplayText } from "@/lib/components/mentions";

/** Matches t3code `TIMELINE_MINIMAP_ITEM_SPACING` — compact rail, not full-height. */
const ITEM_SPACING_PX = 8;
const MIN_VISIBLE_TICKS = 2;
/** `dvh`, not `vh` — mobile browser chrome makes `100vh` taller than the visible area. */
const MAX_HEIGHT_CSS = "calc(100dvh - 18rem)";

interface ChatJumpRailMessage {
  id: string;
  content: string;
  /** Plain-text preview of the assistant reply that follows this user turn. */
  reply?: string;
}

interface ChatJumpRailProps {
  messages: ChatJumpRailMessage[];
}

interface Tick {
  id: string;
  userText: string;
  assistantText: string | null;
}

function toPreview(content: string): string {
  return tokenizedToDisplayText(content).replace(/\s+/g, " ").trim();
}

function resolveRailHeightStyle(itemCount: number): string {
  const naturalHeight = Math.max(1, (itemCount - 1) * ITEM_SPACING_PX);
  return `min(${naturalHeight}px, ${MAX_HEIGHT_CSS})`;
}

function resolveTopPercent(index: number, itemCount: number): number {
  if (itemCount <= 1) return 0;
  return (Math.max(0, Math.min(index, itemCount - 1)) / (itemCount - 1)) * 100;
}

function resolveIndexFromPointer(input: {
  itemCount: number;
  railTop: number;
  railHeight: number;
  pointerY: number;
}): number | null {
  if (input.itemCount <= 0 || input.railHeight <= 0) return null;
  if (input.itemCount === 1) return 0;
  const progress = Math.max(
    0,
    Math.min(1, (input.pointerY - input.railTop) / input.railHeight),
  );
  return Math.max(
    0,
    Math.min(input.itemCount - 1, Math.round(progress * (input.itemCount - 1))),
  );
}

/**
 * t3code-style timeline minimap: a short, vertically-centered rail of ticks
 * (one per user message). Hover scrubbing shows a floating preview of the user
 * turn + assistant reply; click jumps to that message. Must render inside
 * `<Conversation>` (StickToBottom) so it can read the shared scroll viewport
 * and resolve `[data-message-id]` targets within it.
 */
export function ChatJumpRail({ messages }: ChatJumpRailProps) {
  const { scrollRef } = useStickToBottomContext();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [inViewIds, setInViewIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const ticks: Tick[] = messages.map((message) => {
    const userText = toPreview(message.content);
    const assistantText = message.reply ? toPreview(message.reply) : "";
    return {
      id: message.id,
      userText: userText.length > 0 ? userText : "Message",
      assistantText: assistantText.length > 0 ? assistantText : null,
    };
  });

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport || ticks.length < MIN_VISIBLE_TICKS) return;

    const targets = ticks
      .map((tick) =>
        viewport.querySelector<HTMLElement>(`[data-message-id="${tick.id}"]`),
      )
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-message-id");
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        setInViewIds(new Set(visible));
      },
      { root: viewport, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );

    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [scrollRef, ticks]);

  const scrollToTick = (id: string) => {
    const viewport = scrollRef.current;
    const target = viewport?.querySelector<HTMLElement>(
      `[data-message-id="${id}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resolveHoverIndexFromPointer = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return resolveIndexFromPointer({
      itemCount: ticks.length,
      railTop: rect.top,
      railHeight: rect.height,
      pointerY: event.clientY,
    });
  };

  const moveHoverIndex = (delta: number) => {
    setHoverIndex((current) => {
      const base = current ?? 0;
      return Math.max(0, Math.min(ticks.length - 1, base + delta));
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHoverIndex(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHoverIndex(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setHoverIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setHoverIndex(ticks.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const active = hoverIndex !== null ? (ticks[hoverIndex] ?? null) : null;
      if (active) scrollToTick(active.id);
    }
  };

  if (ticks.length < MIN_VISIBLE_TICKS) return null;

  const resolvedHoverIndex =
    hoverIndex !== null && hoverIndex < ticks.length ? hoverIndex : null;
  const activeTick =
    resolvedHoverIndex === null ? null : (ticks[resolvedHoverIndex] ?? null);
  const activeTopPercent =
    resolvedHoverIndex === null
      ? 0
      : resolveTopPercent(resolvedHoverIndex, ticks.length);
  const activeTooltipTranslate =
    resolvedHoverIndex === null
      ? "-50%"
      : resolvedHoverIndex === 0
        ? "0%"
        : resolvedHoverIndex === ticks.length - 1
          ? "-100%"
          : "-50%";

  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 z-30 hidden w-14 lg:pointer-fine:block"
      aria-label="Jump to message"
      data-testid="chat-jump-rail"
    >
      <div className="relative h-full w-full select-none">
        <button
          type="button"
          aria-label={`Jump to message: ${activeTick?.userText ?? "User message"}`}
          className="pointer-events-auto absolute top-1/2 left-2 w-10 -translate-y-1/2 cursor-pointer bg-transparent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/70"
          style={{ height: resolveRailHeightStyle(ticks.length) }}
          onBlur={() => setHoverIndex(null)}
          onFocus={() => setHoverIndex((current) => current ?? 0)}
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(event) => {
            setHoverIndex(resolveHoverIndexFromPointer(event));
          }}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={(event) => {
            const nextIndex = resolveHoverIndexFromPointer(event);
            const nextTick =
              nextIndex === null ? null : (ticks[nextIndex] ?? null);
            if (nextTick) scrollToTick(nextTick.id);
            event.currentTarget.blur();
          }}
          onKeyDown={handleKeyDown}
        >
          <div className="absolute top-0 left-3 h-full w-px bg-border/15" />
          {ticks.map((tick, index) => {
            const top = `${resolveTopPercent(index, ticks.length)}%`;
            const activeDistance =
              resolvedHoverIndex === null
                ? null
                : Math.abs(index - resolvedHoverIndex);
            const inView = inViewIds.has(tick.id);
            return (
              <span
                key={tick.id}
                aria-hidden="true"
                data-in-view={inView ? "true" : "false"}
                className={cn(
                  "pointer-events-none absolute left-0 h-0.5 -translate-y-1/2 rounded-full bg-muted-foreground/35 transition-colors data-[in-view=true]:bg-foreground/90",
                  activeDistance === 0
                    ? "w-6 bg-muted-foreground/75"
                    : activeDistance === 1
                      ? "w-4"
                      : activeDistance === 2
                        ? "w-2.5"
                        : "w-2",
                )}
                style={{ top }}
              />
            );
          })}
          <AnimatePresence>
            {activeTick ? (
              <m.span
                key={activeTick.id}
                className="pointer-events-none absolute left-8 w-80 rounded-xl bg-popover/95 p-3 text-left text-popover-foreground smooth-shadow-ring-xl shadow-black/25 backdrop-blur-sm"
                style={{
                  top: `${activeTopPercent}%`,
                  transform: `translateY(${activeTooltipTranslate})`,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={motionFast}
              >
                <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium leading-5">
                  {activeTick.userText}
                </span>
                {activeTick.assistantText ? (
                  <span className="mt-1 line-clamp-3 text-sm leading-5 text-muted-foreground">
                    {activeTick.assistantText}
                  </span>
                ) : null}
              </m.span>
            ) : null}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}
