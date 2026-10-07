"use node";

/**
 * Provider factory: turns resolved {@link SandboxCredentials} into a concrete
 * {@link SandboxClient}. Vercel is the only backend — this file stays as the
 * single indirection point so a future provider swap does not require
 * touching every consumer of the neutral contract in ./provider.ts.
 *
 * Credentials come from `resolveSandboxCredentials` in ../envVarResolver.ts.
 */

import type { SandboxClient, SandboxCredentials } from "./provider";
import { createVercelClient } from "./vercelProvider";

/** Returns the sandbox client for the given credentials. */
export function getSandboxClient(
  credentials: SandboxCredentials,
): SandboxClient {
  return createVercelClient({
    token: credentials.token,
    teamId: credentials.teamId,
    projectId: credentials.projectId,
  });
}
