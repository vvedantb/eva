import { useState, useSyncExternalStore } from "react";
import { Button } from "@eva/ui";
import {
  IconChevronLeft,
  IconChevronRight,
  IconNotes,
} from "@tabler/icons-react";
import { usePresentationSync } from "./usePresentationSync";
import { PresentationDeckProvider } from "./_components/PresentationDeckContext";
import { SlideMiniPreview } from "./_components/SlideMiniPreview";
import { getSpeakerNotes } from "./speakerNotes";
import { SLIDES } from "./slides/index";
import { postPresenterMessage } from "./presenterWindowSync";

const TOTAL = SLIDES.length;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface PresenterViewProps {
  slide: number;
  session: string | undefined;
  updateSearch: (next: { slide?: number; session?: string }) => void;
}

export function PresenterView({
  slide,
  session,
  updateSearch,
}: PresenterViewProps) {
  const sync = usePresentationSync({
    slide,
    sessionCode: session,
    updateSearch,
  });

  const current = sync.effectiveSlide;
  const { slideTitle, notes } = getSpeakerNotes(current);
  const hasNotes = notes.trim().length > 0;

  const navigate = (target: number) => {
    const clamped = clamp(target, 1, TOTAL);
    sync.onNavigate(clamped);
    postPresenterMessage({ type: "slide", slide: clamped });
  };

  useSyncExternalStore(
    () => {
      postPresenterMessage({ type: "presenter-open" });
      postPresenterMessage({ type: "slide", slide: current });
      const onUnload = () => postPresenterMessage({ type: "presenter-closed" });
      window.addEventListener("beforeunload", onUnload);
      return () => {
        window.removeEventListener("beforeunload", onUnload);
        postPresenterMessage({ type: "presenter-closed" });
      };
    },
    () => "static",
    () => "static",
  );

  useSyncExternalStore(
    () => {
      postPresenterMessage({ type: "slide", slide: current });
      return () => {};
    },
    () => current,
    () => current,
  );

  useSyncExternalStore(
    () => {
      function onKey(e: KeyboardEvent) {
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;

        switch (e.key) {
          case "ArrowRight":
          case " ":
          case "PageDown":
            e.preventDefault();
            navigate(current + 1);
            break;
          case "ArrowLeft":
          case "PageUp":
            e.preventDefault();
            navigate(current - 1);
            break;
          case "Home":
            e.preventDefault();
            navigate(1);
            break;
          case "End":
            e.preventDefault();
            navigate(TOTAL);
            break;
          default:
            break;
        }
      }
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    },
    () => current,
    () => current,
  );

  const deckContext = {
    sessionCode: session,
    participantKey: sync.participantKey,
    hostKey: sync.hostKey,
  };

  return (
    <PresentationDeckProvider value={deckContext}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
          <IconNotes size={18} className="shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Presenter view
            </p>
            <p className="truncate text-sm font-medium text-foreground">
              {current}. {slideTitle}
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {current}/{TOTAL}
          </span>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-1/2 min-w-0 flex-col justify-center p-4">
            <SlideMiniPreview slideNumber={current} />
          </div>

          <div className="flex w-1/2 min-w-0 flex-col border-l border-border bg-muted/30">
            <p className="shrink-0 px-4 pb-2 pt-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Script
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {hasNotes ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {notes}
                </p>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  No script for this slide — edit{" "}
                  <span className="font-mono text-xs">speakerNotes.ts</span>.
                </p>
              )}
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/50 px-4 py-3">
          <Button
            size="sm"
            variant="secondary"
            disabled={current <= 1}
            onClick={() => navigate(current - 1)}
          >
            <IconChevronLeft size={16} />
            Back
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Arrow keys · Space to advance
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={current >= TOTAL}
            onClick={() => navigate(current + 1)}
          >
            Next
            <IconChevronRight size={16} />
          </Button>
        </footer>
      </div>
    </PresentationDeckProvider>
  );
}
