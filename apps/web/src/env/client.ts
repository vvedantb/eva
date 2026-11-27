import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const clientEnv = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_CONVEX_URL: z.string().min(1),
    VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    // Opt-in, so an instance that sets nothing gets the compact page. A plain
    // boolean would be wrong here: every Vite env value arrives as a string,
    // and `Boolean("false")` is `true`.
    VITE_NEW_LANDING: z.enum(["true", "false"]).optional(),
  },
  runtimeEnv: import.meta.env,
});

/**
 * Whether the public marketing page renders in full.
 *
 * Off by default. The full page is a long scroll with sixteen animated feature
 * previews; the compact page says the same thing in one screen and is what a
 * self-hosted instance gets unless it asks otherwise.
 */
export const newLandingEnabled = clientEnv.VITE_NEW_LANDING === "true";
