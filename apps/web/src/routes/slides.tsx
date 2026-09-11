import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useMemo, useState, useSyncExternalStore } from "react";
import { SlideDeck } from "./_components/slides/SlideDeck";
import { usePresentationSync } from "./_components/slides/usePresentationSync";
import { PresentationControls } from "./_components/slides/_components/PresentationControls";
import { PresentationDeckProvider } from "./_components/slides/_components/PresentationDeckContext";
import { PresenterView } from "./_components/slides/PresenterView";
import {
  openPresenterWindow,
  subscribePresenterChannel,
} from "./_components/slides/presenterWindowSync";

const searchSchema = z.object({
  slide: z.number().int().min(1).optional().default(1),
  session: z.coerce.string().optional(),
  view: z.enum(["presenter"]).optional(),
});

export const Route = createFileRoute("/slides")({
  validateSearch: searchSchema,
  component: SlidesPage,
});

function SlidesPage() {
  const { slide, session, view } = Route.useSearch();
  const navigate = useNavigate({ from: "/slides" });

  const updateSearch = (next: { slide?: number; session?: string }) => {
    void navigate({
      search: (prev) => ({ ...prev, ...next }),
      replace: true,
    });
  };

  if (view === "presenter") {
    return (
      <PresenterView
        slide={slide}
        session={session}
        updateSearch={updateSearch}
      />
    );
  }

  return (
    <StageView slide={slide} session={session} updateSearch={updateSearch} />
  );
}

interface StageViewProps {
  slide: number;
  session: string | undefined;
  updateSearch: (next: { slide?: number; session?: string }) => void;
}

function StageView({ slide, session, updateSearch }: StageViewProps) {
  const [presenterDetached, setPresenterDetached] = useState(false);

  useSyncExternalStore(
    () => {
      return subscribePresenterChannel({
        onSlide: (nextSlide) => updateSearch({ slide: nextSlide }),
        onPresenterOpen: () => setPresenterDetached(true),
        onPresenterClosed: () => setPresenterDetached(false),
      });
    },
    () => presenterDetached,
    () => presenterDetached,
  );

  const sync = usePresentationSync({
    slide,
    sessionCode: session,
    updateSearch,
  });

  const deckContext = useMemo(
    () => ({
      sessionCode: session,
      participantKey: sync.participantKey,
      hostKey: sync.hostKey,
    }),
    [session, sync.participantKey, sync.hostKey],
  );

  const isFollower =
    session !== undefined &&
    sync.sessionState !== "none" &&
    sync.sessionState !== "notfound" &&
    !sync.isHost;
  const canDrive = !isFollower;
  const canOpenPresenter = session === undefined || sync.isHost;
  const stageNavigation = canDrive && !presenterDetached;

  return (
    <>
      <PresentationDeckProvider value={deckContext}>
        <SlideDeck
          slide={sync.effectiveSlide}
          onNavigate={sync.onNavigate}
          allowNavigation={stageNavigation}
          showOutline={!presenterDetached}
        />
      </PresentationDeckProvider>
      <PresentationControls
        sync={sync}
        canOpenPresenter={canOpenPresenter}
        presenterDetached={presenterDetached}
        onOpenPresenter={openPresenterWindow}
      />
    </>
  );
}
