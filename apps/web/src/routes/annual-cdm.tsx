import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Deck } from "./_components/deck/Deck";
import { ANNUAL_SLIDES } from "./_components/deck/slides/annual";

const searchSchema = z.object({
  slide: z.coerce.number().int().min(1).optional().default(1),
});

/**
 * Public, chrome-less slide deck for the annual CDM. No auth guard and no app
 * shell: it is meant to be opened on a projector.
 */
export const Route = createFileRoute("/annual-cdm")({
  validateSearch: searchSchema,
  staticData: { title: "Annual CDM" },
  component: AnnualCdmPage,
});

function AnnualCdmPage() {
  const { slide } = Route.useSearch();
  const navigate = useNavigate({ from: "/annual-cdm" });

  return (
    <Deck
      slides={ANNUAL_SLIDES}
      slide={slide}
      onNavigate={(next) =>
        navigate({
          search: (prev) => ({ ...prev, slide: next }),
          replace: true,
        })
      }
    />
  );
}
