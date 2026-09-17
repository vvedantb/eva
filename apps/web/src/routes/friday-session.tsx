import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Deck } from "./_components/deck/Deck";
import { PresenterView } from "./_components/deck/_components/PresenterView";
import { FRIDAY_SLIDES } from "./_components/deck/slides/friday";

const BASE_PATH = "/friday-session";

const searchSchema = z.object({
  slide: z.coerce.number().int().min(1).optional().default(1),
  /** `presenter` swaps the stage for the second-screen notes view. */
  view: z.enum(["presenter"]).optional(),
});

/**
 * Public, chrome-less slide deck covering the last three months of Eva. No auth
 * guard and no app shell: it is meant to be opened on a projector.
 */
export const Route = createFileRoute("/friday-session")({
  validateSearch: searchSchema,
  staticData: { title: "Friday session" },
  component: FridaySessionPage,
});

function FridaySessionPage() {
  const { slide, view } = Route.useSearch();
  const navigate = useNavigate({ from: BASE_PATH });

  const onNavigate = (next: number) =>
    navigate({
      search: (prev) => ({ ...prev, slide: next }),
      replace: true,
    });

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
      onNavigate={onNavigate}
      basePath={BASE_PATH}
    />
  );
}
