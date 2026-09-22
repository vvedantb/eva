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
      onNavigate={onNavigate}
      basePath={BASE_PATH}
    />
  );
}
