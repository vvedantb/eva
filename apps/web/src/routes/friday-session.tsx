import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Deck } from "./_components/deck/Deck";
import { FRIDAY_SLIDES } from "./_components/deck/slides/friday";

const searchSchema = z.object({
  slide: z.coerce.number().int().min(1).optional().default(1),
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
  const { slide } = Route.useSearch();
  const navigate = useNavigate({ from: "/friday-session" });

  return (
    <Deck
      slides={FRIDAY_SLIDES}
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
