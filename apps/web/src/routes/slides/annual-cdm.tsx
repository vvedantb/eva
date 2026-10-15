import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Deck } from "../_components/deck/Deck";
import { PresenterView } from "../_components/deck/_components/PresenterView";
import { ANNUAL_SLIDES } from "../_components/deck/slides/annual";

const BASE_PATH = "/slides/annual-cdm";

const searchSchema = z.object({
  slide: z.coerce.number().int().min(1).optional().default(1),
  /** `presenter` swaps the stage for the second-screen notes view. */
  view: z.enum(["presenter"]).optional(),
  /** Set while hosting or following a live session. */
  session: z.coerce.string().optional(),
});

/**
 * Public, chrome-less slide deck for the annual CDM. No auth guard and no app
 * shell: it is meant to be opened on a projector.
 */
export const Route = createFileRoute("/slides/annual-cdm")({
  validateSearch: searchSchema,
  staticData: { title: "Annual CDM" },
  component: AnnualCdmPage,
});

function AnnualCdmPage() {
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
        slides={ANNUAL_SLIDES}
        slide={slide}
        onNavigate={onNavigate}
        basePath={BASE_PATH}
      />
    );
  }

  return (
    <Deck
      slides={ANNUAL_SLIDES}
      slide={slide}
      sessionCode={session}
      updateSearch={updateSearch}
      basePath={BASE_PATH}
    />
  );
}
