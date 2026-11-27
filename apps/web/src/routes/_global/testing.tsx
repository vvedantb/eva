import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { TestingClient } from "@/lib/components/testing/TestingClient";

const searchSchema = z.object({
  welcomeSetup: z.boolean().optional(),
  changelogPreview: z.boolean().optional(),
  /** Bumped on each preview click so dialogs re-open without a full refresh. */
  previewNonce: z.number().optional(),
});

export const Route = createFileRoute("/_global/testing")({
  staticData: { title: "Testing" },
  validateSearch: searchSchema,
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/home" });
    }
  },
  component: TestingClient,
});
