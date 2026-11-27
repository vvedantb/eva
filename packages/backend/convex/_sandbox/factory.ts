"use node";

import type { SandboxClient, SandboxCredentials } from "./provider";
import { createVercelClient } from "./vercelProvider";

/** Returns the sandbox client for the given credentials. */
export function getSandboxClient(
  credentials: SandboxCredentials,
): SandboxClient {
  return createVercelClient(
    {
      token: credentials.token,
      teamId: credentials.teamId,
      projectId: credentials.projectId,
    },
    credentials.vcpus,
  );
}
