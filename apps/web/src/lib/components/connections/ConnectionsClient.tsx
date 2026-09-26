"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction, useMutation } from "convex/react";
import { api } from "@eva/backend";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { QueryErrorBoundary } from "@/lib/components/QueryErrorBoundary";
import { Badge, Button, Spinner, Switch, toast } from "@eva/ui";
import { FigmaLogo, LinearLogo } from "@/lib/components/ui/providerLogos";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";
import {
  statusDetail,
  type ConnectorProviderId,
  type ConnectorStatus,
} from "./connectorStatus";
import { useEnvConnectorStatuses } from "./useEnvConnectorStatuses";

const LOGOS: Record<ConnectorProviderId, typeof LinearLogo> = {
  linear: LinearLogo,
  figma: FigmaLogo,
};

function sourceBadge(source: ConnectorStatus["source"]): {
  label: string;
  variant: "default" | "secondary" | "outline";
} {
  if (source === "oauth") return { label: "Connected", variant: "default" };
  if (source === "env") return { label: "Env key", variant: "secondary" };
  return { label: "Not connected", variant: "outline" };
}

interface ConnectionsClientProps {
  /** Test / screenshot override. Omit in production. */
  statusesOverride?: ReadonlyArray<ConnectorStatus>;
}

function ConnectionsView({
  statuses,
}: {
  statuses: ReadonlyArray<ConnectorStatus> | undefined;
}) {
  const startOAuth = useMutation(api.connectedAccounts.startOAuth);
  const disconnect = useAction(api.connectedAccounts.disconnect);
  const setShared = useMutation(api.connectedAccounts.setShared);
  const [busy, setBusy] = useState<ConnectorProviderId | null>(null);

  const connect = async (provider: ConnectorProviderId) => {
    if (busy) return;
    setBusy(provider);
    try {
      const url = await startOAuth({
        provider,
        returnPath: "/settings/connections",
      });
      window.location.href = url;
    } catch {
      toast.error(
        `Couldn't start ${provider === "linear" ? "Linear" : "Figma"} sign-in`,
        { id: `connector-connect-${provider}` },
      );
      setBusy(null);
    }
  };

  const remove = (provider: ConnectorProviderId) => {
    void withMutationToast(
      disconnect({ provider }),
      "Disconnected",
      "Couldn't disconnect",
      `connector-disconnect-${provider}`,
    );
  };

  return (
    <SettingsPage title="Connections">
      <SettingsSection
        title="Apps"
        description="Sign in to Linear and Figma through Eva. Team API keys remain a fallback — agents use your OAuth account when you have one."
        bodyVariant="list"
      >
        {statuses === undefined ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {statuses.map((status) => {
              const Logo = LOGOS[status.provider];
              const badge = sourceBadge(status.source);
              return (
                <div
                  key={status.provider}
                  className="flex max-sm:flex-wrap items-center gap-3 px-4 py-3"
                >
                  <Logo size={20} className="shrink-0" />
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {status.label}
                      </p>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {statusDetail(status)}
                    </p>
                    {!status.oauthConfigured && status.source !== "oauth" ? (
                      <p className="text-xs text-muted-foreground">
                        Eva {status.label} app is not configured yet. Env key
                        still works.
                      </p>
                    ) : null}
                  </div>
                  {status.source === "oauth" ? (
                    <>
                      <div
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                        title="Teammates can use this connection. They never see the tokens."
                      >
                        Share with team
                        <Switch
                          checked={status.shared}
                          onCheckedChange={(shared) =>
                            catchMutationError(
                              setShared({
                                provider: status.provider,
                                shared,
                              }),
                              "Couldn't update sharing",
                              `connector-share-${status.provider}`,
                            )
                          }
                          aria-label={`Share ${status.label} connection with team`}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => remove(status.provider)}
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      disabled={
                        !status.oauthConfigured || busy === status.provider
                      }
                      onClick={() => void connect(status.provider)}
                    >
                      {busy === status.provider ? "Connecting…" : "Connect"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SettingsSection>
      <p className="px-4 text-xs text-muted-foreground">
        Paste a shared <span className="font-mono">LINEAR_API_KEY</span> or{" "}
        <span className="font-mono">FIGMA_API_KEY</span> on a repo&apos;s
        Environment Variables team tab if you do not want to sign in.
      </p>
    </SettingsPage>
  );
}

function ConnectionsFromServer() {
  const statuses = useQuery(api.connectedAccounts.listStatuses, {});
  return <ConnectionsView statuses={statuses} />;
}

function ConnectionsFromEnv() {
  const statuses = useEnvConnectorStatuses();
  return <ConnectionsView statuses={statuses} />;
}

export function ConnectionsClient({
  statusesOverride,
}: ConnectionsClientProps) {
  if (statusesOverride) {
    return <ConnectionsView statuses={statusesOverride} />;
  }
  return (
    <QueryErrorBoundary fallback={<ConnectionsFromEnv />}>
      <ConnectionsFromServer />
    </QueryErrorBoundary>
  );
}
