import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Deck } from "../_components/deck/Deck";
import { PresenterView } from "../_components/deck/_components/PresenterView";
import { FRIDAY_SLIDES } from "../_components/deck/slides/friday";

const BASE_PATH = "/slides/friday-session";

const searchSchema = z.object({
  slide: z.coerce.number().int().min(1).optional().default(1),
  /** `presenter` swaps the stage for the second-screen notes view. */
  view: z.enum(["presenter"]).optional(),
  /** Set while hosting or following a live session. */
  session: z.coerce.string().optional(),
});

/**
 * Public, chrome-less slide deck covering the last three months of Eva. No auth
 * guard and no app shell: it is meant to be opened on a projector.
 */
export const Route = createFileRoute("/slides/friday-session")({
  validateSearch: searchSchema,
  staticData: { title: "Friday session" },
  component: FridaySessionPage,
});

function FridaySessionPage() {
  const { slide, view, session } = Route.useSearch();
  const navigate = useNavigate({ from: BASE_PATH });

  const updateSearch = (next: {
    slide?: number;
    session?: string | undefined;
  }) =>
    navigate({
      search: (prev) => ({ ...prev, ...next }),
      replace: true,
    });
  const onNavigate = (next: number) => updateSearch({ slide: next });

  if (view === "presenter") {
    return (
      <PresenterView
        slides={FRIDAY_SLIDES}
        slide={slide}
        onNavigate={onNavigate}
        basePath={BASE_PATH}
      />
    );
  }

  return (
    <Deck
      slides={FRIDAY_SLIDES}
      slide={slide}
      sessionCode={session}
      updateSearch={updateSearch}
      basePath={BASE_PATH}
    />
  );
}
