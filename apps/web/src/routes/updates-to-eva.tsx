import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { UpdatesDeck } from "./_components/updates/UpdatesDeck";

const searchSchema = z.object({
  slide: z.coerce.number().int().min(1).optional().default(1),
});

/**
 * Public, chrome-less slide deck covering the last three months of Eva. No auth
 * guard and no app shell: it is meant to be opened on a projector.
 */
export const Route = createFileRoute("/updates-to-eva")({
  validateSearch: searchSchema,
  staticData: { title: "Updates to Eva" },
  component: UpdatesToEvaPage,
});

function UpdatesToEvaPage() {
  const { slide } = Route.useSearch();
  const navigate = useNavigate({ from: "/updates-to-eva" });

  return (
    <UpdatesDeck
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
