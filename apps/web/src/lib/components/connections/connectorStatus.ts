export type ConnectorProviderId = "linear" | "figma";

export type ConnectorSource = "oauth" | "env" | "none";

export interface ConnectorStatus {
  provider: ConnectorProviderId;
  label: string;
  oauthConfigured: boolean;
  source: ConnectorSource;
  workspaceName: string | null;
  accountLabel: string | null;
  actor: "user" | "app" | null;
  shared: boolean;
  envKey: string | null;
  envTeamName: string | null;
}

export function statusDetail(status: ConnectorStatus): string {
  if (status.source === "oauth") {
    const who = status.accountLabel ?? "you";
    const workspace = status.workspaceName
      ? ` · ${status.workspaceName}`
      : "";
    return `Signed in as ${who}${workspace}`;
  }
  if (status.source === "env") {
    const team = status.envTeamName ?? "team";
    const key = status.envKey ?? "API key";
    return `Using ${team} ${key}`;
  }
  return "Not connected";
}
