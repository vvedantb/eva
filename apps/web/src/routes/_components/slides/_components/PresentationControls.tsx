import { useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Button, cn } from "@eva/ui";
import {
  IconShare2,
  IconLoader2,
  IconEye,
  IconArrowBackUp,
  IconNotes,
} from "@tabler/icons-react";
import type { PresentationSync } from "../usePresentationSync";
import { PresentationHostBar } from "./PresentationHostBar";

interface PresentationControlsProps {
  sync: PresentationSync;
  canOpenPresenter?: boolean;
  presenterDetached?: boolean;
  onOpenPresenter?: () => void;
}

const PILL =
  "inline-flex items-center gap-2 rounded-full bg-card px-3.5 py-2 text-sm text-card-foreground shadow-lg backdrop-blur";

export function PresentationControls({
  sync,
  canOpenPresenter = false,
  presenterDetached = false,
  onOpenPresenter,
}: PresentationControlsProps) {
  const [revealed, setRevealed] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useSyncExternalStore(
    () => {
      let timer: number | undefined;
      const show = () => {
        setRevealed(true);
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => setRevealed(false), 3000);
      };
      show();
      window.addEventListener("mousemove", show);
      window.addEventListener("keydown", show);
      return () => {
        window.removeEventListener("mousemove", show);
        window.removeEventListener("keydown", show);
        if (timer) window.clearTimeout(timer);
      };
    },
    () => revealed,
    () => revealed,
  );

  const visible = revealed || menuOpen;
  const { sessionState, isHost, mode } = sync;

  let body: ReactNode;
  if (sessionState === "none") {
    body = (
      <Button
        size="sm"
        variant="secondary"
        className="shadow-lg"
        onClick={() => void sync.startSharing()}
        disabled={sync.isStarting}
      >
        {sync.isStarting ? (
          <IconLoader2 size={15} className="animate-spin" />
        ) : (
          <IconShare2 size={15} />
        )}
        Share
      </Button>
    );
  } else if (isHost) {
    body = <PresentationHostBar sync={sync} onOpenChange={setMenuOpen} />;
  } else if (sessionState === "ended") {
    body = <div className={PILL}>Presentation ended</div>;
  } else if (sessionState === "notfound") {
    body = <div className={PILL}>Presentation not found</div>;
  } else if (sessionState === "loading") {
    body = <div className={cn(PILL, "text-muted-foreground")}>Connecting…</div>;
  } else if (mode === "private") {
    body = (
      <div className="inline-flex items-center gap-2 rounded-full bg-card py-1 pl-3.5 pr-1 text-sm text-card-foreground shadow-lg backdrop-blur">
        <span>Viewing on your own</span>
        <Button size="sm" variant="secondary" onClick={sync.backToLive}>
          <IconArrowBackUp size={15} /> Back to live
        </Button>
      </div>
    );
  } else {
    body = (
      <div className={PILL}>
        <IconEye size={15} className="text-muted-foreground" />
        Following · live
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-start justify-end gap-2 p-4">
      {canOpenPresenter && !presenterDetached && onOpenPresenter ? (
        <div
          className={cn(
            "transition-opacity duration-300",
            visible ? "pointer-events-auto opacity-100" : "opacity-0",
          )}
        >
          <Button
            size="sm"
            variant="secondary"
            className="shadow-lg"
            onClick={onOpenPresenter}
          >
            <IconNotes size={15} />
            Presenter view
          </Button>
        </div>
      ) : null}
      <div
        className={cn(
          "transition-opacity duration-300",
          visible ? "pointer-events-auto opacity-100" : "opacity-0",
        )}
      >
        {body}
      </div>
    </div>
  );
}
