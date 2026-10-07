import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, CONNECTOR_ENV_KEYS } from "@eva/backend";
import type { ConnectorStatus } from "./connectorStatus";

function envHit(
  vars: ReadonlyArray<{ key: string }> | undefined,
  keys: readonly string[],
): string | null {
  if (!vars) return null;
  return vars.find((entry) => keys.includes(entry.key))?.key ?? null;
}

/**
 * Env-key fallback built from existing team env queries so the page still
 * renders before the new `connectedAccounts` functions are deployed.
 */
export function useEnvConnectorStatuses(): ConnectorStatus[] | undefined {
  const teams = useQuery(api.teams.list);
  const first = teams?.[0];
  const second = teams?.[1];
  const firstVars = useQuery(
    api.teamEnvVars.list,
    first ? { teamId: first._id } : "skip",
  );
  const secondVars = useQuery(
    api.teamEnvVars.list,
    second ? { teamId: second._id } : "skip",
  );

  if (teams === undefined) return undefined;

  const rows: Array<{
    teamName: string;
    vars: ReadonlyArray<{ key: string }> | undefined;
  }> = [
    { teamName: first?.displayName ?? first?.name ?? "Team", vars: firstVars },
    { teamName: second?.displayName ?? second?.name ?? "Team", vars: secondVars },
  ];

  return (["linear", "figma"] as const).map((provider) => {
    const keys = CONNECTOR_ENV_KEYS[provider];
    let envKey: string | null = null;
    let envTeamName: string | null = null;
    for (const row of rows) {
      const hit = envHit(row.vars, keys);
      if (hit) {
        envKey = hit;
        envTeamName = row.teamName;
        break;
      }
    }
    return {
      provider,
      label: provider === "linear" ? "Linear" : "Figma",
      oauthConfigured: false,
      source: envKey ? "env" : "none",
      workspaceName: null,
      accountLabel: null,
      actor: null,
      shared: false,
      envKey,
      envTeamName,
    } satisfies ConnectorStatus;
  });
}
