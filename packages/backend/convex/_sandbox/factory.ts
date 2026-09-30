"use node";

/**
 * Provider factory: turns resolved {@link SandboxCredentials} into one
 * {@link SandboxClient} that routes every call to the provider that owns it.
 *
 * - `create` goes to the repo's preferred provider (`githubRepos.sandboxProvider`).
 * - `get` / `getSnapshot` / `deleteSnapshot` go by the id: Boat ids are `bx_…`,
 *   everything else is Vercel. A repo that switched provider therefore keeps
 *   reaching the sandboxes and snapshots it created before the switch, with no
 *   provider column on the eight tables that store a `sandboxId`.
 *
 * Credentials come from `resolveSandboxCredentials` in ../envVarResolver.ts.
 */

import { providerForId } from "./boatApi";
import { createBoatClient } from "./boatProvider";
import type {
  SandboxClient,
  SandboxCreateParams,
  SandboxCredentials,
  SandboxHandle,
  SandboxProviderKind,
  SandboxSnapshotInfo,
} from "./provider";
import { createVercelClient } from "./vercelProvider";

class RoutingSandboxClient implements SandboxClient {
  readonly kind: SandboxProviderKind;
  private readonly clients: Partial<Record<SandboxProviderKind, SandboxClient>>;

  constructor(credentials: SandboxCredentials) {
    this.kind = credentials.preferred;
    this.clients = {
      ...(credentials.vercel
        ? { vercel: createVercelClient(credentials.vercel) }
        : {}),
      ...(credentials.boat ? { boat: createBoatClient(credentials.boat) } : {}),
    };
  }

  private client(kind: SandboxProviderKind, forId?: string): SandboxClient {
    const client = this.clients[kind];
    if (client) return client;
    const key =
      kind === "boat"
        ? "BOAT_API_KEY"
        : "VERCEL_TOKEN / VERCEL_TEAM_ID / VERCEL_PROJECT_ID";
    throw new Error(
      `${forId ? `${forId} is a ${kind} sandbox, but ` : ""}${kind} credentials are not configured for this repo (${key}).`,
    );
  }

  async create(params: SandboxCreateParams): Promise<SandboxHandle> {
    return await this.client(this.kind).create(params);
  }

  async get(sandboxId: string): Promise<SandboxHandle> {
    return await this.client(providerForId(sandboxId), sandboxId).get(
      sandboxId,
    );
  }

  async getSnapshot(ref: string): Promise<SandboxSnapshotInfo | null> {
    return await this.client(providerForId(ref), ref).getSnapshot(ref);
  }

  async deleteSnapshot(ref: string): Promise<boolean> {
    return await this.client(providerForId(ref), ref).deleteSnapshot(ref);
  }
}

/** Returns the sandbox client for the given credentials. */
export function getSandboxClient(
  credentials: SandboxCredentials,
): SandboxClient {
  return new RoutingSandboxClient(credentials);
}
